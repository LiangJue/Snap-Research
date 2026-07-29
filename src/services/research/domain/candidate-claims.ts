import { CandidateClaimSchema, type CandidateClaim } from '@services/research/domain/schemas';

const MAX_CANDIDATE_CLAIMS = 10;

function claimId(index: number): string {
  return `claim-${index + 1}`;
}

export function normalizeCandidateClaims(values: unknown): CandidateClaim[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const claims: CandidateClaim[] = [];

  for (const value of values) {
    const text =
      typeof value === 'string'
        ? value.trim().slice(0, 500)
        : String((value as { text?: unknown } | null)?.text || '')
            .trim()
            .slice(0, 500);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    claims.push(CandidateClaimSchema.parse({ id: claimId(claims.length), text, selected: true }));
    if (claims.length >= MAX_CANDIDATE_CLAIMS) break;
  }

  return claims;
}

export function extractScenarioClaimsFromNumberedList(text: string): CandidateClaim[] {
  const numberedItems = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[•·▪◦*-]\s*)?(\d{1,2})\s*[,，、.．:：)）]\s*(.+?)\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ number: Number(match[1]), text: match[2] }));

  if (numberedItems.length < 2) return [];
  const isSequential = numberedItems.every(
    (item, index) => index === 0 || item.number === numberedItems[index - 1].number + 1,
  );
  if (!isSequential) return [];
  return normalizeCandidateClaims(numberedItems.map((item) => item.text));
}

export function updateCandidateClaimText(claims: CandidateClaim[], index: number, nextText: string): CandidateClaim[] {
  return claims.map((claim, claimIndex) =>
    claimIndex === index
      ? {
          ...claim,
          text: String(nextText || '')
            .trim()
            .slice(0, 500),
        }
      : claim,
  );
}
