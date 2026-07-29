import { t } from '@i18n';
import { hydrateChatgptDeepResearchSnapshot } from '@collectors/chatgpt/chatgpt-deep-research-hydrator';
import { resolveActiveOrInpageCollector, type CollectorRegistryLike } from '@collectors/registry';
import { DISCOURSE_OP_NOT_FOUND_ERROR, isDiscourseOpNotFoundErrorMessage } from '@collectors/web/article-fetch-errors';
import { ARTICLE_MESSAGE_TYPES, CORE_MESSAGE_TYPES } from '@platform/messaging/message-contracts';
import { buildCaptureSuccessTipMessage } from '@services/shared/capture-tip';
import { RESEARCH_MESSAGE_TYPES } from '@platform/messaging/message-contracts';
import {
  findLatestChatGptResearchImport,
  type FoundChatGptResearchImport,
} from '@services/research/domain/chatgpt-manual-research';

type RuntimeClient = {
  send?: (type: string, payload?: Record<string, unknown>) => Promise<any>;
};

type CurrentPageCaptureDeps = {
  runtime: RuntimeClient | null;
  collectorsRegistry: CollectorRegistryLike | null;
};

export type CurrentPageCaptureProgress = {
  kind?: 'default' | 'error';
  message: string;
};

export type CurrentPageCaptureState = {
  available: boolean;
  kind: 'chat' | 'article' | 'unsupported';
  label: string;
  collectorId: string | null;
  reason?: string;
};

export type CurrentPageCaptureResult = {
  kind: 'chat' | 'article';
  label: string;
  collectorId: string | null;
  conversationId: number | null;
  title?: string;
  isNew?: boolean;
};

export type ChatGptResearchImportPreview = {
  providerId: 'chatgpt' | 'kimi';
  providerName: 'ChatGPT' | 'Kimi';
  reportId: string;
  taskCount: number;
  evidenceCount: number;
  taskTitles: string[];
  conversationTitle: string;
};

type PendingChatGptResearchImport = {
  snapshot: any;
  found: FoundChatGptResearchImport;
  providerId: 'chatgpt' | 'kimi';
};

function errorMessage(error: unknown, fallback: string): string {
  const maybeError = error as { message?: unknown };
  const message = maybeError?.message ?? error;
  const normalized = String(message || fallback || t('captureFailedFallback')).trim();
  return normalized || fallback || t('captureFailedFallback');
}

function normalizeArticleCaptureErrorMessage(raw: unknown): string {
  const message = String(raw || '').trim();
  if (!message) return '';
  if (isDiscourseOpNotFoundErrorMessage(message)) return DISCOURSE_OP_NOT_FOUND_ERROR;
  return message;
}

function normalizeConversationId(value: unknown): number | null {
  const conversationId = Number(value);
  if (!Number.isFinite(conversationId) || conversationId <= 0) return null;
  return conversationId;
}

function manualResearchImportErrorMessage(raw: unknown, providerName: 'ChatGPT' | 'Kimi'): string {
  const message = String(raw || '').trim();
  if (message === 'invalid_change_rate') {
    return '部分证据的变化率与原始数值不一致，无法导入。请重新生成结果，无法确认的 changeRate 应填写 null。';
  }
  return message || `导入 ${providerName} 研究结果失败。`;
}

export function createCurrentPageCaptureService(deps: CurrentPageCaptureDeps) {
  const runtime = deps.runtime;
  const collectorsRegistry = deps.collectorsRegistry;
  let pendingChatGptResearchImport: PendingChatGptResearchImport | null = null;

  function send(type: string, payload?: Record<string, unknown>) {
    if (!runtime || typeof runtime.send !== 'function') {
      return Promise.reject(new Error('runtime client unavailable'));
    }
    return runtime.send(type, payload);
  }

  function resolveCaptureTarget() {
    const collector = resolveActiveOrInpageCollector(collectorsRegistry);
    if (!collector) {
      return {
        available: false,
        kind: 'unsupported' as const,
        label: t('unavailable'),
        collectorId: null,
        reason: t('currentPageCannotBeCaptured'),
        collector: null,
      };
    }

    if (collector.id === 'web') {
      return {
        available: true,
        kind: 'article' as const,
        label: t('fetchArticle'),
        collectorId: 'web',
        collector,
      };
    }

    return {
      available: true,
      kind: 'chat' as const,
      label: t('fetchAiChat'),
      collectorId: collector.id,
      collector,
    };
  }

  async function saveSnapshot(snapshot: any) {
    if (!snapshot || !snapshot.conversation) return null;

    const conversationRes = await send(CORE_MESSAGE_TYPES.UPSERT_CONVERSATION, {
      payload: snapshot.conversation,
    });
    if (!conversationRes?.ok) {
      throw new Error(conversationRes?.error?.message || 'upsertConversation failed');
    }

    const conversation = conversationRes.data;
    const messagesRes = await send(CORE_MESSAGE_TYPES.SYNC_CONVERSATION_MESSAGES, {
      conversationId: conversation.id,
      messages: snapshot.messages || [],
      mode: 'snapshot',
      diff: null,
      conversationSourceType: snapshot?.conversation?.sourceType || 'chat',
      conversationUrl: snapshot?.conversation?.url || '',
    });
    if (!messagesRes?.ok) {
      throw new Error(messagesRes?.error?.message || 'syncConversationMessages failed');
    }

    const rawIsNew = (conversation as any)?.__isNew;
    return {
      conversationId: normalizeConversationId(conversation.id),
      isNew: typeof rawIsNew === 'boolean' ? rawIsNew : undefined,
    };
  }

  async function hydrateChatGptSnapshot(snapshot: any): Promise<void> {
    try {
      const isChatgpt =
        String(snapshot?.conversation?.source || '')
          .trim()
          .toLowerCase() === 'chatgpt';
      const hasDeepResearchPlaceholders =
        isChatgpt &&
        Array.isArray(snapshot?.messages) &&
        snapshot.messages.some((message: any) =>
          String(message?.contentText || message?.contentMarkdown || '')
            .trim()
            .startsWith('Deep Research (iframe):'),
        );
      if (hasDeepResearchPlaceholders) {
        await hydrateChatgptDeepResearchSnapshot(snapshot, send);
      }
    } catch (_error) {
      // Deep Research hydration is best effort; ordinary ChatGPT messages remain importable.
    }
  }

  async function captureManualResearchSnapshot(): Promise<{
    snapshot: any;
    providerId: 'chatgpt' | 'kimi';
    providerName: 'ChatGPT' | 'Kimi';
  }> {
    const target = resolveCaptureTarget();
    if (!target.available || !target.collector || (target.collectorId !== 'chatgpt' && target.collectorId !== 'kimi')) {
      throw new Error('请先打开包含研究结果的 ChatGPT 或 Kimi 对话。');
    }
    if (typeof target.collector.prepareManualCapture === 'function') {
      await target.collector.prepareManualCapture();
    }
    const snapshot = await Promise.resolve(target.collector.capture({ manual: true }));
    if (!snapshot || !Array.isArray(snapshot.messages) || !snapshot.messages.length) {
      throw new Error(t('noVisibleConversationFound'));
    }
    if (target.collectorId === 'chatgpt') await hydrateChatGptSnapshot(snapshot);
    return {
      snapshot,
      providerId: target.collectorId,
      providerName: target.collectorId === 'kimi' ? 'Kimi' : 'ChatGPT',
    };
  }

  async function previewCurrentChatGptResearch(): Promise<ChatGptResearchImportPreview> {
    const { snapshot, providerId, providerName } = await captureManualResearchSnapshot();
    const found = findLatestChatGptResearchImport(snapshot.messages);
    if (!found) {
      pendingChatGptResearchImport = null;
      throw new Error(`当前 ${providerName} 对话中没有找到可导入的 Snap Research 结构化结果。`);
    }
    pendingChatGptResearchImport = { snapshot, found, providerId };
    return {
      providerId,
      providerName,
      reportId: found.parsed.reportId,
      taskCount: found.parsed.results.length,
      evidenceCount: found.parsed.results.reduce((total, result) => total + result.evidence.length, 0),
      taskTitles: found.parsed.results.map((result) => result.title),
      conversationTitle: String(snapshot?.conversation?.title || '').trim() || `${providerName} Research`,
    };
  }

  async function importCurrentChatGptResearch(input?: { saveConversation?: boolean }) {
    if (!pendingChatGptResearchImport) {
      throw new Error('请先预览当前 ChatGPT 或 Kimi 研究结果。');
    }
    const pending = pendingChatGptResearchImport;
    const response = await send(RESEARCH_MESSAGE_TYPES.IMPORT_CHATGPT_RESULTS, {
      reportId: pending.found.parsed.reportId,
      pastedText: pending.found.pastedText,
    });
    if (!response?.ok) {
      const providerName = pending.providerId === 'kimi' ? 'Kimi' : 'ChatGPT';
      throw new Error(manualResearchImportErrorMessage(response?.error?.message, providerName));
    }

    let conversationId: number | null = null;
    if (input?.saveConversation !== false) {
      const saved = await saveSnapshot(pending.snapshot);
      conversationId = normalizeConversationId(saved?.conversationId);
    }
    pendingChatGptResearchImport = null;
    return {
      ...response.data,
      reportId: pending.found.parsed.reportId,
      conversationId,
    };
  }

  async function captureCurrentPage(input?: {
    onProgress?: (progress: CurrentPageCaptureProgress) => void;
  }): Promise<CurrentPageCaptureResult> {
    const onProgress = input?.onProgress;
    const target = resolveCaptureTarget();

    if (!target.available || !target.collector) {
      throw new Error(target.reason || t('currentPageCannotBeCaptured'));
    }

    const report = (message: string, kind?: 'default' | 'error') => {
      onProgress?.({ message, kind });
    };

    try {
      if (target.kind === 'article') {
        const response = await send(ARTICLE_MESSAGE_TYPES.FETCH_ACTIVE_TAB);
        if (!response?.ok) {
          const normalizedError = normalizeArticleCaptureErrorMessage(response?.error?.message);
          throw new Error(normalizedError || t('captureFailedFallback'));
        }
        const title = String(response?.data?.title || '');
        const isNew = response?.data?.isNew !== false;
        report(buildCaptureSuccessTipMessage({ isNew, title }), 'default');
        return {
          kind: 'article',
          label: target.label,
          collectorId: target.collectorId,
          conversationId: normalizeConversationId(response?.data?.conversationId),
          title: String(title || '').trim() || undefined,
          isNew,
        };
      }

      if (typeof target.collector.prepareManualCapture === 'function') {
        await target.collector.prepareManualCapture();
      }

      const snapshot = await Promise.resolve(target.collector.capture({ manual: true }));
      if (!snapshot) {
        throw new Error(t('noVisibleConversationFound'));
      }

      await hydrateChatGptSnapshot(snapshot);

      const saved = await saveSnapshot(snapshot);
      if (!saved) {
        throw new Error(t('noVisibleConversationFound'));
      }

      const title = String(snapshot?.conversation?.title || '');
      const isNew = saved.isNew !== false;
      report(buildCaptureSuccessTipMessage({ isNew, title }), 'default');
      return {
        kind: 'chat',
        label: target.label,
        collectorId: target.collectorId,
        conversationId: normalizeConversationId(saved.conversationId),
        title: String(title || '').trim() || undefined,
        isNew,
      };
    } catch (error) {
      report(errorMessage(error, t('captureFailedFallback')), 'error');
      throw error;
    }
  }

  function getCurrentPageCaptureState(): CurrentPageCaptureState {
    const target = resolveCaptureTarget();
    return {
      available: target.available,
      kind: target.kind,
      label: target.label,
      collectorId: target.collectorId,
      reason: target.reason,
    };
  }

  return {
    captureCurrentPage,
    getCurrentPageCaptureState,
    previewCurrentChatGptResearch,
    importCurrentChatGptResearch,
  };
}

export type CurrentPageCaptureService = ReturnType<typeof createCurrentPageCaptureService>;
