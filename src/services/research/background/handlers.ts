import { CONTENT_MESSAGE_TYPES, RESEARCH_MESSAGE_TYPES, UI_EVENT_TYPES } from '@platform/messaging/message-contracts';
import { captureRegionScreenshot } from '@services/research/background/region-screenshot';
import { createResearchTask } from '@services/research/create-research-task';
import { createResearchReport } from '@services/research/create-research-report';
import { runResearchTask } from '@services/research/background/run-research-task';
import { extractCandidateClaims } from '@services/research/background/research-api-client';
import { scheduleResearchPoll } from '@services/research/background/research-job-scheduler';
import {
  buildChatGptResearchPrompt,
  buildChatGptScreenshotResearchPrompt,
  buildTextFirstResearchPrompt,
} from '@services/research/domain/chatgpt-manual-research';
import {
  getEvidenceCard,
  getResearchReport,
  getResearchTask,
  getResearchTasksByReportId,
} from '@services/research/data/storage-idb';
import { CandidateClaimSchema, CaptureRectSchema } from '@services/research/domain/schemas';
import { extractScenarioClaimsFromNumberedList } from '@services/research/domain/candidate-claims';
import { updateEvidenceCardJudgment } from '@services/research/update-evidence-card-judgment';
import { importChatGptResearchResults } from '@services/research/import-chatgpt-research-results';

type AnyRouter = {
  ok: (data: unknown) => any;
  err: (message: string, extra?: unknown) => any;
  register: (type: string, handler: (msg: any, sender?: any) => Promise<any> | any) => void;
  eventsHub?: { broadcast: (type: string, payload: unknown) => void };
};

function boundedViewport(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 100_000) {
    throw new Error('invalid viewport');
  }
  return number;
}

async function prepareWebResearchPrompt(
  tabs: any,
  tabId: number,
  prompt: string,
  provider: 'ChatGPT' | 'Kimi',
  messageType: string,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await tabs.sendMessage(tabId, {
        type: messageType,
        payload: { prompt },
      });
      if (response?.ok && response?.data?.prepared) return;
    } catch (_error) {
      // The content script or web composer may not be ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${provider} 已打开，但研究提示词未能写入输入框。请从 Report 中复制提示词后重试。`);
}

export function registerResearchHandlers(router: AnyRouter) {
  router.register(RESEARCH_MESSAGE_TYPES.OPEN_CHATGPT, async (msg) => {
    const tabs = (globalThis as any).browser?.tabs ?? (globalThis as any).chrome?.tabs;
    if (!tabs?.create) throw new Error('无法打开 ChatGPT 标签页。');
    const tab = await tabs.create({ url: 'https://chatgpt.com/' });
    const prompt = String(msg?.prompt || '').trim();
    if (prompt) {
      const tabId = Number(tab?.id);
      if (!Number.isFinite(tabId)) throw new Error('ChatGPT 已打开，但无法定位新标签页。');
      await prepareWebResearchPrompt(
        tabs,
        tabId,
        prompt,
        'ChatGPT',
        CONTENT_MESSAGE_TYPES.PREPARE_CHATGPT_SCREENSHOT_RESEARCH,
      );
    }
    return router.ok({ opened: true, promptPrepared: Boolean(prompt) });
  });

  router.register(RESEARCH_MESSAGE_TYPES.OPEN_KIMI, async (msg) => {
    const tabs = (globalThis as any).browser?.tabs ?? (globalThis as any).chrome?.tabs;
    if (!tabs?.create) throw new Error('无法打开 Kimi 标签页。');
    const tab = await tabs.create({ url: 'https://www.kimi.com/' });
    const prompt = String(msg?.prompt || '').trim();
    if (prompt) {
      const tabId = Number(tab?.id);
      if (!Number.isFinite(tabId)) throw new Error('Kimi 已打开，但无法定位新标签页。');
      await prepareWebResearchPrompt(
        tabs,
        tabId,
        prompt,
        'Kimi',
        CONTENT_MESSAGE_TYPES.PREPARE_KIMI_SCREENSHOT_RESEARCH,
      );
    }
    return router.ok({ opened: true, promptPrepared: Boolean(prompt) });
  });

  router.register(RESEARCH_MESSAGE_TYPES.EXTRACT_CLAIMS_FROM_TEXT, async (msg) => {
    const selectedText = String(msg?.selectedText || msg?.extractedText || '')
      .trim()
      .slice(0, 20_000);
    if (!selectedText) throw new Error('missing selected text');
    const captureDraft = {
      question: String(msg?.question || '').trim(),
      pageTitle: String(msg?.pageTitle || '').trim(),
      pageUrl: String(msg?.pageUrl || '').trim(),
      selectedText,
      extractedText: selectedText,
      imageDataUrl: '',
      rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
    };
    const explicitScenarios = extractScenarioClaimsFromNumberedList(selectedText);
    if (explicitScenarios.length >= 2) {
      return router.ok({ candidateClaims: explicitScenarios, captureDraft });
    }
    const extracted = await extractCandidateClaims({
      pageTitle: captureDraft.pageTitle,
      pageUrl: captureDraft.pageUrl || null,
      selectedText,
      extractedText: selectedText,
      researchContext: captureDraft.question,
    });
    return router.ok({ candidateClaims: extracted.claims, captureDraft });
  });

  router.register(RESEARCH_MESSAGE_TYPES.CAPTURE_REGION_FOR_CHATGPT, async (msg, sender) => {
    const rect = CaptureRectSchema.parse(msg?.rect);
    const viewportWidth = boundedViewport(msg?.viewportWidth);
    const viewportHeight = boundedViewport(msg?.viewportHeight);
    const windowId = Number(sender?.tab?.windowId);
    const imageDataUrl = await captureRegionScreenshot({
      windowId: Number.isFinite(windowId) ? windowId : null,
      rect,
      viewportWidth,
      viewportHeight,
    });
    return router.ok({
      captureDraft: {
        question: String(msg?.question || '').trim(),
        pageTitle: String(msg?.pageTitle || '').trim(),
        pageUrl: String(msg?.pageUrl || '').trim(),
        selectedText: String(msg?.selectedText || '').trim(),
        extractedText: String(msg?.extractedText || '').trim(),
        imageDataUrl,
        rect,
      },
    });
  });

  router.register(RESEARCH_MESSAGE_TYPES.EXTRACT_CLAIMS_FROM_REGION, async (msg, sender) => {
    const rect = CaptureRectSchema.parse(msg?.rect);
    const viewportWidth = boundedViewport(msg?.viewportWidth);
    const viewportHeight = boundedViewport(msg?.viewportHeight);
    const windowId = Number(sender?.tab?.windowId);
    const imageDataUrl = await captureRegionScreenshot({
      windowId: Number.isFinite(windowId) ? windowId : null,
      rect,
      viewportWidth,
      viewportHeight,
    });
    const captureDraft = {
      question: String(msg?.question || '').trim(),
      pageTitle: String(msg?.pageTitle || '').trim(),
      pageUrl: String(msg?.pageUrl || '').trim(),
      selectedText: String(msg?.selectedText || '').trim(),
      extractedText: String(msg?.extractedText || '').trim(),
      imageDataUrl,
      rect,
    };
    const explicitScenarios = extractScenarioClaimsFromNumberedList(captureDraft.extractedText);
    if (explicitScenarios.length >= 2) {
      return router.ok({ candidateClaims: explicitScenarios, captureDraft });
    }
    const extracted = await extractCandidateClaims({
      pageTitle: captureDraft.pageTitle,
      pageUrl: captureDraft.pageUrl || null,
      selectedText: captureDraft.selectedText,
      extractedText: captureDraft.extractedText,
      imageDataUrl,
      researchContext: captureDraft.question,
    });
    return router.ok({ candidateClaims: extracted.claims, captureDraft });
  });

  router.register(RESEARCH_MESSAGE_TYPES.CREATE_REPORT_FROM_REGION, async (msg) => {
    const draft = msg?.captureDraft;
    const candidateClaims = Array.isArray(msg?.candidateClaims)
      ? msg.candidateClaims.map((claim: unknown) => CandidateClaimSchema.parse(claim))
      : [];
    const created = await createResearchReport({
      candidateClaims,
      executionMode: msg?.executionMode,
      pageTitle: draft?.pageTitle,
      pageUrl: draft?.pageUrl,
      selectedText: draft?.selectedText,
      extractedText: draft?.extractedText,
      researchContext: draft?.question,
      imageDataUrl: String(draft?.imageDataUrl || ''),
      rect: CaptureRectSchema.parse(draft?.rect),
    });
    router.eventsHub?.broadcast(UI_EVENT_TYPES.CONVERSATIONS_CHANGED, {
      reason: 'researchReportCreated',
      conversationId: created.report.conversationId,
    });
    if (created.report.executionMode === 'api') {
      for (const task of created.tasks) {
        void runResearchTask(task.id).finally(() => {
          scheduleResearchPoll();
          router.eventsHub?.broadcast(UI_EVENT_TYPES.CONVERSATIONS_CHANGED, {
            reason: 'researchTaskUpdated',
            conversationId: created.report.conversationId,
          });
        });
      }
    }
    return router.ok({
      ...created,
      ...(created.report.executionMode === 'chatgpt_manual' || created.report.executionMode === 'kimi_manual'
        ? { chatGptPrompt: buildChatGptResearchPrompt({ report: created.report, tasks: created.tasks }) }
        : created.report.executionMode === 'chatgpt_text' || created.report.executionMode === 'kimi_text'
          ? { chatGptPrompt: buildTextFirstResearchPrompt({ report: created.report }) }
          : created.report.executionMode === 'chatgpt_screenshot' || created.report.executionMode === 'kimi_screenshot'
            ? { chatGptPrompt: buildChatGptScreenshotResearchPrompt({ report: created.report }) }
            : null),
    });
  });

  router.register(RESEARCH_MESSAGE_TYPES.CREATE_FROM_REGION, async (msg, sender) => {
    const rect = CaptureRectSchema.parse(msg?.rect);
    const viewportWidth = boundedViewport(msg?.viewportWidth);
    const viewportHeight = boundedViewport(msg?.viewportHeight);
    const windowId = Number(sender?.tab?.windowId);

    const imageDataUrl = await captureRegionScreenshot({
      windowId: Number.isFinite(windowId) ? windowId : null,
      rect,
      viewportWidth,
      viewportHeight,
    });
    const task = await createResearchTask({
      question: msg?.question,
      pageTitle: msg?.pageTitle,
      pageUrl: msg?.pageUrl,
      selectedText: msg?.selectedText,
      extractedText: msg?.extractedText,
      imageDataUrl,
      rect,
    });
    router.eventsHub?.broadcast(UI_EVENT_TYPES.CONVERSATIONS_CHANGED, {
      reason: 'researchTaskCreated',
      conversationId: task.conversationId,
    });
    void runResearchTask(task.id).finally(() => {
      scheduleResearchPoll();
      router.eventsHub?.broadcast(UI_EVENT_TYPES.CONVERSATIONS_CHANGED, {
        reason: 'researchTaskUpdated',
        conversationId: task.conversationId,
      });
    });
    return router.ok(task);
  });

  router.register(RESEARCH_MESSAGE_TYPES.GET_TASK, async (msg) => {
    const taskId = String(msg?.taskId || '').trim();
    if (!taskId) return router.err('missing taskId');
    return router.ok(await getResearchTask(taskId));
  });

  router.register(RESEARCH_MESSAGE_TYPES.GET_REPORT, async (msg) => {
    const reportId = String(msg?.reportId || '').trim();
    if (!reportId) return router.err('missing reportId');
    const report = await getResearchReport(reportId);
    if (!report) return router.ok(null);
    const tasks = await getResearchTasksByReportId(reportId);
    const cards = (
      await Promise.all(tasks.map((task) => (task.cardId ? getEvidenceCard(task.cardId) : Promise.resolve(null))))
    ).filter(Boolean);
    return router.ok({ report, tasks, cards });
  });

  router.register(RESEARCH_MESSAGE_TYPES.GET_CARD, async (msg) => {
    const cardId = String(msg?.cardId || '').trim();
    if (!cardId) return router.err('missing cardId');
    return router.ok(await getEvidenceCard(cardId));
  });

  router.register(RESEARCH_MESSAGE_TYPES.IMPORT_CHATGPT_RESULTS, async (msg) => {
    const result = await importChatGptResearchResults({
      reportId: String(msg?.reportId || '').trim(),
      pastedText: String(msg?.pastedText || ''),
    });
    router.eventsHub?.broadcast(UI_EVENT_TYPES.CONVERSATIONS_CHANGED, {
      reason: 'chatGptResearchImported',
      conversationId: null,
    });
    return router.ok(result);
  });

  router.register(RESEARCH_MESSAGE_TYPES.UPDATE_JUDGMENT, async (msg) => {
    const card = await updateEvidenceCardJudgment({
      cardId: String(msg?.cardId || '').trim(),
      decision: msg?.decision,
      note: msg?.note,
      nextAction: msg?.nextAction,
    });
    router.eventsHub?.broadcast(UI_EVENT_TYPES.CONVERSATIONS_CHANGED, {
      reason: 'researchJudgmentUpdated',
      conversationId: null,
    });
    return router.ok(card);
  });
}
