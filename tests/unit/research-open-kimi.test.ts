import { afterEach, describe, expect, it, vi } from 'vitest';

import { RESEARCH_MESSAGE_TYPES } from '@platform/messaging/message-contracts';
import { registerResearchHandlers } from '@services/research/background/handlers';

afterEach(() => {
  delete (globalThis as any).chrome;
});

describe('open Kimi research bridge', () => {
  it('opens Kimi, prepares the prompt, and never submits it', async () => {
    const handlers = new Map<string, (message: any) => Promise<any>>();
    const router = {
      ok: (data: unknown) => ({ ok: true, data, error: null }),
      err: (message: string) => ({ ok: false, data: null, error: { message } }),
      register: (type: string, handler: (message: any) => Promise<any>) => handlers.set(type, handler),
    };
    const create = vi.fn(async () => ({ id: 73 }));
    const sendMessage = vi.fn(async () => ({ ok: true, data: { prepared: true } }));
    (globalThis as any).chrome = { tabs: { create, sendMessage } };
    registerResearchHandlers(router);

    await expect(handlers.get(RESEARCH_MESSAGE_TYPES.OPEN_KIMI)?.({ prompt: 'research prompt' })).resolves.toEqual({
      ok: true,
      data: { opened: true, promptPrepared: true },
      error: null,
    });
    expect(create).toHaveBeenCalledWith({ url: 'https://www.kimi.com/' });
    expect(sendMessage).toHaveBeenCalledWith(73, {
      type: 'prepareKimiScreenshotResearch',
      payload: { prompt: 'research prompt' },
    });
  });
});
