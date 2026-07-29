import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import {
  __closeDbForTests as closeConversationDb,
  getConversationById,
  getMessagesByConversationId,
} from '@services/conversations/data/storage-idb';
import { __closeDbForTests as closeImageDb } from '@services/conversations/data/image-inline';
import { __closeImageCacheReadDbForTests as closeImageReadDb } from '@services/conversations/data/image-cache-read';
import { runResearchTask } from '@services/research/background/run-research-task';
import { createResearchTask } from '@services/research/create-research-task';
import { updateEvidenceCardJudgment } from '@services/research/update-evidence-card-judgment';
import { getEvidenceCardByTaskId, getResearchTask } from '@services/research/data/storage-idb';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1YQAAAAASUVORK5CYII=';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('webclipper');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  // @ts-expect-error fake IndexedDB implementation
  globalThis.indexedDB = indexedDB;
  // @ts-expect-error fake IndexedDB implementation
  globalThis.IDBKeyRange = IDBKeyRange;
  await closeConversationDb();
  await closeImageDb();
  await closeImageReadDb();
  await deleteDatabase();
});

afterEach(async () => {
  await closeConversationDb();
  await closeImageDb();
  await closeImageReadDb();
});

describe('runResearchTask', () => {
  it('moves a queued capture through research into one saved Evidence Card conversation', async () => {
    const claim = 'Example Domain is intended for documentation examples.';
    const task = await createResearchTask({
      question: 'What is Example Domain intended for?',
      pageTitle: 'Example Domain',
      pageUrl: 'https://example.com/',
      selectedText: claim,
      extractedText: claim,
      imageDataUrl: ONE_PIXEL_PNG,
      rect: { x: 10, y: 20, width: 300, height: 180, devicePixelRatio: 2 },
    });

    const completed = await runResearchTask(task.id, {
      requestImpl: async (request) => ({
        model: 'test-model',
        usage: null,
        sourceUrls: ['https://www.iana.org/help/example-domains'],
        result: {
          title: 'Purpose of Example Domain',
          question: request.question!,
          claim: request.claim!,
          status: 'supported',
          conclusion: 'IANA documents that example domains are reserved for illustrative use.',
          evidence: [
            {
              id: 'evidence-1',
              stance: 'support',
              summary: 'IANA says the domains are maintained for documentation examples.',
              sourceName: 'IANA',
              sourceUrl: 'https://www.iana.org/help/example-domains',
              publishedAt: null,
              coveragePeriod: null,
              tier: 'A1',
              sourceType: 'official documentation',
              directness: 'Direct statement from the domain administrator.',
              methodology: null,
              conflictOfInterest: null,
              currentValue: null,
              comparisonValue: null,
              changeRate: null,
              unit: null,
              currency: null,
              comparisonBasis: null,
            },
          ],
          limitations: ['This verifies intended use, not every real-world use.'],
          unresolvedQuestions: [],
          researchAsOf: '2026-07-23',
        },
      }),
    });

    expect(completed.status).toBe('review');
    expect(completed.cardId).toBeTruthy();
    expect(await getResearchTask(task.id)).toEqual(completed);
    expect((await getEvidenceCardByTaskId(task.id))?.status).toBe('supported');

    const conversation = await getConversationById(task.conversationId!);
    expect(conversation).toMatchObject({
      id: task.conversationId,
      conversationKey: `research:${task.id}`,
      researchTaskId: task.id,
      researchCardId: completed.cardId,
      researchStatus: 'supported',
    });
    const messages = await getMessagesByConversationId(task.conversationId!);
    expect(messages).toHaveLength(1);
    expect(messages[0].messageKey).toBe(`research-card:${completed.cardId}`);

    const reviewed = await updateEvidenceCardJudgment({
      cardId: completed.cardId!,
      decision: 'accepted',
      note: 'Enough evidence for the prototype decision.',
    });
    expect(reviewed.judgment).toMatchObject({
      decision: 'accepted',
      note: 'Enough evidence for the prototype decision.',
    });
    expect((await getResearchTask(task.id))?.status).toBe('complete');
  });

  it('persists a safe failure state when the backend is unavailable', async () => {
    const task = await createResearchTask({
      pageTitle: 'Example Domain',
      pageUrl: 'https://example.com/',
      selectedText: '',
      extractedText: 'Example Domain',
      imageDataUrl: ONE_PIXEL_PNG,
      rect: { x: 0, y: 0, width: 100, height: 100, devicePixelRatio: 1 },
    });

    const failed = await runResearchTask(task.id, {
      requestImpl: async () => {
        throw new Error('research_unreachable');
      },
    });

    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: 'research_unreachable',
      attempt: 1,
    });
  });

  it('persists a remote job id so a restarted service worker can resume polling', async () => {
    const task = await createResearchTask({
      pageTitle: 'Example Domain',
      pageUrl: 'https://example.com/',
      selectedText: 'Example Domain is intended for examples.',
      extractedText: 'Example Domain is intended for examples.',
      imageDataUrl: ONE_PIXEL_PNG,
      rect: { x: 0, y: 0, width: 100, height: 100, devicePixelRatio: 1 },
    });

    const researching = await runResearchTask(task.id, {
      startJobImpl: async () => ({
        id: 'backend-job-1',
        status: 'queued' as const,
      }),
    });

    expect(researching).toMatchObject({
      status: 'researching',
      backendJobId: 'backend-job-1',
      attempt: 1,
    });
    expect(await getResearchTask(task.id)).toEqual(researching);
  });
});
