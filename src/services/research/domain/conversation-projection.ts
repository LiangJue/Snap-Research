import type { EvidenceCard } from '@services/research/domain/schemas';
import { cardToMarkdown } from '@services/research/domain/card-to-markdown';

export const RESEARCH_SOURCE = 'research';
export const RESEARCH_SOURCE_TYPE = 'research';

export type ResearchConversationProjection = {
  conversation: {
    sourceType: typeof RESEARCH_SOURCE_TYPE;
    source: typeof RESEARCH_SOURCE;
    conversationKey: string;
    listSourceKey: typeof RESEARCH_SOURCE;
    listSiteKey: string;
    title: string;
    url?: string;
    researchCardId: string;
    researchTaskId: string;
    researchReportId?: string;
    researchStatus: EvidenceCard['status'];
    researchQuestion: string;
    lastCapturedAt: number;
  };
  message: {
    messageKey: string;
    role: 'assistant';
    authorName: 'Snap Research';
    contentText: string;
    contentMarkdown: string;
    sequence: number;
    updatedAt: number;
  };
};

function siteKey(url: string | null): string {
  if (!url) return 'unknown';
  try {
    const host = new URL(url).hostname.trim().toLowerCase();
    return host ? `domain:${host}` : 'unknown';
  } catch (_error) {
    return 'unknown';
  }
}

export function projectEvidenceCard(card: EvidenceCard): ResearchConversationProjection {
  const updatedAt = Date.parse(card.updatedAt);
  const markdown = cardToMarkdown(card);

  return {
    conversation: {
      sourceType: RESEARCH_SOURCE_TYPE,
      source: RESEARCH_SOURCE,
      conversationKey: card.reportId ? `research-report:${card.reportId}` : `research:${card.taskId}`,
      listSourceKey: RESEARCH_SOURCE,
      listSiteKey: siteKey(card.sourcePageUrl),
      title: card.reportId ? `Research Report · ${card.sourcePageTitle || card.title}`.slice(0, 120) : card.title,
      ...(card.sourcePageUrl ? { url: card.sourcePageUrl } : null),
      researchCardId: card.id,
      researchTaskId: card.taskId,
      ...(card.reportId ? { researchReportId: card.reportId } : null),
      researchStatus: card.status,
      researchQuestion: card.question,
      lastCapturedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    },
    message: {
      messageKey: `research-card:${card.id}`,
      role: 'assistant',
      authorName: 'Snap Research',
      contentText: card.conclusion,
      contentMarkdown: markdown,
      sequence: Math.max(1, updatedAt),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    },
  };
}
