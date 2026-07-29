import type { EvidenceCard, ResearchTask } from '@services/research/domain/schemas';

function parseTime(value: string | null | undefined): number | null {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

export function researchDurationMs(task: ResearchTask | null, card: EvidenceCard | null, nowMs: number): number | null {
  if (!task) return null;
  const startedAt = parseTime(task.createdAt);
  if (startedAt == null) return null;

  const active = task.status === 'captured' || task.status === 'queued' || task.status === 'researching';
  const terminalTime = active
    ? nowMs
    : task.status === 'failed'
      ? (parseTime(task.updatedAt) ?? nowMs)
      : (parseTime(task.completedAt) ?? parseTime(card?.createdAt) ?? parseTime(task.updatedAt) ?? nowMs);

  return Math.max(0, terminalTime - startedAt);
}
