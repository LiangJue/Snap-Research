import { z } from 'zod/v4';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DateTimeSchema = z.string().datetime({ offset: true });
const NullableHttpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://') || value.startsWith('http://'), 'Expected an HTTP(S) URL')
  .nullable();

export const ResearchTaskStatusSchema = z.enum(['captured', 'queued', 'researching', 'review', 'complete', 'failed']);

export const CaptureRectSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  devicePixelRatio: z.number().positive(),
});

export const ResearchCaptureSchema = z.object({
  pageTitle: z.string().max(500),
  pageUrl: NullableHttpUrlSchema,
  capturedAt: DateTimeSchema,
  imageAssetId: z.number().int().positive().nullable(),
  rect: CaptureRectSchema,
  selectedText: z.string().max(20_000),
  extractedText: z.string().max(20_000),
  researchContext: z.string().max(300).default(''),
});

export const CandidateClaimSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(500),
  selected: z.boolean(),
});

export const ResearchReportStatusSchema = z.enum(['selecting', 'researching', 'review', 'complete', 'failed']);
export const ResearchExecutionModeSchema = z.enum([
  'api',
  'chatgpt_manual',
  'kimi_manual',
  'chatgpt_text',
  'kimi_text',
  'chatgpt_screenshot',
  'kimi_screenshot',
]);

export const ResearchReportSchema = z.object({
  id: z.string().min(1).max(100),
  status: ResearchReportStatusSchema,
  executionMode: ResearchExecutionModeSchema.default('api'),
  capture: ResearchCaptureSchema,
  candidateClaims: z.array(CandidateClaimSchema).max(10),
  taskIds: z.array(z.string().min(1).max(100)).max(10),
  conversationId: z.number().int().positive().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const ResearchTaskSchema = z.object({
  id: z.string().min(1).max(100),
  reportId: z.string().min(1).max(100).nullable().optional(),
  status: ResearchTaskStatusSchema,
  question: z.string().min(1).max(300).nullable(),
  claim: z.string().min(1).max(500).nullable(),
  capture: ResearchCaptureSchema,
  cardId: z.string().min(1).max(100).nullable(),
  backendJobId: z.string().min(1).max(100).nullable().default(null),
  conversationId: z.number().int().positive().nullable(),
  attempt: z.number().int().nonnegative(),
  errorCode: z.string().max(100).nullable(),
  createdAt: DateTimeSchema,
  completedAt: DateTimeSchema.nullable().optional(),
  updatedAt: DateTimeSchema,
});

export const ClaimStatusSchema = z.enum(['supported', 'countered', 'mixed', 'insufficient', 'unverifiable']);

export const EvidenceSchema = z.object({
  id: z.string().min(1).max(100),
  stance: z.enum(['support', 'counter', 'context']),
  summary: z.string().min(1).max(500),
  sourceName: z.string().min(1).max(200),
  sourceUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://') || value.startsWith('http://'), 'Expected an HTTP(S) URL'),
  publishedAt: DateSchema.nullable(),
  coveragePeriod: z.string().max(100).nullable(),
  tier: z.enum(['A1', 'A2', 'B', 'C', 'D']),
  sourceType: z.string().min(1).max(100),
  directness: z.string().min(1).max(300),
  methodology: z.string().max(500).nullable(),
  conflictOfInterest: z.string().max(300).nullable(),
  currentValue: z.number().nullable(),
  comparisonValue: z.number().nullable(),
  changeRate: z.number().nullable(),
  unit: z.string().max(50).nullable(),
  currency: z.string().max(10).nullable(),
  comparisonBasis: z.string().max(100).nullable(),
});

export const UserJudgmentSchema = z.object({
  decision: z.enum(['unreviewed', 'accepted', 'rejected', 'needs_followup']),
  note: z.string().max(2_000),
  nextAction: z.string().max(500),
  reviewedAt: DateTimeSchema.nullable(),
});

export const EvidenceCardSchema = z.object({
  id: z.string().min(1).max(100),
  taskId: z.string().min(1).max(100),
  reportId: z.string().min(1).max(100).nullable().optional(),
  title: z.string().min(1).max(120),
  question: z.string().min(1).max(300),
  claim: z.string().min(1).max(500),
  status: ClaimStatusSchema,
  conclusion: z.string().min(1).max(500),
  evidence: z.array(EvidenceSchema).max(5),
  limitations: z.array(z.string().min(1).max(300)).max(5),
  unresolvedQuestions: z.array(z.string().min(1).max(300)).max(5),
  researchAsOf: DateSchema,
  sourcePageTitle: z.string().max(500),
  sourcePageUrl: NullableHttpUrlSchema,
  extractedText: z.string().max(20_000),
  judgment: UserJudgmentSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type ResearchTaskStatus = z.infer<typeof ResearchTaskStatusSchema>;
export type CandidateClaim = z.infer<typeof CandidateClaimSchema>;
export type ResearchReportStatus = z.infer<typeof ResearchReportStatusSchema>;
export type ResearchExecutionMode = z.infer<typeof ResearchExecutionModeSchema>;
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
export type ResearchCapture = z.infer<typeof ResearchCaptureSchema>;
export type ResearchTask = z.infer<typeof ResearchTaskSchema>;
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type UserJudgment = z.infer<typeof UserJudgmentSchema>;
export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;
