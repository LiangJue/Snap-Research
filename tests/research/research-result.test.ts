import { describe, expect, it } from 'vitest';

import {
  ResearchResultError,
  normalizeResearchSourceUrl,
  validateResearchResult,
} from '@services/research/domain/research-result';
import type { Evidence } from '@services/research/domain/schemas';

const question = '这个市场是否仍在增长？';
const claim = '这个市场在 2026 年仍保持增长。';

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'e-1',
    stance: 'support',
    summary: '官方统计显示同比增长。',
    sourceName: '官方统计机构',
    sourceUrl: 'https://data.example/report#table',
    publishedAt: '2026-07-20',
    coveragePeriod: '2026 Q2',
    tier: 'A1',
    sourceType: 'government statistics',
    directness: '直接报告该指标',
    methodology: null,
    conflictOfInterest: null,
    currentValue: 120,
    comparisonValue: 100,
    changeRate: 0.2,
    unit: '亿元',
    currency: 'CNY',
    comparisonBasis: '同比',
    ...overrides,
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    title: '市场增长核查',
    question,
    claim,
    status: 'supported',
    conclusion: '官方数据支持增长。',
    evidence: [evidence()],
    limitations: ['只覆盖到第二季度。'],
    unresolvedQuestions: [],
    researchAsOf: '2026-07-23',
    ...overrides,
  };
}

describe('research result validation', () => {
  it('normalizes HTTPS sources and rejects local or credentialed URLs', () => {
    expect(normalizeResearchSourceUrl('https://Data.Example/report#table')).toBe('https://data.example/report');
    expect(normalizeResearchSourceUrl('http://example.com/report')).toBeNull();
    expect(normalizeResearchSourceUrl('https://localhost/report')).toBeNull();
    expect(normalizeResearchSourceUrl('https://user:pass@example.com/report')).toBeNull();
  });

  it('keeps only sources observed in the backend web-search citations', () => {
    const validated = validateResearchResult({
      result: result({
        evidence: [evidence(), evidence({ id: 'invented', sourceUrl: 'https://invented.example/report' })],
      }),
      expectedQuestion: question,
      expectedClaim: claim,
      actualSourceUrls: ['https://data.example/report'],
    });
    expect(validated.evidence.map((item) => item.id)).toEqual(['e-1']);
  });

  it('downgrades a supported verdict when no non-social support survives validation', () => {
    const validated = validateResearchResult({
      result: result({
        evidence: [
          evidence({
            sourceUrl: 'https://reddit.com/r/example/comments/1',
            sourceType: 'community post',
          }),
        ],
      }),
      expectedQuestion: question,
      expectedClaim: claim,
      actualSourceUrls: ['https://reddit.com/r/example/comments/1'],
    });
    expect(validated.evidence[0]?.tier).toBe('D');
    expect(validated.status).toBe('insufficient');
    expect(validated.conclusion).toContain('质量门槛');
    expect(validated.limitations.join(' ')).toContain('系统检查');
  });

  it('keeps direct evidence when the same URL also appears as context', () => {
    const validated = validateResearchResult({
      result: result({
        evidence: [
          evidence({ id: 'support', stance: 'support' }),
          evidence({ id: 'context', stance: 'context', summary: '同一官方页面还提供口径背景。' }),
        ],
      }),
      expectedQuestion: question,
      expectedClaim: claim,
      actualSourceUrls: ['https://data.example/report'],
    });

    expect(validated.status).toBe('supported');
    expect(validated.evidence.map((item) => item.stance)).toEqual(['support', 'context']);
  });

  it('downgrades a news source that was incorrectly labelled A1', () => {
    const validated = validateResearchResult({
      result: result({
        evidence: [
          evidence({
            sourceUrl: 'https://www.chinanews.com.cn/example',
            sourceType: 'news',
            tier: 'A1',
          }),
        ],
      }),
      expectedQuestion: question,
      expectedClaim: claim,
      actualSourceUrls: ['https://www.chinanews.com.cn/example'],
    });

    expect(validated.evidence[0]?.tier).toBe('C');
    expect(validated.status).toBe('supported');
    expect(validated.limitations.join(' ')).toContain('来源关系不一致');
  });

  it('does not preserve mixed for a likely compound numeric claim', () => {
    const compoundClaim = '全国房价从3919元涨到8737元，而工资从29229元涨到82461元。';
    const validated = validateResearchResult({
      result: result({
        claim: compoundClaim,
        question: `核查这个论点：${compoundClaim}`,
        status: 'mixed',
        evidence: [
          evidence({ id: 'support', stance: 'support' }),
          evidence({
            id: 'counter',
            stance: 'counter',
            sourceUrl: 'https://counter.example/report',
          }),
        ],
      }),
      expectedQuestion: `核查这个论点：${compoundClaim}`,
      expectedClaim: compoundClaim,
      actualSourceUrls: ['https://data.example/report', 'https://counter.example/report'],
    });

    expect(validated.status).toBe('insufficient');
    expect(validated.limitations.join(' ')).toContain('拆分后复核');
  });

  it('keeps qualitative evidence when its structured numeric metadata is incomplete', () => {
    const validated = validateResearchResult({
      result: result({
        status: 'countered',
        evidence: [
          evidence({
            stance: 'counter',
            summary: '项目自评明确否认已经达到目标。',
            currentValue: 5.05,
            comparisonValue: 10,
            changeRate: null,
            unit: 'points',
            comparisonBasis: '项目内部末轮10分制评分',
            coveragePeriod: null,
          }),
        ],
      }),
      expectedQuestion: question,
      expectedClaim: claim,
      actualSourceUrls: ['https://data.example/report'],
    });

    expect(validated.status).toBe('countered');
    expect(validated.evidence).toHaveLength(1);
    expect(validated.evidence[0]).toMatchObject({
      stance: 'counter',
      summary: '项目自评明确否认已经达到目标。',
      currentValue: null,
      comparisonValue: null,
      changeRate: null,
      unit: null,
      currency: null,
      comparisonBasis: null,
    });
  });

  it('rejects a rewritten claim and inconsistent numeric evidence', () => {
    expect(() =>
      validateResearchResult({
        result: result({ claim: '另一个主张' }),
        expectedQuestion: question,
        expectedClaim: claim,
        actualSourceUrls: ['https://data.example/report'],
      }),
    ).toThrowError(new ResearchResultError('claim_mismatch'));

    expect(() =>
      validateResearchResult({
        result: result({ evidence: [evidence({ changeRate: 0.5 })] }),
        expectedQuestion: question,
        expectedClaim: claim,
        actualSourceUrls: ['https://data.example/report'],
      }),
    ).toThrowError(new ResearchResultError('invalid_change_rate'));
  });
});
