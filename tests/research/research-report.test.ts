import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import {
  __closeDbForTests as closeConversationDb,
  getConversationById,
  getMessagesByConversationId,
} from '@services/conversations/data/storage-idb';
import { __closeDbForTests as closeImageDb } from '@services/conversations/data/image-inline';
import { createResearchReport } from '@services/research/create-research-report';
import { runResearchTask } from '@services/research/background/run-research-task';
import { importChatGptResearchResults } from '@services/research/import-chatgpt-research-results';
import { updateEvidenceCardJudgment } from '@services/research/update-evidence-card-judgment';
import { getResearchReport, getResearchTasksByReportId } from '@services/research/data/storage-idb';
import {
  extractScenarioClaimsFromNumberedList,
  normalizeCandidateClaims,
  updateCandidateClaimText,
} from '@services/research/domain/candidate-claims';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1YQAAAAASUVORK5CYII=';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('webclipper');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  // @ts-expect-error test IndexedDB implementation
  globalThis.indexedDB = indexedDB;
  // @ts-expect-error test IndexedDB implementation
  globalThis.IDBKeyRange = IDBKeyRange;
  await closeConversationDb();
  await closeImageDb();
  await deleteDatabase();
});

afterEach(async () => {
  await closeConversationDb();
  await closeImageDb();
});

describe('Candidate Claim extraction seam', () => {
  it('keeps each numbered legal scenario together instead of splitting its sub-checks into separate tasks', () => {
    const claims = extractScenarioClaimsFromNumberedList(`
热知识：
• 1，你的配偶和其他人约会、撩骚、发生亲密关系不违反法律，你试图阻止这一行为均有可能违法
• 2，你的配偶婚内和别人生孩子不犯法，而且你对孩子还有抚养义务，这个孩子对你们的夫妻共同财产还有继承权
• 3，如果你发现配偶与其他人偷情以后殴打配偶或第三者，你会被抓起来然后作为过错方被要求赔偿对方损失
• 4，如果你的配偶在与第三者偷情时死在床上，你需要支付丧葬费
现在请陈述一下当代婚姻的意义是什么
`);

    expect(claims.map((claim) => claim.text)).toEqual([
      '你的配偶和其他人约会、撩骚、发生亲密关系不违反法律，你试图阻止这一行为均有可能违法',
      '你的配偶婚内和别人生孩子不犯法，而且你对孩子还有抚养义务，这个孩子对你们的夫妻共同财产还有继承权',
      '如果你发现配偶与其他人偷情以后殴打配偶或第三者，你会被抓起来然后作为过错方被要求赔偿对方损失',
      '如果你的配偶在与第三者偷情时死在床上，你需要支付丧葬费',
    ]);
  });

  it('keeps checklist selection while applying an edited task statement', () => {
    const claims = normalizeCandidateClaims(['原始观点一', '原始观点二']);

    const edited = updateCandidateClaimText(claims, 0, ' 编辑后的情境观点 ');

    expect(edited).toEqual([
      { id: 'claim-1', text: '编辑后的情境观点', selected: true },
      { id: 'claim-2', text: '原始观点二', selected: true },
    ]);
  });

  it('returns distinct single claims in display order and caps the checklist at ten', () => {
    const claims = normalizeCandidateClaims([
      '公司收入同比增长 20%。',
      '公司收入同比增长 20%。',
      '新产品将在 2027 年量产。',
      ...Array.from({ length: 12 }, (_, index) => `可核查观点 ${index + 1}`),
    ]);

    expect(claims).toHaveLength(10);
    expect(claims.slice(0, 2).map((claim) => claim.text)).toEqual([
      '公司收入同比增长 20%。',
      '新产品将在 2027 年量产。',
    ]);
    expect(claims.every((claim) => claim.selected)).toBe(true);
  });
});

describe('Research Report creation seam', () => {
  it('replaces the waiting placeholder after screenshot research is imported', async () => {
    const created = await createResearchReport({
      candidateClaims: [],
      executionMode: 'chatgpt_screenshot',
      researchContext: '他的观点对吗？',
      pageTitle: '就业讨论',
      pageUrl: 'https://example.com/employment',
      selectedText: '',
      extractedText: '原帖认为大学毕业生就业压力增加。',
      imageDataUrl: ONE_PIXEL_PNG,
      rect: { x: 0, y: 0, width: 300, height: 180, devicePixelRatio: 1 },
    });
    const claim = '美国大学毕业生的就业压力正在增加。';

    await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText: JSON.stringify({
        reportId: created.report.id,
        results: [
          {
            taskId: 'claim-1',
            title: '大学毕业生就业压力',
            question: `核查这个论点：${claim}`,
            claim,
            status: 'insufficient',
            conclusion: '现有公开证据不足以判断该说法适用于所有大学毕业生。',
            evidence: [],
            limitations: ['缺少统一口径的长期数据。'],
            unresolvedQuestions: [],
            researchAsOf: '2026-07-28',
          },
        ],
      }),
    });

    const messages = await getMessagesByConversationId(created.report.conversationId!);
    expect(messages[0].contentMarkdown).toContain(`- [x] ${claim}`);
    expect(messages[0].contentMarkdown).toContain('状态：已从 ChatGPT 导入 1 个论点的研究结果。');
    expect(messages[0].contentMarkdown).not.toContain('等待 ChatGPT');
  });

  it('preserves supplementary research scope in the report and formal API request', async () => {
    const researchContext = '查找每个论点对应的真实法律案例和裁判文书。';
    const created = await createResearchReport({
      candidateClaims: [{ id: 'claim-1', text: '该法律说法成立。', selected: true }],
      researchContext,
      pageTitle: '法律讨论',
      pageUrl: 'https://example.com/law',
      selectedText: '该法律说法成立。',
      extractedText: '该法律说法成立。',
      imageDataUrl: '',
      rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
    });

    expect(created.report.capture.researchContext).toBe(researchContext);
    expect(created.tasks[0].capture.researchContext).toBe(researchContext);

    await runResearchTask(created.tasks[0].id, {
      requestImpl: async (request) => {
        expect(request.researchContext).toBe(researchContext);
        return {
          model: 'test-model',
          usage: null,
          sourceUrls: [],
          result: {
            title: '法律观点核查',
            question: request.question!,
            claim: request.claim!,
            status: 'insufficient',
            conclusion: '公开证据不足。',
            evidence: [],
            limitations: ['证据不足。'],
            unresolvedQuestions: [],
            researchAsOf: '2026-07-28',
          },
        };
      },
    });

    const messages = await getMessagesByConversationId(created.report.conversationId!);
    expect(messages[0].contentMarkdown).toContain(researchContext);
  });

  it('creates a text-only report without an image asset', async () => {
    const created = await createResearchReport({
      candidateClaims: [{ id: 'claim-1', text: '纯文字观点。', selected: true }],
      pageTitle: '文字来源',
      pageUrl: 'https://example.com/text',
      selectedText: '纯文字观点。',
      extractedText: '纯文字观点。',
      imageDataUrl: '',
      rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
    });

    expect(created.report.capture.imageAssetId).toBeNull();
    await runResearchTask(created.tasks[0].id, {
      requestImpl: async (request) => {
        expect(request.imageDataUrl).toBe('');
        expect(request.selectedText).toBe('纯文字观点。');
        return {
          model: 'test-model',
          usage: null,
          sourceUrls: [],
          result: {
            title: '纯文字观点核查',
            question: request.question!,
            claim: request.claim!,
            status: 'insufficient',
            conclusion: '公开证据不足。',
            evidence: [],
            limitations: ['证据不足。'],
            unresolvedQuestions: [],
            researchAsOf: '2026-07-26',
          },
        };
      },
    });
    const messages = await getMessagesByConversationId(created.report.conversationId!);
    expect(messages[0].contentMarkdown).toContain('纯文字观点。');
    expect(messages[0].contentMarkdown).not.toContain('![原始截图]');
    expect(messages).toHaveLength(2);
  });

  it('creates one report conversation and one queued task for each selected claim', async () => {
    const created = await createResearchReport({
      candidateClaims: [
        { id: 'claim-1', text: '公司收入同比增长 20%。', selected: true },
        { id: 'claim-2', text: '新产品将在 2027 年量产。', selected: true },
        { id: 'claim-3', text: '这是未经选择的观点。', selected: false },
      ],
      pageTitle: '行业截图',
      pageUrl: 'https://example.com/report',
      selectedText: '',
      extractedText: '公司收入同比增长 20%。新产品将在 2027 年量产。',
      imageDataUrl: ONE_PIXEL_PNG,
      rect: { x: 10, y: 20, width: 300, height: 180, devicePixelRatio: 2 },
    });

    expect(created.tasks).toHaveLength(2);
    expect(created.tasks.map((task) => task.claim)).toEqual(['公司收入同比增长 20%。', '新产品将在 2027 年量产。']);
    expect(new Set(created.tasks.map((task) => task.reportId))).toEqual(new Set([created.report.id]));
    expect(new Set(created.tasks.map((task) => task.conversationId))).toEqual(new Set([created.report.conversationId]));

    expect(await getResearchReport(created.report.id)).toEqual(created.report);
    expect((await getResearchTasksByReportId(created.report.id)).map((task) => task.id)).toEqual(
      created.report.taskIds,
    );

    const conversation = await getConversationById(created.report.conversationId!);
    expect(conversation).toMatchObject({
      conversationKey: `research-report:${created.report.id}`,
      researchReportId: created.report.id,
    });

    let messages = await getMessagesByConversationId(created.report.conversationId!);
    expect(messages).toHaveLength(1);
    expect(messages[0].contentMarkdown).toContain(`syncnos-asset://${created.report.capture.imageAssetId}`);
    expect(messages[0].contentMarkdown).toContain('公司收入同比增长 20%。');
    expect(messages[0].contentMarkdown).toContain('新产品将在 2027 年量产。');
  });

  it('appends every task result to the same report instead of replacing earlier results', async () => {
    const created = await createResearchReport({
      candidateClaims: [
        { id: 'claim-1', text: '观点一可被核查。', selected: true },
        { id: 'claim-2', text: '观点二可被核查。', selected: true },
      ],
      pageTitle: '组合截图',
      pageUrl: 'https://example.com/report',
      imageDataUrl: ONE_PIXEL_PNG,
      rect: { x: 0, y: 0, width: 300, height: 180, devicePixelRatio: 1 },
    });

    for (const task of created.tasks) {
      await runResearchTask(task.id, {
        requestImpl: async (request) => {
          expect(request.reportId).toBe(created.report.id);
          return {
            model: 'test-model',
            usage: null,
            sourceUrls: [],
            result: {
              title: request.claim!,
              question: request.question!,
              claim: request.claim!,
              status: 'insufficient',
              conclusion: `尚无足够证据：${request.claim}`,
              evidence: [],
              limitations: ['公开证据不足。'],
              unresolvedQuestions: [],
              researchAsOf: '2026-07-26',
            },
          };
        },
      });
    }

    let messages = await getMessagesByConversationId(created.report.conversationId!);
    expect(messages.map((message) => message.messageKey)).toEqual([
      `research-report:${created.report.id}`,
      expect.stringMatching(/^research-card:/),
      expect.stringMatching(/^research-card:/),
    ]);
    expect(new Set((await getResearchTasksByReportId(created.report.id)).map((task) => task.conversationId))).toEqual(
      new Set([created.report.conversationId]),
    );

    const firstCompletedTask = (await getResearchTasksByReportId(created.report.id))[0];
    await updateEvidenceCardJudgment({
      cardId: firstCompletedTask.cardId!,
      decision: 'accepted',
      note: '采用第一项。',
    });
    messages = await getMessagesByConversationId(created.report.conversationId!);
    expect(messages).toHaveLength(3);
  });
});
