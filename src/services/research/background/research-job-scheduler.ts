import { create as createAlarm } from '@platform/alarms/alarms';
import { getPendingResearchTasks } from '@services/research/data/storage-idb';
import { runResearchTask } from '@services/research/background/run-research-task';

export const RESEARCH_POLL_ALARM = 'research-mode:poll';
const POLL_DELAY_MINUTES = 0.5;

let running: Promise<number> | null = null;

export function scheduleResearchPoll(): void {
  createAlarm(RESEARCH_POLL_ALARM, { delayInMinutes: POLL_DELAY_MINUTES });
}

export async function resumePendingResearchTasks(): Promise<number> {
  if (running) return running;
  running = (async () => {
    const tasks = await getPendingResearchTasks();
    for (const task of tasks) {
      await runResearchTask(task.id).catch(() => null);
    }
    const remaining = await getPendingResearchTasks();
    if (remaining.length) scheduleResearchPoll();
    return remaining.length;
  })().finally(() => {
    running = null;
  });
  return running;
}

export function handleResearchAlarm(name: string): boolean {
  if (name !== RESEARCH_POLL_ALARM) return false;
  void resumePendingResearchTasks();
  return true;
}
