import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform/webext/tabs', () => ({
  tabsQuery: vi.fn(),
  tabsSendMessage: vi.fn(),
}));

import { tabsQuery, tabsSendMessage } from '../../src/platform/webext/tabs';
import { createTestBackgroundRouter } from './background-router-testkit';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('background-router open inpage comments sidebar', () => {
  it('relays the open comments panel command to the current tab', async () => {
    vi.mocked(tabsSendMessage).mockResolvedValue({ ok: true, data: null, error: null } as any);

    const router = createTestBackgroundRouter();
    const res = await router.__handleMessageForTests(
      {
        type: 'openCurrentTabInpageCommentsPanel',
        source: 'popup',
      },
      { tab: { id: 17 } },
    );

    expect(res.ok).toBe(true);
    expect(tabsSendMessage).toHaveBeenCalledWith(17, {
      type: 'openInpageCommentsPanel',
      payload: {
        tabId: 17,
        source: 'popup',
      },
    });
  });

  it('returns error when sender tab id is unavailable and does not relay', async () => {
    const router = createTestBackgroundRouter();
    const res = await router.__handleMessageForTests(
      {
        type: 'openCurrentTabInpageCommentsPanel',
      },
      { tab: undefined },
    );

    expect(res.ok).toBe(false);
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });
});

describe('background-router open inpage research sidebar', () => {
  it('relays the research task to the current tab', async () => {
    vi.mocked(tabsSendMessage).mockResolvedValue({ ok: true, data: null, error: null } as any);

    const router = createTestBackgroundRouter();
    const res = await router.__handleMessageForTests(
      {
        type: 'openCurrentTabInpageResearchPanel',
        taskId: 'task-7',
        cardId: 'card-4',
        status: 'insufficient',
        conversationId: 31,
        source: 'research',
        conversationKey: 'research:task-7',
        title: '研究卡',
        url: 'https://example.com/source',
      },
      { tab: { id: 23 } },
    );

    expect(res.ok).toBe(true);
    expect(tabsSendMessage).toHaveBeenCalledWith(23, {
      type: 'openInpageResearchPanel',
      payload: {
        taskId: 'task-7',
        cardId: 'card-4',
        status: 'insufficient',
        conversationId: 31,
        source: 'research',
        conversationKey: 'research:task-7',
        title: '研究卡',
        url: 'https://example.com/source',
      },
    });
  });

  it('rejects a request without a task id', async () => {
    const router = createTestBackgroundRouter();
    const res = await router.__handleMessageForTests(
      {
        type: 'openCurrentTabInpageResearchPanel',
      },
      { tab: { id: 23 } },
    );

    expect(res.ok).toBe(false);
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });
});

describe('background-router current ChatGPT Research import', () => {
  it('relays preview and confirmed import to the active ChatGPT tab', async () => {
    vi.mocked(tabsQuery).mockResolvedValue([{ id: 31, url: 'https://chatgpt.com/c/research' }] as any);
    vi.mocked(tabsSendMessage)
      .mockResolvedValueOnce({
        ok: true,
        data: { reportId: 'report-1', taskCount: 2, evidenceCount: 4 },
        error: null,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        data: { reportId: 'report-1', imported: 2 },
        error: null,
      } as any);
    const router = createTestBackgroundRouter();

    const preview = await router.__handleMessageForTests({
      type: 'previewActiveTabChatGptResearch',
    });
    expect(preview).toMatchObject({ ok: true, data: { reportId: 'report-1', taskCount: 2 } });
    expect(tabsSendMessage).toHaveBeenNthCalledWith(1, 31, {
      type: 'previewCurrentChatGptResearch',
    });

    const imported = await router.__handleMessageForTests({
      type: 'importActiveTabChatGptResearch',
      saveConversation: false,
    });
    expect(imported).toMatchObject({ ok: true, data: { reportId: 'report-1', imported: 2 } });
    expect(tabsSendMessage).toHaveBeenNthCalledWith(2, 31, {
      type: 'importCurrentChatGptResearch',
      payload: { saveConversation: false },
    });
  });
});
