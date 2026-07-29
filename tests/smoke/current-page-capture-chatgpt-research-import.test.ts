import { describe, expect, it, vi } from 'vitest';

import { createCurrentPageCaptureService } from '@services/bootstrap/current-page-capture';

function researchPayload() {
  return {
    reportId: 'report-current-chat',
    results: [
      {
        taskId: 'task-current-chat',
        title: '当前 ChatGPT 研究结果',
        question: '核查这个论点',
        claim: '这个论点可以被核查',
        status: 'supported',
        conclusion: '一手来源支持该论点。',
        evidence: [
          {
            id: 'evidence-1',
            stance: 'support',
            summary: '官方页面提供直接证据。',
            sourceName: 'Official source',
            sourceUrl: 'https://example.com/official',
            publishedAt: '2026-07-28',
            coveragePeriod: null,
            tier: 'A1',
            sourceType: 'official',
            directness: '直接说明相关事实。',
            methodology: null,
            conflictOfInterest: null,
            currentValue: null,
            comparisonValue: null,
            changeRate: null,
            unit: null,
            currency: null,
            comparisonBasis: null,
          },
        ],
        limitations: [],
        unresolvedQuestions: [],
        researchAsOf: '2026-07-28',
      },
    ],
  };
}

describe('current ChatGPT conversation Research import', () => {
  it('previews the latest assistant result, imports it, and optionally archives the full chat', async () => {
    const payload = researchPayload();
    const snapshot = {
      conversation: {
        sourceType: 'chat',
        source: 'chatgpt',
        conversationKey: 'chat-research',
        title: 'Research chat',
        url: 'https://chatgpt.com/c/research',
      },
      messages: [
        { role: 'user', contentText: 'Please research this', sequence: 0 },
        { role: 'assistant', contentText: JSON.stringify(payload), sequence: 1 },
      ],
    };
    const send = vi.fn(async (type: string, request?: any) => {
      if (type === 'importChatGptResearchResults') {
        expect(request).toMatchObject({ reportId: payload.reportId });
        return { ok: true, data: { imported: 1, cardIds: ['card-1'] } };
      }
      if (type === 'upsertConversation') return { ok: true, data: { id: 42, __isNew: true } };
      if (type === 'syncConversationMessages') return { ok: true, data: {} };
      throw new Error(`unexpected message: ${type}`);
    });
    const collector = {
      prepareManualCapture: vi.fn(),
      capture: vi.fn(() => snapshot),
    };
    const service = createCurrentPageCaptureService({
      runtime: { send },
      collectorsRegistry: {
        pickActive: () => ({ id: 'chatgpt', collector }),
        list: () => [],
      } as any,
    });

    await expect(service.previewCurrentChatGptResearch()).resolves.toMatchObject({
      reportId: payload.reportId,
      taskCount: 1,
      evidenceCount: 1,
      taskTitles: ['当前 ChatGPT 研究结果'],
    });
    await expect(service.importCurrentChatGptResearch({ saveConversation: true })).resolves.toMatchObject({
      reportId: payload.reportId,
      imported: 1,
      conversationId: 42,
    });
    expect(collector.prepareManualCapture).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'syncConversationMessages',
      expect.objectContaining({ messages: snapshot.messages }),
    );
  });

  it('does not import arbitrary assistant prose without the structured Research contract', async () => {
    const service = createCurrentPageCaptureService({
      runtime: { send: vi.fn() },
      collectorsRegistry: {
        pickActive: () => ({
          id: 'chatgpt',
          collector: {
            capture: () => ({
              conversation: { source: 'chatgpt', title: 'Ordinary chat' },
              messages: [{ role: 'assistant', contentText: 'This is an ordinary answer.' }],
            }),
          },
        }),
        list: () => [],
      } as any,
    });

    await expect(service.previewCurrentChatGptResearch()).rejects.toThrow('没有找到可导入的 Snap Research');
  });

  it('turns the internal change-rate error into an actionable import message', async () => {
    const payload = researchPayload();
    const service = createCurrentPageCaptureService({
      runtime: {
        send: vi.fn(async (type: string) => {
          if (type === 'importChatGptResearchResults') {
            return { ok: false, error: { message: 'invalid_change_rate' } };
          }
          throw new Error(`unexpected message: ${type}`);
        }),
      },
      collectorsRegistry: {
        pickActive: () => ({
          id: 'chatgpt',
          collector: {
            capture: () => ({
              conversation: { source: 'chatgpt', title: 'Research chat' },
              messages: [{ role: 'assistant', contentText: JSON.stringify(payload) }],
            }),
          },
        }),
        list: () => [],
      } as any,
    });

    await service.previewCurrentChatGptResearch();
    await expect(service.importCurrentChatGptResearch()).rejects.toThrow('部分证据的变化率与原始数值不一致');
  });

  it('reuses the structured import path for a Kimi conversation', async () => {
    const payload = researchPayload();
    const snapshot = {
      conversation: {
        sourceType: 'chat',
        source: 'kimi',
        conversationKey: 'kimi-research',
        title: 'Kimi Research chat',
        url: 'https://www.kimi.com/chat/research',
      },
      messages: [{ role: 'assistant', contentMarkdown: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`` }],
    };
    const send = vi.fn(async (type: string) => {
      if (type === 'importChatGptResearchResults') {
        return { ok: true, data: { imported: 1, cardIds: ['card-kimi'] } };
      }
      throw new Error(`unexpected message: ${type}`);
    });
    const collector = { capture: vi.fn(() => snapshot) };
    const service = createCurrentPageCaptureService({
      runtime: { send },
      collectorsRegistry: {
        pickActive: () => ({ id: 'kimi', collector }),
        list: () => [],
      } as any,
    });

    await expect(service.previewCurrentChatGptResearch()).resolves.toMatchObject({
      providerId: 'kimi',
      providerName: 'Kimi',
      reportId: payload.reportId,
      taskCount: 1,
      evidenceCount: 1,
    });
    await expect(service.importCurrentChatGptResearch({ saveConversation: false })).resolves.toMatchObject({
      reportId: payload.reportId,
      imported: 1,
      conversationId: null,
    });
  });
});
