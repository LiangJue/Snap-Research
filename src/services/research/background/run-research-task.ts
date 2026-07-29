import { getImageCacheAssetById } from '@services/conversations/data/image-cache-read';
import { upsertConversation } from '@services/conversations/data/storage-idb';
import { getResearchTask, putResearchTask } from '@services/research/data/storage-idb';
import { validateResearchResult } from '@services/research/domain/research-result';
import { EvidenceCardSchema, ResearchTaskSchema, type ResearchTask } from '@services/research/domain/schemas';
import {
  getResearchJob,
  requestResearch,
  ResearchApiError,
  startResearchJob,
  type ResearchApiRequest,
} from '@services/research/background/research-api-client';
import { saveEvidenceCard } from '@services/research/save-evidence-card';

type ResearchOutput = Awaited<ReturnType<typeof requestResearch>>;

function createId(): string {
  try {
    return crypto.randomUUID();
  } catch (_error) {
    return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function claimCandidate(task: ResearchTask): string | null {
  const selected = task.capture.selectedText.trim();
  if (selected && selected.length <= 500) return selected;
  const extracted = task.capture.extractedText.trim();
  if (!extracted) return null;
  const firstLine = extracted.split(/\n|(?<=[。！？.!?])\s+/)[0]?.trim() || '';
  return firstLine.slice(0, 500) || null;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

async function updateConversationStatus(task: ResearchTask, status: string, title?: string) {
  await upsertConversation({
    sourceType: 'research',
    source: 'research',
    conversationKey: task.reportId ? `research-report:${task.reportId}` : `research:${task.id}`,
    listSourceKey: 'research',
    researchTaskId: task.id,
    ...(task.reportId ? { researchReportId: task.reportId } : null),
    researchStatus: status,
    researchQuestion: task.question || '',
    ...(title ? { title } : null),
    lastCapturedAt: Date.now(),
  });
}

async function markFailed(task: ResearchTask, code: string): Promise<ResearchTask> {
  const failed = ResearchTaskSchema.parse({
    ...task,
    status: 'failed',
    errorCode: code.slice(0, 100),
    updatedAt: new Date().toISOString(),
  });
  await putResearchTask(failed);
  await updateConversationStatus(failed, 'failed', `研究失败 · ${task.capture.pageTitle || '截图线索'}`);
  return failed;
}

async function markResearching(task: ResearchTask): Promise<ResearchTask> {
  const researching = ResearchTaskSchema.parse({
    ...task,
    status: 'researching',
    claim: task.claim || claimCandidate(task),
    attempt: task.attempt + 1,
    errorCode: null,
    updatedAt: new Date().toISOString(),
  });
  await putResearchTask(researching);
  await updateConversationStatus(researching, 'researching', `研究中 · ${task.capture.pageTitle || '截图线索'}`);
  return researching;
}

async function buildRequest(task: ResearchTask): Promise<ResearchApiRequest> {
  const imageAssetId = task.capture.imageAssetId;
  const conversationId = task.conversationId;
  if (!conversationId) {
    throw new ResearchApiError('research_image_missing');
  }
  const asset = imageAssetId ? await getImageCacheAssetById({ id: imageAssetId, conversationId }) : null;
  if (imageAssetId && !asset) throw new ResearchApiError('research_image_missing');
  if (!asset && !task.capture.selectedText && !task.capture.extractedText) {
    throw new ResearchApiError('research_source_missing');
  }
  return {
    taskId: task.id,
    reportId: task.reportId || null,
    question: task.question,
    claim: task.claim,
    pageTitle: task.capture.pageTitle,
    pageUrl: task.capture.pageUrl,
    selectedText: task.capture.selectedText,
    extractedText: task.capture.extractedText,
    researchContext: task.capture.researchContext,
    imageDataUrl: asset ? await blobToDataUrl(asset.blob) : '',
  };
}

async function finishResearch(task: ResearchTask, response: ResearchOutput): Promise<ResearchTask> {
  const result = validateResearchResult({
    result: response.result,
    expectedQuestion: task.question,
    expectedClaim: task.claim,
    actualSourceUrls: response.sourceUrls,
  });
  const now = new Date().toISOString();
  const card = EvidenceCardSchema.parse({
    ...result,
    id: createId(),
    taskId: task.id,
    reportId: task.reportId,
    sourcePageTitle: task.capture.pageTitle,
    sourcePageUrl: task.capture.pageUrl,
    extractedText: task.capture.selectedText || task.capture.extractedText,
    judgment: {
      decision: 'unreviewed',
      note: '',
      nextAction: '',
      reviewedAt: null,
    },
    createdAt: now,
    updatedAt: now,
  });
  return (await saveEvidenceCard({ card, task })).task;
}

export async function runResearchTask(
  taskId: string,
  options: {
    requestImpl?: (input: ResearchApiRequest) => Promise<ResearchOutput>;
    startJobImpl?: typeof startResearchJob;
    getJobImpl?: typeof getResearchJob;
  } = {},
): Promise<ResearchTask> {
  const task = await getResearchTask(taskId);
  if (!task) throw new ResearchApiError('research_task_not_found');
  if (task.status === 'review' || task.status === 'complete' || task.status === 'failed') {
    return task;
  }

  let activeTask = task;
  try {
    if (options.requestImpl) {
      const researching = await markResearching(task);
      activeTask = researching;
      return finishResearch(researching, await options.requestImpl(await buildRequest(researching)));
    }

    if (task.backendJobId) {
      const job = await (options.getJobImpl ?? getResearchJob)(task.backendJobId);
      if (job.status === 'complete') return finishResearch(task, job.output);
      if (job.status === 'failed') return markFailed(task, job.error);
      return task;
    }

    const researching = await markResearching(task);
    activeTask = researching;
    const job = await (options.startJobImpl ?? startResearchJob)(await buildRequest(researching));
    const withJob = ResearchTaskSchema.parse({
      ...researching,
      backendJobId: job.id,
      updatedAt: new Date().toISOString(),
    });
    await putResearchTask(withJob);
    return withJob;
  } catch (error) {
    const code =
      error instanceof ResearchApiError ? error.code : error instanceof Error ? error.message : 'research_failed';
    if (code === 'research_job_not_found' && activeTask.attempt < 3) {
      const retry = ResearchTaskSchema.parse({
        ...activeTask,
        status: 'queued',
        backendJobId: null,
        errorCode: null,
        updatedAt: new Date().toISOString(),
      });
      await putResearchTask(retry);
      return retry;
    }
    return markFailed(activeTask, code);
  }
}
