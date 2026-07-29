import type { Evidence } from '@services/research/domain/schemas';

const tierWeight = { A1: 0, A2: 1, B: 2, C: 3, D: 4 } as const;

export function rankEvidence(evidence: readonly Evidence[]): Evidence[] {
  return [...evidence].sort((left, right) => {
    const tierDifference = tierWeight[left.tier] - tierWeight[right.tier];
    if (tierDifference !== 0) return tierDifference;

    const leftDate = left.publishedAt ? Date.parse(left.publishedAt) : 0;
    const rightDate = right.publishedAt ? Date.parse(right.publishedAt) : 0;
    return rightDate - leftDate;
  });
}
