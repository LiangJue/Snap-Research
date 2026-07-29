import { getEvidenceCard, getResearchTask } from '@services/research/data/storage-idb';
import {
  EvidenceCardSchema,
  ResearchTaskSchema,
  UserJudgmentSchema,
  type EvidenceCard,
} from '@services/research/domain/schemas';
import { saveEvidenceCard } from '@services/research/save-evidence-card';

export async function updateEvidenceCardJudgment(input: {
  cardId: string;
  decision: 'unreviewed' | 'accepted' | 'rejected' | 'needs_followup';
  note?: string;
  nextAction?: string;
}): Promise<EvidenceCard> {
  const card = await getEvidenceCard(String(input.cardId || '').trim());
  if (!card) throw new Error('evidence_card_not_found');
  const task = await getResearchTask(card.taskId);
  if (!task) throw new Error('research_task_not_found');

  const now = new Date().toISOString();
  const judgment = UserJudgmentSchema.parse({
    decision: input.decision,
    note: String(input.note || '')
      .trim()
      .slice(0, 2_000),
    nextAction: String(input.nextAction || '')
      .trim()
      .slice(0, 500),
    reviewedAt: input.decision === 'unreviewed' ? null : now,
  });
  const nextCard = EvidenceCardSchema.parse({
    ...card,
    judgment,
    updatedAt: now,
  });
  const nextTask = ResearchTaskSchema.parse({
    ...task,
    status: input.decision === 'accepted' || input.decision === 'rejected' ? 'complete' : 'review',
    updatedAt: now,
  });
  await saveEvidenceCard({ card: nextCard, task: nextTask });
  return nextCard;
}
