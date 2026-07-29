import { syncConversationMessages, upsertConversation } from '@services/conversations/data/storage-idb';
import { inlineChatImagesInMessages } from '@services/conversations/data/image-inline';
import { putResearchReport, putResearchTask } from '@services/research/data/storage-idb';
import {
  CandidateClaimSchema,
  ResearchReportSchema,
  ResearchTaskSchema,
  type CandidateClaim,
  type ResearchExecutionMode,
  type ResearchReport,
  type ResearchTask,
} from '@services/research/domain/schemas';
import {
  isSourceFirstResearchMode,
  isTextFirstResearchMode,
  manualResearchProviderForMode,
  manualResearchProviderName,
} from '@services/research/domain/manual-research-provider';

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch (_error) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function pageSiteKey(pageUrl: string | null): string {
  if (!pageUrl) return 'unknown';
  try {
    const host = new URL(pageUrl).hostname.trim().toLowerCase();
    return host ? `domain:${host}` : 'unknown';
  } catch (_error) {
    return 'unknown';
  }
}

function imageAssetIdFromMarkdown(markdown: string): number | null {
  const match = markdown.match(/syncnos-asset:\/\/(\d+)/i);
  const id = Number(match?.[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function buildResearchReportMarkdown(input: {
  imageDataUrl: string;
  pageTitle: string;
  claims: CandidateClaim[];
  executionMode: ResearchExecutionMode;
  researchContext: string;
  statusText?: string;
}): string {
  const waitingForSourceClaims = isSourceFirstResearchMode(input.executionMode) && input.claims.length === 0;
  const sourceName = isTextFirstResearchMode(input.executionMode) ? '所选文字' : '原始截图';
  const provider = manualResearchProviderForMode(input.executionMode);
  const providerName = provider ? manualResearchProviderName(provider) : 'ChatGPT';
  return [
    '# Research Report',
    ...(input.imageDataUrl ? ['', `![原始截图](${input.imageDataUrl})`] : []),
    '',
    `**来源页面：** ${input.pageTitle || '未命名页面'}`,
    ...(input.researchContext ? ['', `**补充研究范围或背景：** ${input.researchContext}`] : []),
    '',
    '## 已选择的论点',
    '',
    ...(waitingForSourceClaims
      ? [`等待 ${providerName} 从${sourceName}中拆分可核查论点。`]
      : input.claims.map((claim) => `- [x] ${claim.text}`)),
    '',
    input.statusText ||
      (input.executionMode === 'api' ? '状态：研究任务排队中。' : `状态：等待从 ${providerName} 导入结构化研究结果。`),
  ].join('\n');
}

export async function createResearchReport(input: {
  candidateClaims: CandidateClaim[];
  pageTitle?: string | null;
  pageUrl?: string | null;
  selectedText?: string | null;
  extractedText?: string | null;
  researchContext?: string | null;
  imageDataUrl?: string | null;
  executionMode?: ResearchExecutionMode;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}): Promise<{ report: ResearchReport; tasks: ResearchTask[] }> {
  const candidateClaims = input.candidateClaims.map((claim) => CandidateClaimSchema.parse(claim));
  const selectedClaims = candidateClaims.filter((claim) => claim.selected);
  const executionMode =
    input.executionMode === 'chatgpt_manual' ||
    input.executionMode === 'kimi_manual' ||
    input.executionMode === 'chatgpt_text' ||
    input.executionMode === 'kimi_text' ||
    input.executionMode === 'chatgpt_screenshot' ||
    input.executionMode === 'kimi_screenshot'
      ? input.executionMode
      : 'api';
  const provider = manualResearchProviderForMode(executionMode);
  const providerName = provider ? manualResearchProviderName(provider) : 'ChatGPT';
  if (!selectedClaims.length && !isSourceFirstResearchMode(executionMode)) {
    throw new Error('至少选择一个要研究的论点');
  }

  const reportId = createId('report');
  const now = new Date().toISOString();
  const pageTitle = String(input.pageTitle || '')
    .trim()
    .slice(0, 500);
  const pageUrl = String(input.pageUrl || '').trim() || null;
  const selectedText = String(input.selectedText || '')
    .trim()
    .slice(0, 20_000);
  const extractedText = String(input.extractedText || '')
    .trim()
    .slice(0, 20_000);
  const researchContext = String(input.researchContext || '')
    .trim()
    .slice(0, 300);
  const conversation = await upsertConversation({
    sourceType: 'research',
    source: 'research',
    conversationKey: `research-report:${reportId}`,
    listSourceKey: 'research',
    listSiteKey: pageSiteKey(pageUrl),
    title: `${executionMode === 'api' ? '研究中' : `等待 ${providerName} 研究`} · ${
      pageTitle || selectedClaims[0]?.text || '截图'
    }`.slice(0, 120),
    ...(pageUrl ? { url: pageUrl } : null),
    researchReportId: reportId,
    researchStatus: executionMode === 'api' ? 'queued' : 'captured',
    lastCapturedAt: Date.now(),
  });
  const conversationId = Number(conversation.id);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    throw new Error('failed to create research report conversation');
  }

  const imageDataUrl = String(input.imageDataUrl || '').trim();
  const message = {
    messageKey: `research-report:${reportId}`,
    role: 'assistant',
    authorName: 'Snap Research',
    contentText: isSourceFirstResearchMode(executionMode)
      ? `等待 ${providerName} 从${isTextFirstResearchMode(executionMode) ? '所选文字' : '截图'}拆分并研究论点`
      : `${selectedClaims.length} 个论点等待研究`,
    contentMarkdown: buildResearchReportMarkdown({
      imageDataUrl,
      pageTitle,
      claims: selectedClaims,
      executionMode,
      researchContext,
    }),
    sequence: 0,
    updatedAt: Date.now(),
  };
  const inlined = await inlineChatImagesInMessages({
    conversationId,
    conversationUrl: pageUrl || undefined,
    messages: [message],
    enableHttpImages: false,
  });
  const savedMessage = inlined.messages[0] || message;
  await syncConversationMessages(conversationId, [savedMessage], { mode: 'snapshot' });
  const imageAssetId = imageAssetIdFromMarkdown(String(savedMessage.contentMarkdown || ''));
  const capture = {
    pageTitle,
    pageUrl,
    capturedAt: now,
    imageAssetId,
    rect: input.rect,
    selectedText,
    extractedText,
    researchContext,
  };
  const tasks = selectedClaims.map((claim, index) =>
    ResearchTaskSchema.parse({
      id: createId('research'),
      reportId,
      status: executionMode === 'api' ? 'queued' : 'captured',
      question: `核查这个论点：${claim.text}`.slice(0, 300),
      claim: claim.text,
      capture,
      cardId: null,
      backendJobId: null,
      conversationId,
      attempt: 0,
      errorCode: null,
      createdAt: new Date(Date.parse(now) + index).toISOString(),
      updatedAt: now,
    }),
  );
  const report = ResearchReportSchema.parse({
    id: reportId,
    status: 'researching',
    executionMode,
    capture,
    candidateClaims,
    taskIds: tasks.map((task) => task.id),
    conversationId,
    createdAt: now,
    updatedAt: now,
  });

  await putResearchReport(report);
  for (const task of tasks) await putResearchTask(task);
  return { report, tasks };
}
