import { z } from 'zod/v4';

import { rankEvidence } from '@services/research/domain/rank-source';
import { ClaimStatusSchema, EvidenceSchema, type ClaimStatus, type Evidence } from '@services/research/domain/schemas';
import { validateNumericEvidence } from '@services/research/domain/validate-numeric-evidence';

export const ResearchResultSchema = z.object({
  title: z.string().min(1).max(120),
  question: z.string().min(1).max(300),
  claim: z.string().min(1).max(500),
  status: ClaimStatusSchema,
  conclusion: z.string().min(1).max(500),
  evidence: z.array(EvidenceSchema).max(5),
  limitations: z.array(z.string().min(1).max(300)).max(5),
  unresolvedQuestions: z.array(z.string().min(1).max(300)).max(5),
  researchAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;

const SOCIAL_HOSTS = [
  'baike.baidu.com',
  'douban.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'linkedin.com',
  'zhihu.com',
];

const SECONDARY_HOSTS = [
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'chinanews.com.cn',
  'huxiu.com',
  'reuters.com',
  'thepaper.cn',
  'weixin.qq.com',
  'mp.weixin.qq.com',
];

const QUALITY_GATE_PREFIX = '系统检查：';

function canonicalText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isBlockedHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/\.+$/g, '');
  if (!value) return true;
  if (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    value.endsWith('.internal')
  ) {
    return true;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true;
  if (value.includes(':')) return true;
  return false;
}

export function normalizeResearchSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (isBlockedHostname(url.hostname)) return null;
    url.hostname = url.hostname.toLowerCase().replace(/\.+$/g, '');
    url.hash = '';
    return url.toString();
  } catch (_error) {
    return null;
  }
}

function isSocialHost(hostname: string): boolean {
  return SOCIAL_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function isSecondaryHost(hostname: string): boolean {
  return SECONDARY_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function isSocialEvidence(evidence: Evidence): boolean {
  const host = new URL(evidence.sourceUrl).hostname.toLowerCase();
  const type = evidence.sourceType.toLowerCase();
  return isSocialHost(host) || /social|forum|community|user post|encyclopedia|aggregator/.test(type);
}

function enforceEvidenceRelationshipTier(evidence: Evidence): { evidence: Evidence; downgraded: boolean } {
  const host = new URL(evidence.sourceUrl).hostname.toLowerCase();
  if (isSocialEvidence(evidence)) {
    return {
      evidence: evidence.tier === 'D' ? evidence : { ...evidence, tier: 'D' },
      downgraded: evidence.tier !== 'D',
    };
  }
  if (
    (evidence.tier === 'A1' || evidence.tier === 'A2' || evidence.tier === 'B') &&
    (isSecondaryHost(host) || /news|media|journalism|secondary|commentary/.test(evidence.sourceType.toLowerCase()))
  ) {
    return { evidence: { ...evidence, tier: 'C' }, downgraded: true };
  }
  return { evidence, downgraded: false };
}

function evidenceDeduplicationKey(evidence: Evidence): string {
  return `${evidence.sourceUrl}\n${evidence.stance}`;
}

function likelyCompoundMixedClaim(claim: string, status: ClaimStatus): boolean {
  if (status !== 'mixed') return false;
  const numericParts = claim.match(/\d+(?:[.,]\d+)?%?/g) || [];
  return (
    /[；;]|\b(?:and|while|whereas)\b|以及|并且|同时|而(?:且|工资|房价|收入|人口|比例)/i.test(claim) ||
    numericParts.length >= 2
  );
}

function evidenceSupportsStatus(status: ClaimStatus, evidence: readonly Evidence[]): boolean {
  const usable = evidence.filter((item) => item.tier !== 'D');
  const hasSupport = usable.some((item) => item.stance === 'support');
  const hasCounter = usable.some((item) => item.stance === 'counter');
  if (status === 'supported') return hasSupport;
  if (status === 'countered') return hasCounter;
  if (status === 'mixed') return hasSupport && hasCounter;
  return true;
}

function withoutIncompleteNumericMetadata(evidence: Evidence): Evidence {
  return {
    ...evidence,
    currentValue: null,
    comparisonValue: null,
    changeRate: null,
    unit: null,
    currency: null,
    comparisonBasis: null,
  };
}

export class ResearchResultError extends Error {
  constructor(public readonly code: 'schema_invalid' | 'claim_mismatch' | 'question_mismatch' | 'invalid_change_rate') {
    super(code);
  }
}

export function validateResearchResult(input: {
  result: unknown;
  expectedQuestion: string | null;
  expectedClaim: string | null;
  actualSourceUrls: readonly string[];
}): ResearchResult {
  const parsed = ResearchResultSchema.safeParse(input.result);
  if (!parsed.success) throw new ResearchResultError('schema_invalid');

  if (input.expectedQuestion && canonicalText(parsed.data.question) !== canonicalText(input.expectedQuestion)) {
    throw new ResearchResultError('question_mismatch');
  }
  if (input.expectedClaim && canonicalText(parsed.data.claim) !== canonicalText(input.expectedClaim)) {
    throw new ResearchResultError('claim_mismatch');
  }

  const actualUrls = new Set(
    input.actualSourceUrls.map(normalizeResearchSourceUrl).filter((value): value is string => Boolean(value)),
  );
  const bySourceAndStance = new Map<string, Evidence>();
  const qualityWarnings = new Set<string>();
  let droppedEvidence = 0;

  for (const evidence of parsed.data.evidence) {
    const sourceUrl = normalizeResearchSourceUrl(evidence.sourceUrl);
    if (!sourceUrl || !actualUrls.has(sourceUrl)) {
      droppedEvidence += 1;
      continue;
    }

    let normalized = { ...evidence, sourceUrl };
    const numeric = validateNumericEvidence(normalized);
    if (!numeric.valid) {
      if (numeric.errors.includes('change_rate_mismatch')) {
        throw new ResearchResultError('invalid_change_rate');
      }
      normalized = withoutIncompleteNumericMetadata(normalized);
    }

    const relationshipTier = enforceEvidenceRelationshipTier(normalized);
    const safeEvidence = relationshipTier.evidence;
    if (relationshipTier.downgraded) {
      qualityWarnings.add(`${QUALITY_GATE_PREFIX}证据等级与来源关系不一致，已保守降级。`);
    }
    const deduplicationKey = evidenceDeduplicationKey(safeEvidence);
    const existing = bySourceAndStance.get(deduplicationKey);
    if (!existing || rankEvidence([safeEvidence, existing])[0] === safeEvidence) {
      bySourceAndStance.set(deduplicationKey, safeEvidence);
    }
  }

  if (droppedEvidence) {
    qualityWarnings.add(`${QUALITY_GATE_PREFIX}有 ${droppedEvidence} 条来源因网址或访问记录不合格而未导入。`);
  }

  const evidence = rankEvidence([...bySourceAndStance.values()]).slice(0, 5);
  const compoundMixed = likelyCompoundMixedClaim(parsed.data.claim, parsed.data.status);
  if (compoundMixed) {
    qualityWarnings.add(`${QUALITY_GATE_PREFIX}该 mixed 论点可能包含可分别核查的子命题，请拆分后复核。`);
  }
  const status =
    !compoundMixed && evidenceSupportsStatus(parsed.data.status, evidence)
      ? parsed.data.status
      : ('insufficient' as const);
  if (status !== parsed.data.status) {
    qualityWarnings.add(`${QUALITY_GATE_PREFIX}保留证据不足以维持网页 AI 的原状态，已调整为证据不足。`);
  }
  const conclusion =
    status === parsed.data.status
      ? parsed.data.conclusion
      : `质量门槛未能维持网页 AI 的原结论，请根据保留证据人工复核。原结论：${parsed.data.conclusion}`.slice(0, 500);
  const userLimitations = parsed.data.limitations.filter((item) => !item.startsWith(QUALITY_GATE_PREFIX)).slice(0, 3);
  const existingWarnings = parsed.data.limitations.filter((item) => item.startsWith(QUALITY_GATE_PREFIX));
  const limitations = [...new Set([...userLimitations, ...existingWarnings, ...qualityWarnings])].slice(0, 5);

  return {
    ...parsed.data,
    status,
    conclusion,
    evidence,
    limitations,
  };
}
