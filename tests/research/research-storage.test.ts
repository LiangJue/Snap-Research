import { beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import {
  getEvidenceCard,
  getEvidenceCardByTaskId,
  getResearchTask,
  putEvidenceCard,
  putResearchTask,
} from '@services/research/data/storage-idb';
import type { EvidenceCard, ResearchTask } from '@services/research/domain/schemas';

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
  await deleteDatabase();
});

const task: ResearchTask = {
  id: 'task-1',
  status: 'review',
  question: '这个市场是否仍在增长？',
  claim: '这个市场仍在增长。',
  capture: {
    pageTitle: '行业文章',
    pageUrl: 'https://source.example/article',
    capturedAt: '2026-07-23T10:00:00.000+08:00',
    imageAssetId: null,
    rect: { x: 10, y: 20, width: 300, height: 200, devicePixelRatio: 2 },
    selectedText: '',
    extractedText: '截图文字',
    researchContext: '',
  },
  cardId: 'card-1',
  backendJobId: null,
  conversationId: null,
  attempt: 1,
  errorCode: null,
  createdAt: '2026-07-23T10:00:00.000+08:00',
  updatedAt: '2026-07-23T10:01:00.000+08:00',
};

const card: EvidenceCard = {
  id: 'card-1',
  taskId: 'task-1',
  title: '市场需求核查',
  question: '这个市场是否仍在增长？',
  claim: '这个市场仍在增长。',
  status: 'insufficient',
  conclusion: '目前公开材料不足以确认。',
  evidence: [],
  limitations: ['缺少最新官方统计。'],
  unresolvedQuestions: ['下一期统计何时发布？'],
  researchAsOf: '2026-07-23',
  sourcePageTitle: '行业文章',
  sourcePageUrl: 'https://source.example/article',
  extractedText: '截图文字',
  judgment: { decision: 'unreviewed', note: '', nextAction: '', reviewedAt: null },
  createdAt: '2026-07-23T10:00:00.000+08:00',
  updatedAt: '2026-07-23T10:01:00.000+08:00',
};

describe('research storage', () => {
  it('persists and reads tasks and cards without flattening structured fields', async () => {
    await putResearchTask(task);
    await putEvidenceCard(card);

    expect(await getResearchTask('task-1')).toEqual(task);
    expect(await getEvidenceCard('card-1')).toEqual(card);
    expect(await getEvidenceCardByTaskId('task-1')).toEqual(card);
  });
});
