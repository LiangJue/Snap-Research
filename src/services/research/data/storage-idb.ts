import { openDb } from '@platform/idb/schema';
import {
  EvidenceCardSchema,
  ResearchReportSchema,
  ResearchTaskSchema,
  type EvidenceCard,
  type ResearchReport,
  type ResearchTask,
} from '@services/research/domain/schemas';

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error || new Error('indexeddb request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('indexeddb transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('indexeddb transaction aborted'));
  });
}

export async function putResearchTask(input: ResearchTask): Promise<ResearchTask> {
  const task = ResearchTaskSchema.parse(input);
  const db = await openDb();
  const transaction = db.transaction(['research_tasks'], 'readwrite');
  await request(transaction.objectStore('research_tasks').put(task));
  await transactionDone(transaction);
  db.close();
  return task;
}

export async function putResearchReport(input: ResearchReport): Promise<ResearchReport> {
  const report = ResearchReportSchema.parse(input);
  const db = await openDb();
  const transaction = db.transaction(['research_reports'], 'readwrite');
  await request(transaction.objectStore('research_reports').put(report));
  await transactionDone(transaction);
  db.close();
  return report;
}

export async function getResearchReport(reportId: string): Promise<ResearchReport | null> {
  const db = await openDb();
  const transaction = db.transaction(['research_reports'], 'readonly');
  const value = await request(transaction.objectStore('research_reports').get(reportId));
  await transactionDone(transaction);
  db.close();
  if (!value) return null;
  return ResearchReportSchema.parse(value);
}

export async function getResearchTask(taskId: string): Promise<ResearchTask | null> {
  const db = await openDb();
  const transaction = db.transaction(['research_tasks'], 'readonly');
  const value = await request(transaction.objectStore('research_tasks').get(taskId));
  await transactionDone(transaction);
  db.close();
  if (!value) return null;
  return ResearchTaskSchema.parse(value);
}

export async function getPendingResearchTasks(): Promise<ResearchTask[]> {
  const db = await openDb();
  const transaction = db.transaction(['research_tasks'], 'readonly');
  const values = await request(transaction.objectStore('research_tasks').getAll());
  await transactionDone(transaction);
  db.close();
  return (Array.isArray(values) ? values : [])
    .map((value) => ResearchTaskSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((task) => task.status === 'queued' || task.status === 'researching');
}

export async function getResearchTasksByReportId(reportId: string): Promise<ResearchTask[]> {
  const db = await openDb();
  const transaction = db.transaction(['research_tasks'], 'readonly');
  const values = await request(transaction.objectStore('research_tasks').index('by_reportId').getAll(reportId));
  await transactionDone(transaction);
  db.close();
  const tasks = (Array.isArray(values) ? values : [])
    .map((value) => ResearchTaskSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);
  return tasks.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function putEvidenceCard(input: EvidenceCard): Promise<EvidenceCard> {
  const card = EvidenceCardSchema.parse(input);
  const db = await openDb();
  const transaction = db.transaction(['research_cards'], 'readwrite');
  await request(transaction.objectStore('research_cards').put(card));
  await transactionDone(transaction);
  db.close();
  return card;
}

export async function getEvidenceCard(cardId: string): Promise<EvidenceCard | null> {
  const db = await openDb();
  const transaction = db.transaction(['research_cards'], 'readonly');
  const value = await request(transaction.objectStore('research_cards').get(cardId));
  await transactionDone(transaction);
  db.close();
  if (!value) return null;
  return EvidenceCardSchema.parse(value);
}

export async function getEvidenceCardByTaskId(taskId: string): Promise<EvidenceCard | null> {
  const db = await openDb();
  const transaction = db.transaction(['research_cards'], 'readonly');
  const value = await request(transaction.objectStore('research_cards').index('by_taskId').get(taskId));
  await transactionDone(transaction);
  db.close();
  if (!value) return null;
  return EvidenceCardSchema.parse(value);
}
