import { describe, expect, it } from 'vitest';

import { cardToMarkdown } from '@services/research/domain/card-to-markdown';
import { projectEvidenceCard } from '@services/research/domain/conversation-projection';
import { EvidenceCardSchema, type Evidence, type EvidenceCard } from '@services/research/domain/schemas';
import { rankEvidence } from '@services/research/domain/rank-source';
import { validateNumericEvidence } from '@services/research/domain/validate-numeric-evidence';

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'evidence-1',
    stance: 'support',
    summary: '官方统计支持该主张。',
    sourceName: '国家统计局',
    sourceUrl: 'https://example.com/data',
    publishedAt: '2026-07-20',
    coveragePeriod: '2026 Q2',
    tier: 'A1',
    sourceType: 'official_statistics',
    directness: '直接报告目标指标',
    methodology: null,
    conflictOfInterest: null,
    currentValue: null,
    comparisonValue: null,
    changeRate: null,
    unit: null,
    currency: null,
    comparisonBasis: null,
    ...overrides,
  };
}

function card(overrides: Partial<EvidenceCard> = {}): EvidenceCard {
  return {
    id: 'card-1',
    taskId: 'task-1',
    title: '目标市场需求是否增长',
    question: '目标市场需求是否仍在增长？',
    claim: '目标市场需求在 2026 年仍保持增长。',
    status: 'mixed',
    conclusion: '官方数据支持总量增长，但细分市场表现不一致。',
    evidence: [
      evidence(),
      evidence({
        id: 'evidence-2',
        stance: 'counter',
        tier: 'B',
        sourceName: '行业协会',
        sourceUrl: 'https://example.org/report',
        publishedAt: '2026-07-21',
        summary: '部分细分市场同比下降。',
      }),
    ],
    limitations: ['公开数据只覆盖到 2026 年第二季度。'],
    unresolvedQuestions: ['第三季度的地区差异是否扩大？'],
    researchAsOf: '2026-07-23',
    sourcePageTitle: '原始行业文章',
    sourcePageUrl: 'https://source.example/article',
    extractedText: '截图中的关键主张。',
    judgment: {
      decision: 'unreviewed',
      note: '',
      nextAction: '',
      reviewedAt: null,
    },
    createdAt: '2026-07-23T10:00:00.000+08:00',
    updatedAt: '2026-07-23T10:01:00.000+08:00',
    ...overrides,
  };
}

describe('Research Core', () => {
  it('accepts a bounded Evidence Card and rejects more than five evidence items', () => {
    expect(EvidenceCardSchema.safeParse(card()).success).toBe(true);
    const tooMany = card({ evidence: Array.from({ length: 6 }, (_, index) => evidence({ id: `e-${index}` })) });
    expect(EvidenceCardSchema.safeParse(tooMany).success).toBe(false);
  });

  it('ranks primary sources before newer secondary sources', () => {
    const ranked = rankEvidence([
      evidence({ id: 'secondary', tier: 'B', publishedAt: '2026-07-23' }),
      evidence({ id: 'primary', tier: 'A1', publishedAt: '2025-01-01' }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(['primary', 'secondary']);
  });

  it('requires comparison metadata and validates a supplied change rate', () => {
    expect(
      validateNumericEvidence({
        currentValue: 120,
        comparisonValue: 100,
        changeRate: 0.2,
        unit: '亿元',
        comparisonBasis: '同比',
        coveragePeriod: '2026 Q2',
      }),
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateNumericEvidence({
        currentValue: 120,
        comparisonValue: 100,
        changeRate: 0.1,
        unit: null,
        comparisonBasis: null,
        coveragePeriod: null,
      }).errors,
    ).toEqual(['missing_unit', 'missing_comparison_basis', 'missing_coverage_period', 'change_rate_mismatch']);
  });

  it('exports a readable card with working source links and user judgment', () => {
    const markdown = cardToMarkdown(card());
    expect(markdown).toContain('## 待核查主张');
    expect(markdown).toContain('**证据混合：**');
    expect(markdown).toContain('[国家统计局](https://example.com/data)');
    expect(markdown).toContain('## 我的判断');
  });

  it('projects the card into a deterministic SyncNos conversation', () => {
    const projection = projectEvidenceCard(card());
    expect(projection.conversation).toMatchObject({
      sourceType: 'research',
      source: 'research',
      conversationKey: 'research:task-1',
      listSiteKey: 'domain:source.example',
    });
    expect(projection.message.messageKey).toBe('research-card:card-1');
    expect(projection.message.contentMarkdown).toContain('# 目标市场需求是否增长');
  });
});
