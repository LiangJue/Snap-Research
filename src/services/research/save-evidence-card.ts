import { syncConversationMessages, upsertConversation } from '@services/conversations/data/storage-idb';
import { putEvidenceCard, putResearchTask } from '@services/research/data/storage-idb';
import { projectEvidenceCard } from '@services/research/domain/conversation-projection';
import {
  EvidenceCardSchema,
  ResearchTaskSchema,
  type EvidenceCard,
  type ResearchTask,
} from '@services/research/domain/schemas';

export type SavedEvidenceCard = {
  card: EvidenceCard;
  task: ResearchTask;
  conversationId: number;
};

export async function saveEvidenceCard(input: { card: EvidenceCard; task: ResearchTask }): Promise<SavedEvidenceCard> {
  const card = EvidenceCardSchema.parse(input.card);
  const task = ResearchTaskSchema.parse(input.task);
  if (card.taskId !== task.id) throw new Error('evidence card taskId does not match task id');

  await putEvidenceCard(card);

  const projection = projectEvidenceCard(card);
  const conversation = await upsertConversation(projection.conversation);
  const conversationId = Number(conversation.id);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    throw new Error('failed to create research conversation projection');
  }

  if (task.reportId) {
    await syncConversationMessages(conversationId, [projection.message], {
      mode: 'append',
      diff: { added: [projection.message.messageKey], updated: [], removed: [] },
    });
  } else {
    await syncConversationMessages(conversationId, [projection.message], { mode: 'snapshot' });
  }

  const savedTask = ResearchTaskSchema.parse({
    ...task,
    status: task.status === 'complete' ? 'complete' : 'review',
    cardId: card.id,
    conversationId,
    errorCode: null,
    completedAt: task.completedAt ?? card.createdAt,
    updatedAt: card.updatedAt,
  });
  await putResearchTask(savedTask);

  return { card, task: savedTask, conversationId };
}
