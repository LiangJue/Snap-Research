import {
  getResearchReport,
  getResearchTasksByReportId,
  putResearchReport,
  putResearchTask,
} from '@services/research/data/storage-idb';
import { syncConversationMessages } from '@services/conversations/data/storage-idb';
import { buildResearchReportMarkdown } from '@services/research/create-research-report';
import { parseChatGptResearchImport } from '@services/research/domain/chatgpt-manual-research';
import { validateResearchResult, type ResearchResult } from '@services/research/domain/research-result';
import {
  EvidenceCardSchema,
  ResearchReportSchema,
  ResearchTaskSchema,
  type EvidenceCard,
  type ResearchTask,
} from '@services/research/domain/schemas';
import { saveEvidenceCard } from '@services/research/save-evidence-card';
import {
  isSourceFirstResearchMode,
  manualResearchProviderForMode,
  manualResearchProviderName,
} from '@services/research/domain/manual-research-provider';

function createId(): string {
  try {
    return `card-${crypto.randomUUID()}`;
  } catch (_error) {
    return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function createTaskId(): string {
  try {
    return `research-${crypto.randomUUID()}`;
  } catch (_error) {
    return `research-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeManualPercentageChangeRates(
  result: ResearchResult & { taskId: string },
): ResearchResult & { taskId: string } {
  let droppedInconsistentChangeRate = false;
  const evidence = result.evidence.map((evidence) => {
    const { currentValue, comparisonValue, changeRate } = evidence;
    if (currentValue === null || comparisonValue === null || comparisonValue === 0 || changeRate === null) {
      return evidence;
    }

    const calculated = (currentValue - comparisonValue) / comparisonValue;
    if (Math.abs(calculated - changeRate) <= 0.0005) return evidence;

    const percentageAsDecimal = changeRate / 100;
    if (Math.abs(calculated - percentageAsDecimal) <= 0.0005) {
      return { ...evidence, changeRate: percentageAsDecimal };
    }

    const absoluteDifference = currentValue - comparisonValue;
    if (Math.abs(absoluteDifference - changeRate) <= 0.0005) {
      return { ...evidence, changeRate: null };
    }

    droppedInconsistentChangeRate = true;
    return { ...evidence, changeRate: null };
  });

  return {
    ...result,
    evidence,
    limitations: droppedInconsistentChangeRate
      ? [
          ...new Set([...result.limitations, '系统检查：一项证据的变化率与原始数值不一致，导入时已移除该派生变化率。']),
        ].slice(0, 5)
      : result.limitations,
  };
}

export async function importChatGptResearchResults(input: {
  reportId: string;
  pastedText: string;
}): Promise<{ imported: number; cardIds: string[] }> {
  const reportId = String(input.reportId || '').trim();
  const report = await getResearchReport(reportId);
  if (!report) throw new Error('找不到对应的 Research Report。');

  const imported = parseChatGptResearchImport(input.pastedText);
  if (imported.reportId !== report.id) {
    throw new Error('粘贴结果的 reportId 与当前 Report 不一致。');
  }

  const existingTasks = await getResearchTasksByReportId(report.id);
  const sourceFirstImport = isSourceFirstResearchMode(report.executionMode);
  const providerName = manualResearchProviderName(manualResearchProviderForMode(report.executionMode) || 'chatgpt');
  if (sourceFirstImport && existingTasks.length) {
    throw new Error('这个原始材料 Report 已经导入过拆分结果。');
  }
  const now = new Date().toISOString();
  const tasks: ResearchTask[] = sourceFirstImport
    ? imported.results.map((item, index) =>
        ResearchTaskSchema.parse({
          id: createTaskId(),
          reportId: report.id,
          status: 'captured',
          question: item.question,
          claim: item.claim,
          capture: report.capture,
          cardId: null,
          backendJobId: null,
          conversationId: report.conversationId,
          attempt: 0,
          errorCode: null,
          createdAt: new Date(Date.parse(now) + index).toISOString(),
          updatedAt: now,
        }),
      )
    : existingTasks;
  const taskById = new Map(existingTasks.map((task) => [task.id, task]));
  const cards: EvidenceCard[] = imported.results.map((item, index) => {
    const task = sourceFirstImport ? tasks[index] : taskById.get(item.taskId);
    if (!task) throw new Error(`结果包含不属于当前 Report 的 taskId：${item.taskId}`);
    if (task.cardId) throw new Error(`任务已经有研究结果：${item.taskId}`);

    const normalizedItem = normalizeManualPercentageChangeRates(item);
    const result = validateResearchResult({
      result: normalizedItem,
      expectedQuestion: task.question,
      expectedClaim: task.claim,
      actualSourceUrls: normalizedItem.evidence.map((evidence) => evidence.sourceUrl),
    });
    return EvidenceCardSchema.parse({
      ...result,
      id: createId(),
      taskId: task.id,
      reportId: report.id,
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
  });

  if (sourceFirstImport) {
    for (const task of tasks) await putResearchTask(task);
  }
  for (const card of cards) {
    const task = tasks.find((candidate) => candidate.id === card.taskId)!;
    await saveEvidenceCard({ card, task });
  }
  const importedClaims = imported.results.map((item, index) => ({
    id: `claim-${index + 1}`,
    text: item.claim,
    selected: true,
  }));
  const updatedReport = ResearchReportSchema.parse({
    ...report,
    status: 'review',
    ...(sourceFirstImport
      ? {
          candidateClaims: importedClaims,
          taskIds: tasks.map((task) => task.id),
        }
      : null),
    updatedAt: now,
  });
  await putResearchReport(updatedReport);
  if (sourceFirstImport && updatedReport.conversationId) {
    const messageKey = `research-report:${updatedReport.id}`;
    const importedCount = importedClaims.length;
    const updatedAt = Date.parse(now);
    await syncConversationMessages(
      updatedReport.conversationId,
      [
        {
          messageKey,
          role: 'assistant',
          authorName: 'Snap Research',
          contentText: `已从 ${providerName} 导入 ${importedCount} 个论点的研究结果`,
          contentMarkdown: buildResearchReportMarkdown({
            imageDataUrl: updatedReport.capture.imageAssetId
              ? `syncnos-asset://${updatedReport.capture.imageAssetId}`
              : '',
            pageTitle: updatedReport.capture.pageTitle,
            claims: importedClaims,
            executionMode: updatedReport.executionMode,
            researchContext: updatedReport.capture.researchContext,
            statusText: `状态：已从 ${providerName} 导入 ${importedCount} 个论点的研究结果。`,
          }),
          sequence: 0,
          updatedAt,
        },
      ],
      {
        mode: 'append',
        diff: { added: [], updated: [messageKey], removed: [] },
      },
    );
  }
  return { imported: cards.length, cardIds: cards.map((card) => card.id) };
}
