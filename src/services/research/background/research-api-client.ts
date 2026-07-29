import { z } from 'zod/v4';

import { ResearchResultSchema } from '@services/research/domain/research-result';
import { normalizeCandidateClaims } from '@services/research/domain/candidate-claims';

declare const __SYNCNOS_RESEARCH_API_URL__: string | undefined;

const ResearchApiResponseSchema = z.object({
  result: ResearchResultSchema,
  sourceUrls: z.array(z.string()).max(100),
  usage: z.unknown().nullable().optional(),
  model: z.string().min(1).max(100),
});

const CandidateClaimsApiResponseSchema = z.object({
  claims: z.array(z.string()).min(1).max(10),
  model: z.string().min(1).max(100),
});

const ResearchJobSchema = z.discriminatedUnion('status', [
  z.object({ id: z.string().min(1), status: z.enum(['queued', 'running']) }),
  z.object({
    id: z.string().min(1),
    status: z.literal('complete'),
    output: ResearchApiResponseSchema,
  }),
  z.object({
    id: z.string().min(1),
    status: z.literal('failed'),
    error: z.string().min(1).max(100),
  }),
]);

export type ResearchApiRequest = {
  taskId: string;
  reportId: string | null;
  question: string | null;
  claim: string | null;
  pageTitle: string;
  pageUrl: string | null;
  selectedText: string;
  extractedText: string;
  researchContext?: string;
  imageDataUrl: string;
};

export class ResearchApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function endpoint(): string {
  return (
    String(typeof __SYNCNOS_RESEARCH_API_URL__ === 'string' ? __SYNCNOS_RESEARCH_API_URL__ : '').trim() ||
    'http://127.0.0.1:8787/v1/research'
  );
}

function claimsEndpoint(): string {
  return endpoint().replace(/\/research\/?$/, '/research/claims');
}

export type CandidateClaimsApiRequest = {
  pageTitle: string;
  pageUrl: string | null;
  selectedText: string;
  extractedText: string;
  researchContext?: string;
  imageDataUrl?: string;
};

export async function extractCandidateClaims(
  input: CandidateClaimsApiRequest,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(180_000, Math.max(30_000, options.timeoutMs ?? 90_000)),
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(claimsEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ResearchApiError(String(body?.error || `research_http_${response.status}`));
    }
    const parsed = CandidateClaimsApiResponseSchema.safeParse(body);
    if (!parsed.success) throw new ResearchApiError('invalid_candidate_claims_response');
    const claims = normalizeCandidateClaims(parsed.data.claims);
    if (!claims.length) throw new ResearchApiError('no_candidate_claims');
    return { ...parsed.data, claims };
  } catch (error) {
    if (error instanceof ResearchApiError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new ResearchApiError('claim_extraction_timeout');
    throw new ResearchApiError('research_unreachable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestResearch(
  input: ResearchApiRequest,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(180_000, Math.max(60_000, options.timeoutMs ?? 160_000)),
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ResearchApiError(String(body?.error || `research_http_${response.status}`));
    }
    const parsed = ResearchApiResponseSchema.safeParse(body);
    if (!parsed.success) throw new ResearchApiError('invalid_research_response');
    return parsed.data;
  } catch (error) {
    if (error instanceof ResearchApiError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new ResearchApiError('research_timeout');
    throw new ResearchApiError('research_unreachable');
  } finally {
    clearTimeout(timeout);
  }
}

async function researchFetch(url: string, init: RequestInit, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  try {
    const response = await fetchImpl(url, { ...init, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ResearchApiError(String(body?.error || `research_http_${response.status}`));
    }
    return body;
  } catch (error) {
    if (error instanceof ResearchApiError) throw error;
    throw new ResearchApiError('research_unreachable');
  }
}

export async function startResearchJob(input: ResearchApiRequest, options: { fetchImpl?: typeof fetch } = {}) {
  const body = await researchFetch(
    `${endpoint()}/jobs`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    options.fetchImpl,
  );
  const parsed = ResearchJobSchema.safeParse(body);
  if (!parsed.success || parsed.data.status === 'complete' || parsed.data.status === 'failed') {
    throw new ResearchApiError('invalid_research_job_response');
  }
  return parsed.data;
}

export async function getResearchJob(jobId: string, options: { fetchImpl?: typeof fetch } = {}) {
  const body = await researchFetch(
    `${endpoint()}/jobs/${encodeURIComponent(jobId)}`,
    { method: 'GET' },
    options.fetchImpl,
  );
  const parsed = ResearchJobSchema.safeParse(body);
  if (!parsed.success) throw new ResearchApiError('invalid_research_job_response');
  return parsed.data;
}
