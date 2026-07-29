import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import ReactDOM from 'react-dom/client';
import { JSDOM } from 'jsdom';

import type { EvidenceCard, ResearchReport, ResearchTask } from '../../src/services/research/domain/schemas';

const mocks = vi.hoisted(() => ({
  getEvidenceCard: vi.fn(),
  getResearchReport: vi.fn(),
  getResearchTask: vi.fn(),
  importChatGptResearchResults: vi.fn(),
  openChatGptForManualResearch: vi.fn(),
  updateEvidenceCardJudgment: vi.fn(),
}));

vi.mock('../../src/services/research/client/repo', () => mocks);

import { EvidenceCardBody, ResearchReportPanel, ResearchTaskPanel } from '../../src/ui/research/ResearchCardView';
import { scrollOutlineEntryIntoView } from '../../src/ui/reader/scroll-outline-entry';
import { buildResearchSidebarShadowCss } from '../../src/ui/research/research-sidebar-shadow-styles';

const task: ResearchTask = {
  id: 'task-1',
  status: 'review',
  question: '问题',
  claim: '主张',
  capture: {
    pageTitle: '来源',
    pageUrl: 'https://example.com/source',
    capturedAt: '2026-07-23T10:00:00.000+08:00',
    imageAssetId: null,
    rect: { x: 0, y: 0, width: 640, height: 480, devicePixelRatio: 1 },
    selectedText: '',
    extractedText: '主张',
  },
  cardId: 'card-1',
  backendJobId: null,
  conversationId: 1,
  attempt: 1,
  errorCode: null,
  createdAt: '2026-07-23T10:00:00.000+08:00',
  updatedAt: '2026-07-23T10:01:00.000+08:00',
};

const card: EvidenceCard = {
  id: 'card-1',
  taskId: 'task-1',
  title: '核查',
  question: '问题',
  claim: '主张',
  status: 'insufficient',
  conclusion: '证据不足。',
  evidence: [],
  limitations: [],
  unresolvedQuestions: [],
  researchAsOf: '2026-07-23',
  sourcePageTitle: '来源',
  sourcePageUrl: 'https://example.com/source',
  extractedText: '主张',
  judgment: { decision: 'unreviewed', note: '', nextAction: '', reviewedAt: null },
  createdAt: '2026-07-23T10:01:00.000+08:00',
  updatedAt: '2026-07-23T10:01:00.000+08:00',
};

const manualTask: ResearchTask = {
  ...task,
  id: 'task-manual',
  reportId: 'report-manual',
  status: 'captured',
  claim: '需要 ChatGPT 核查的主张',
  question: '核查这个论点：需要 ChatGPT 核查的主张',
  cardId: null,
  attempt: 0,
};

const manualReport: ResearchReport = {
  id: 'report-manual',
  status: 'researching',
  executionMode: 'chatgpt_manual',
  capture: manualTask.capture,
  candidateClaims: [{ id: 'claim-1', text: manualTask.claim!, selected: true }],
  taskIds: [manualTask.id],
  conversationId: 1,
  createdAt: manualTask.createdAt,
  updatedAt: manualTask.updatedAt,
};

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: dom.window.Element });
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: dom.window.Node });
  Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
}

function cleanupDom() {
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MouseEvent']) {
    delete (globalThis as Record<string, unknown>)[key];
  }
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
}

async function flushDom() {
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe('research sidebar interactions', () => {
  let root: ReactDOM.Root | null = null;

  beforeEach(() => {
    setupDom();
    mocks.getEvidenceCard.mockResolvedValue(card);
    mocks.getResearchReport.mockResolvedValue({
      report: manualReport,
      tasks: [manualTask],
      cards: [],
    });
    mocks.getResearchTask.mockResolvedValue(task);
    mocks.importChatGptResearchResults.mockResolvedValue({ imported: 1, cardIds: ['card-imported'] });
    mocks.openChatGptForManualResearch.mockResolvedValue(undefined);
    mocks.updateEvidenceCardJudgment.mockImplementation(async ({ decision }) => ({
      ...card,
      judgment: {
        ...card.judgment,
        decision,
        reviewedAt: '2026-07-23T10:02:00.000+08:00',
      },
    }));
    root = ReactDOM.createRoot(document.getElementById('root')!);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.clearAllMocks();
    cleanupDom();
  });

  it('shows which judgment was saved after a decision button is clicked', async () => {
    act(() => {
      root!.render(createElement(ResearchTaskPanel, { taskId: task.id, cardId: card.id, status: task.status }));
    });
    await flushDom();

    const followUp = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '标记待跟进',
    ) as HTMLButtonElement | undefined;
    expect(followUp).toBeTruthy();

    await act(async () => {
      followUp!.click();
      await Promise.resolve();
    });
    await flushDom();

    expect(mocks.updateEvidenceCardJudgment).toHaveBeenCalledWith({
      cardId: 'card-1',
      decision: 'needs_followup',
      note: '',
    });
    expect(followUp?.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain('已保存：标记待跟进');
  });

  it('separates system checks from source limitations and can hide repeated source material', async () => {
    const qualityCard: EvidenceCard = {
      ...card,
      limitations: ['样本范围有限。', '系统检查：证据等级已保守降级。'],
    };
    act(() => {
      root!.render(createElement(EvidenceCardBody, { card: qualityCard, showOriginalClue: false }));
    });
    await flushDom();

    expect(document.body.textContent).toContain('局限');
    expect(document.body.textContent).toContain('样本范围有限');
    expect(document.body.textContent).toContain('系统检查');
    expect(document.body.textContent).toContain('证据等级已保守降级');
    expect(document.body.textContent).not.toContain('查看原始线索');
  });

  it('writes a structured prompt into ChatGPT and keeps the manual import fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    act(() => {
      root!.render(createElement(ResearchReportPanel, { reportId: manualReport.id }));
    });
    await flushDom();

    const openChatGpt = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '打开 ChatGPT（无需 API）',
    ) as HTMLButtonElement | undefined;
    expect(openChatGpt).toBeTruthy();
    await act(async () => {
      openChatGpt!.click();
      await Promise.resolve();
    });
    await flushDom();

    expect(mocks.openChatGptForManualResearch).toHaveBeenCalledWith(expect.stringContaining(manualTask.id));
    expect(writeText).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('研究提示词已写入 ChatGPT');

    const showImport = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '手动粘贴（备用）',
    ) as HTMLButtonElement | undefined;
    expect(showImport).toBeTruthy();
    act(() => showImport!.click());
    expect(document.querySelector('textarea[placeholder*="reportId"]')).toBeTruthy();
  });

  it('scrolls the actual sidebar scroll root when an outline item is picked', () => {
    const scrollRoot = document.createElement('main');
    const heading = document.createElement('h2');
    Object.defineProperty(scrollRoot, 'scrollTop', { configurable: true, writable: true, value: 120 });
    scrollRoot.getBoundingClientRect = () => ({
      top: 80,
      bottom: 680,
      left: 0,
      right: 400,
      width: 400,
      height: 600,
      x: 0,
      y: 80,
      toJSON: () => ({}),
    });
    heading.getBoundingClientRect = () => ({
      top: 440,
      bottom: 480,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 440,
      toJSON: () => ({}),
    });
    heading.scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    Object.defineProperty(scrollRoot, 'scrollTo', { configurable: true, value: scrollTo });

    scrollOutlineEntryIntoView({ index: 2, level: 2, id: 'evidence', title: '证据', element: heading }, scrollRoot);

    expect(scrollTo).toHaveBeenCalledWith({ top: 480, behavior: 'smooth' });
    expect(heading.scrollIntoView).not.toHaveBeenCalled();
  });

  it('constrains the research React root so the detail body owns vertical scrolling', () => {
    const css = buildResearchSidebarShadowCss();
    const rootRule = css.match(/\.webclipper-inpage-comments-panel__react-root\s*\{([^}]+)\}/)?.[1] || '';

    expect(rootRule).toContain('display: flex');
    expect(rootRule).toContain('flex-direction: column');
    expect(rootRule).toContain('min-height: 0');
    expect(rootRule).toContain('overflow: hidden');
  });

  it('keeps header action menus above the outline rail hit area', () => {
    const css = buildResearchSidebarShadowCss();
    const actionsRule = css.match(/\[data-detail-header-actions='true'\]\s*\{([^}]+)\}/)?.[1] || '';
    const outlineRule = css.match(/\[data-reader-outline-toolbar-slot\]\s*\{([^}]+)\}/)?.[1] || '';

    expect(actionsRule).toContain('z-index: 40');
    expect(outlineRule).toContain('z-index: 30');
  });
});
