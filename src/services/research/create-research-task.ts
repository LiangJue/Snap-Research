import { syncConversationMessages, upsertConversation } from '@services/conversations/data/storage-idb';
import { inlineChatImagesInMessages } from '@services/conversations/data/image-inline';
import { putResearchTask } from '@services/research/data/storage-idb';
import { ResearchTaskSchema, type ResearchTask } from '@services/research/domain/schemas';

function createId(): string {
  try {
    return crypto.randomUUID();
  } catch (_error) {
    return `research-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function taskMarkdown(input: { question: string | null; pageTitle: string; imageDataUrl: string }): string {
  return [
    '# 研究任务已创建',
    '',
    `![原始截图](${input.imageDataUrl})`,
    '',
    `**研究问题：** ${input.question || '请根据截图识别并核查最重要的主张。'}`,
    '',
    `**来源页面：** ${input.pageTitle || '未命名页面'}`,
    '',
    '状态：等待后台研究。',
  ].join('\n');
}

export async function createResearchTask(input: {
  question?: string | null;
  pageTitle?: string | null;
  pageUrl?: string | null;
  selectedText?: string | null;
  extractedText?: string | null;
  imageDataUrl: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}): Promise<ResearchTask> {
  const id = createId();
  const now = new Date().toISOString();
  const question =
    String(input.question || '')
      .trim()
      .slice(0, 300) || null;
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

  const conversation = await upsertConversation({
    sourceType: 'research',
    source: 'research',
    conversationKey: `research:${id}`,
    listSourceKey: 'research',
    listSiteKey: pageSiteKey(pageUrl),
    title: `研究中 · ${pageTitle || question || '截图线索'}`.slice(0, 120),
    ...(pageUrl ? { url: pageUrl } : null),
    researchTaskId: id,
    researchStatus: 'queued',
    researchQuestion: question || '',
    lastCapturedAt: Date.now(),
  });
  const conversationId = Number(conversation.id);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    throw new Error('failed to create research task conversation');
  }

  const message = {
    messageKey: `research-task:${id}`,
    role: 'assistant',
    authorName: 'Snap Research',
    contentText: question || '研究截图中的主要主张',
    contentMarkdown: taskMarkdown({ question, pageTitle, imageDataUrl: input.imageDataUrl }),
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

  const task = ResearchTaskSchema.parse({
    id,
    status: 'queued',
    question,
    claim: null,
    capture: {
      pageTitle,
      pageUrl,
      capturedAt: now,
      imageAssetId: imageAssetIdFromMarkdown(String(savedMessage.contentMarkdown || '')),
      rect: input.rect,
      selectedText,
      extractedText,
    },
    cardId: null,
    backendJobId: null,
    conversationId,
    attempt: 0,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
  });
  await putResearchTask(task);
  return task;
}
