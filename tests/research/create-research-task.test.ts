import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import {
  __closeDbForTests as closeConversationDb,
  getConversationById,
  getMessagesByConversationId,
} from '@services/conversations/data/storage-idb';
import { __closeDbForTests as closeImageDb } from '@services/conversations/data/image-inline';
import { createResearchTask } from '@services/research/create-research-task';
import { getResearchTask } from '@services/research/data/storage-idb';

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
  // @ts-expect-error test IndexedDB implementation
  globalThis.indexedDB = indexedDB;
  // @ts-expect-error test IndexedDB implementation
  globalThis.IDBKeyRange = IDBKeyRange;
  await closeConversationDb();
  await closeImageDb();
  await deleteDatabase();
});

afterEach(async () => {
  await closeConversationDb();
  await closeImageDb();
});

describe('createResearchTask', () => {
  it('stores the cropped screenshot as a local asset and creates a queued list item', async () => {
    const task = await createResearchTask({
      question: '这个页面的用途是什么？',
      pageTitle: 'Example Domain',
      pageUrl: 'https://example.com/',
      selectedText: '',
      extractedText: 'Example Domain documentation examples',
      imageDataUrl: ONE_PIXEL_PNG,
      rect: { x: 10, y: 20, width: 300, height: 180, devicePixelRatio: 2 },
    });

    expect(task.status).toBe('queued');
    expect(task.capture.imageAssetId).toBeTypeOf('number');
    expect(await getResearchTask(task.id)).toEqual(task);

    const conversation = await getConversationById(task.conversationId!);
    expect(conversation).toMatchObject({
      sourceType: 'research',
      source: 'research',
      conversationKey: `research:${task.id}`,
      researchTaskId: task.id,
      researchStatus: 'queued',
    });

    const messages = await getMessagesByConversationId(task.conversationId!);
    expect(messages).toHaveLength(1);
    expect(messages[0].contentMarkdown).toContain(`syncnos-asset://${task.capture.imageAssetId}`);
    expect(messages[0].contentMarkdown).not.toContain('data:image/png;base64');
  });
});
