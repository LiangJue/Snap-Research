import { CONTENT_MESSAGE_TYPES, RESEARCH_MESSAGE_TYPES } from '@platform/messaging/message-contracts';
import { insertChatGptResearchPrompt } from '@services/research/content/chatgpt-composer-prompt';
import { insertKimiResearchPrompt } from '@services/research/content/kimi-composer-prompt';
import type { CandidateClaim, ResearchExecutionMode } from '@services/research/domain/schemas';

export type RegionCaptureSubmission = {
  question: string;
  pageTitle: string;
  pageUrl: string;
  selectedText: string;
  extractedText: string;
  viewportWidth: number;
  viewportHeight: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    devicePixelRatio: number;
  };
};

type RuntimeClient = {
  send: (type: string, payload?: Record<string, unknown>) => Promise<any>;
};

export type ResearchCaptureOverlay = {
  open: (input: {
    onOpenChatGpt: (prompt?: string) => Promise<void>;
    onOpenKimi: (prompt?: string) => Promise<void>;
    onCaptureForChatGpt?: (submission: RegionCaptureSubmission) => Promise<{ captureDraft: Record<string, unknown> }>;
    onExtract: (
      submission: RegionCaptureSubmission,
    ) => Promise<{ candidateClaims: CandidateClaim[]; captureDraft: Record<string, unknown> }>;
    onCreate: (input: {
      candidateClaims: CandidateClaim[];
      captureDraft: Record<string, unknown>;
      executionMode: ResearchExecutionMode;
    }) => Promise<{ chatGptPrompt?: string }>;
  }) => void;
  openTextSelection: (input: {
    onOpenChatGpt: (prompt?: string) => Promise<void>;
    onOpenKimi: (prompt?: string) => Promise<void>;
    source: {
      selectionText: string;
      pageTitle: string;
      pageUrl: string;
    };
    onExtract: (
      submission: RegionCaptureSubmission,
    ) => Promise<{ candidateClaims: CandidateClaim[]; captureDraft: Record<string, unknown> }>;
    onCreate: (input: {
      candidateClaims: CandidateClaim[];
      captureDraft: Record<string, unknown>;
      executionMode: ResearchExecutionMode;
    }) => Promise<{ chatGptPrompt?: string }>;
  }) => void;
};

export function registerResearchCaptureContentHandlers(runtime: RuntimeClient, overlay: ResearchCaptureOverlay) {
  const onMessage = (globalThis as any).chrome?.runtime?.onMessage ?? (globalThis as any).browser?.runtime?.onMessage;
  if (!onMessage?.addListener) return { cleanup: () => {} };

  const listener = (msg: any, _sender: any, sendResponse: (value: any) => void) => {
    if (msg?.type === CONTENT_MESSAGE_TYPES.PREPARE_CHATGPT_SCREENSHOT_RESEARCH) {
      const prepared = insertChatGptResearchPrompt(String(msg?.payload?.prompt || ''));
      sendResponse?.({
        ok: prepared,
        data: { prepared },
        error: prepared ? null : { message: 'ChatGPT 输入框尚未就绪' },
      });
      return false;
    }
    if (msg?.type === CONTENT_MESSAGE_TYPES.PREPARE_KIMI_SCREENSHOT_RESEARCH) {
      const prepared = insertKimiResearchPrompt(String(msg?.payload?.prompt || ''));
      sendResponse?.({
        ok: prepared,
        data: { prepared },
        error: prepared ? null : { message: 'Kimi 输入框尚未就绪' },
      });
      return false;
    }
    if (
      msg?.type !== CONTENT_MESSAGE_TYPES.OPEN_RESEARCH_CAPTURE &&
      msg?.type !== CONTENT_MESSAGE_TYPES.OPEN_RESEARCH_TEXT_SELECTION
    ) {
      return undefined;
    }

    const createReport = async (input: {
      candidateClaims: CandidateClaim[];
      captureDraft: Record<string, unknown>;
      executionMode: ResearchExecutionMode;
    }) => {
      const response = await runtime.send(RESEARCH_MESSAGE_TYPES.CREATE_REPORT_FROM_REGION, input);
      if (!response?.ok) throw new Error(response?.error?.message || '创建 Research Report 失败');
      return { chatGptPrompt: String(response?.data?.chatGptPrompt || '') || undefined };
    };
    const openChatGpt = async (prompt?: string) => {
      const response = await runtime.send(RESEARCH_MESSAGE_TYPES.OPEN_CHATGPT, {
        ...(prompt ? { prompt } : null),
      });
      if (!response?.ok) throw new Error(response?.error?.message || '无法打开 ChatGPT');
    };
    const openKimi = async (prompt?: string) => {
      const response = await runtime.send(RESEARCH_MESSAGE_TYPES.OPEN_KIMI, {
        ...(prompt ? { prompt } : null),
      });
      if (!response?.ok) throw new Error(response?.error?.message || '无法打开 Kimi');
    };

    if (msg.type === CONTENT_MESSAGE_TYPES.OPEN_RESEARCH_TEXT_SELECTION) {
      const source = {
        selectionText: String(msg?.payload?.selectionText || '')
          .trim()
          .slice(0, 20_000),
        pageTitle: String(msg?.payload?.pageTitle || '')
          .trim()
          .slice(0, 500),
        pageUrl: String(msg?.payload?.pageUrl || '').trim(),
      };
      if (!source.selectionText) return undefined;
      overlay.openTextSelection({
        onOpenChatGpt: openChatGpt,
        onOpenKimi: openKimi,
        source,
        onExtract: async (submission) => {
          const response = await runtime.send(RESEARCH_MESSAGE_TYPES.EXTRACT_CLAIMS_FROM_TEXT, {
            question: submission.question,
            pageTitle: source.pageTitle,
            pageUrl: source.pageUrl,
            selectedText: source.selectionText,
            extractedText: source.selectionText,
          });
          if (!response?.ok) throw new Error(response?.error?.message || '提取论点失败');
          return response.data;
        },
        onCreate: createReport,
      });
      sendResponse?.({ ok: true, data: { opened: true }, error: null });
      return false;
    }

    overlay.open({
      onOpenChatGpt: openChatGpt,
      onOpenKimi: openKimi,
      onCaptureForChatGpt: async (submission) => {
        const response = await runtime.send(RESEARCH_MESSAGE_TYPES.CAPTURE_REGION_FOR_CHATGPT, submission);
        if (!response?.ok) throw new Error(response?.error?.message || '截取图片失败');
        return response.data;
      },
      onExtract: async (submission) => {
        const response = await runtime.send(RESEARCH_MESSAGE_TYPES.EXTRACT_CLAIMS_FROM_REGION, submission);
        if (!response?.ok) throw new Error(response?.error?.message || '提取论点失败');
        return response.data;
      },
      onCreate: createReport,
    });
    sendResponse?.({ ok: true, data: { opened: true }, error: null });
    return false;
  };

  onMessage.addListener(listener);
  return {
    cleanup: () => {
      try {
        onMessage.removeListener?.(listener);
      } catch (_error) {
        // ignore
      }
    },
  };
}
