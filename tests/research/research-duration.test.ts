import { describe, expect, it } from 'vitest';

import { researchDurationMs } from '@services/research/domain/research-duration';
import type { EvidenceCard, ResearchTask } from '@services/research/domain/schemas';

function task(overrides: Partial<ResearchTask> = {}): ResearchTask {
  return {
    id: 'task-duration',
    status: 'review',
    question: '问题',
    claim: '主张',
    capture: {
      pageTitle: '来源',
      pageUrl: 'https://example.com',
      capturedAt: '2026-07-23T10:00:00.000+08:00',
      imageAssetId: null,
      rect: { x: 0, y: 0, width: 100, height: 100, devicePixelRatio: 1 },
      selectedText: '',
      extractedText: '',
    },
    cardId: 'card-duration',
    backendJobId: null,
    conversationId: 1,
    attempt: 1,
    errorCode: null,
    createdAt: '2026-07-23T10:00:00.000+08:00',
    updatedAt: '2026-07-26T03:17:11.000+08:00',
    ...overrides,
  };
}

function card(overrides: Partial<EvidenceCard> = {}): EvidenceCard {
  return {
    id: 'card-duration',
    taskId: 'task-duration',
    title: '研究卡',
    question: '问题',
    claim: '主张',
    status: 'insufficient',
    conclusion: '结论',
    evidence: [],
    limitations: [],
    unresolvedQuestions: [],
    researchAsOf: '2026-07-23',
    sourcePageTitle: '来源',
    sourcePageUrl: 'https://example.com',
    extractedText: '',
    judgment: { decision: 'unreviewed', note: '', nextAction: '', reviewedAt: null },
    createdAt: '2026-07-23T10:00:30.000+08:00',
    updatedAt: '2026-07-26T03:17:11.000+08:00',
    ...overrides,
  };
}

describe('researchDurationMs', () => {
  it('uses the card creation time for an old completed task whose judgment changed later', () => {
    expect(researchDurationMs(task(), card(), Date.parse('2026-07-26T04:00:00.000+08:00'))).toBe(30_000);
  });

  it('uses the explicit completion time when present', () => {
    expect(
      researchDurationMs(
        task({ completedAt: '2026-07-23T10:00:45.000+08:00' }),
        card(),
        Date.parse('2026-07-26T04:00:00.000+08:00'),
      ),
    ).toBe(45_000);
  });

  it('keeps active tasks ticking against the current time', () => {
    expect(
      researchDurationMs(
        task({ status: 'researching', completedAt: undefined }),
        null,
        Date.parse('2026-07-23T10:01:00.000+08:00'),
      ),
    ).toBe(60_000);
  });
});
