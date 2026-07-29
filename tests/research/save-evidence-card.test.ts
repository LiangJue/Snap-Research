import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import {
  __closeDbForTests,
  getConversationById,
  getMessagesByConversationId,
} from '@services/conversations/data/storage-idb';
import { getEvidenceCard, getResearchTask } from '@services/research/data/storage-idb';
import type { EvidenceCard, ResearchTask } from '@services/research/domain/schemas';
import { saveEvidenceCard } from '@services/research/save-evidence-card';

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
  await __closeDbForTests();
  await deleteDatabase();
});

afterEach(async () => {
  await __closeDbForTests();
});

const task: ResearchTask = {
  id: 'task-save',
  status: 'researching',
  question: '这个说法可靠吗？',
  claim: '截图中的说法可靠。',
  capture: {
    pageTitle: '来源文章',
    pageUrl: 'https://source.example/story',
    capturedAt: '2026-07-23T10:00:00.000+08:00',
    imageAssetId: null,
    rect: { x: 0, y: 0, width: 640, height: 480, devicePixelRatio: 1 },
    selectedText: '',
    extractedText: '截图中的说法可靠。',
  },
  cardId: null,
  conversationId: null,
  attempt: 1,
  errorCode: null,
  createdAt: '2026-07-23T10:00:00.000+08:00',
  updatedAt: '2026-07-23T10:00:30.000+08:00',
};

const card: EvidenceCard = {
  id: 'card-save',
  taskId: 'task-save',
  title: '截图主张核查',
  question: '这个说法可靠吗？',
  claim: '截图中的说法可靠。',
  status: 'unverifiable',
  conclusion: '现有公开来源无法直接核查。',
  evidence: [],
  limitations: ['截图缺少主体和时间范围。'],
  unresolvedQuestions: ['原始数据来自哪里？'],
  researchAsOf: '2026-07-23',
  sourcePageTitle: '来源文章',
  sourcePageUrl: 'https://source.example/story',
  extractedText: '截图中的说法可靠。',
  judgment: { decision: 'unreviewed', note: '', nextAction: '', reviewedAt: null },
  createdAt: '2026-07-23T10:00:00.000+08:00',
  updatedAt: '2026-07-23T10:01:00.000+08:00',
};

describe('saveEvidenceCard', () => {
  it('stores the card and creates a reusable SyncNos conversation projection', async () => {
    const saved = await saveEvidenceCard({ card, task });
    expect(saved.task).toMatchObject({
      status: 'review',
      cardId: 'card-save',
      conversationId: saved.conversationId,
    });
    expect(await getEvidenceCard('card-save')).toEqual(card);
    expect(await getResearchTask('task-save')).toEqual(saved.task);

    const conversation = await getConversationById(saved.conversationId);
    expect(conversation).toMatchObject({
      sourceType: 'research',
      source: 'research',
      conversationKey: 'research:task-save',
      researchCardId: 'card-save',
      researchTaskId: 'task-save',
      researchStatus: 'unverifiable',
      researchQuestion: '这个说法可靠吗？',
    });

    const messages = await getMessagesByConversationId(saved.conversationId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      messageKey: 'research-card:card-save',
      role: 'assistant',
    });
    expect(messages[0].contentMarkdown).toContain('## 我的判断');
  });
});
