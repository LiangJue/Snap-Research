import { RESEARCH_MESSAGE_TYPES } from '@platform/messaging/message-contracts';
import { send } from '@platform/runtime/runtime';
import type { EvidenceCard, ResearchReport, ResearchTask } from '@services/research/domain/schemas';

type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  error: { message: string; extra: unknown } | null;
};

function unwrap<T>(response: ApiResponse<T>): T {
  if (response?.ok) return response.data as T;
  throw new Error(response?.error?.message || 'research request failed');
}

export async function getEvidenceCard(cardId: string): Promise<EvidenceCard | null> {
  return unwrap(
    await send<ApiResponse<EvidenceCard | null>>(RESEARCH_MESSAGE_TYPES.GET_CARD, {
      cardId,
    }),
  );
}

export async function getResearchTask(taskId: string): Promise<ResearchTask | null> {
  return unwrap(
    await send<ApiResponse<ResearchTask | null>>(RESEARCH_MESSAGE_TYPES.GET_TASK, {
      taskId,
    }),
  );
}

export type ResearchReportBundle = {
  report: ResearchReport;
  tasks: ResearchTask[];
  cards: EvidenceCard[];
};

export async function getResearchReport(reportId: string): Promise<ResearchReportBundle | null> {
  return unwrap(
    await send<ApiResponse<ResearchReportBundle | null>>(RESEARCH_MESSAGE_TYPES.GET_REPORT, {
      reportId,
    }),
  );
}

export async function importChatGptResearchResults(input: {
  reportId: string;
  pastedText: string;
}): Promise<{ imported: number; cardIds: string[] }> {
  return unwrap(
    await send<ApiResponse<{ imported: number; cardIds: string[] }>>(
      RESEARCH_MESSAGE_TYPES.IMPORT_CHATGPT_RESULTS,
      input,
    ),
  );
}

export async function openChatGptForManualResearch(prompt?: string): Promise<void> {
  unwrap(
    await send<ApiResponse<{ opened: boolean; promptPrepared?: boolean }>>(RESEARCH_MESSAGE_TYPES.OPEN_CHATGPT, {
      ...(prompt ? { prompt } : null),
    }),
  );
}

export async function openKimiForManualResearch(prompt?: string): Promise<void> {
  unwrap(
    await send<ApiResponse<{ opened: boolean; promptPrepared?: boolean }>>(RESEARCH_MESSAGE_TYPES.OPEN_KIMI, {
      ...(prompt ? { prompt } : null),
    }),
  );
}

export async function updateEvidenceCardJudgment(input: {
  cardId: string;
  decision: 'accepted' | 'rejected' | 'needs_followup';
  note: string;
}): Promise<EvidenceCard> {
  return unwrap(await send<ApiResponse<EvidenceCard>>(RESEARCH_MESSAGE_TYPES.UPDATE_JUDGMENT, input));
}
