import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { __closeDbForTests as closeConversationDb } from '@services/conversations/data/storage-idb';
import { __closeDbForTests as closeImageDb } from '@services/conversations/data/image-inline';
import { createResearchReport } from '@services/research/create-research-report';
import {
  buildChatGptResearchPrompt,
  buildChatGptScreenshotResearchPrompt,
  buildTextFirstResearchPrompt,
  findLatestChatGptResearchImport,
  parseChatGptResearchImport,
} from '@services/research/domain/chatgpt-manual-research';
import { getEvidenceCardByTaskId, getResearchTasksByReportId } from '@services/research/data/storage-idb';
import { importChatGptResearchResults } from '@services/research/import-chatgpt-research-results';

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

async function manualReport(researchContext = '') {
  return createResearchReport({
    executionMode: 'chatgpt_manual',
    candidateClaims: [
      { id: 'claim-1', text: '观点一可被核查。', selected: true },
      { id: 'claim-2', text: '观点二可被核查。', selected: true },
    ],
    pageTitle: '手动研究来源',
    pageUrl: 'https://example.com/source',
    selectedText: '观点一可被核查。观点二可被核查。',
    extractedText: '观点一可被核查。观点二可被核查。',
    researchContext,
    imageDataUrl: '',
    rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
  });
}

function resultFor(task: Awaited<ReturnType<typeof manualReport>>['tasks'][number]) {
  return {
    taskId: task.id,
    title: task.claim!,
    question: task.question!,
    claim: task.claim!,
    status: 'supported',
    conclusion: `已有一手来源支持：${task.claim}`,
    evidence: [
      {
        id: `evidence-${task.id}`,
        stance: 'support',
        summary: '官方页面直接说明了相关事实。',
        sourceName: 'Example Official Source',
        sourceUrl: 'https://example.com/official',
        publishedAt: '2026-07-27',
        coveragePeriod: null,
        tier: 'A1',
        sourceType: 'official',
        directness: '官方页面直接陈述。',
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
    researchAsOf: '2026-07-27',
  };
}

describe('manual ChatGPT research bridge', () => {
  it('creates waiting tasks and generates an exact-ID structured prompt', async () => {
    const researchContext = '优先查找真实法律案例和裁判文书。';
    const created = await manualReport(researchContext);

    expect(created.report.executionMode).toBe('chatgpt_manual');
    expect(created.tasks.map((task) => task.status)).toEqual(['captured', 'captured']);

    const prompt = buildChatGptResearchPrompt({
      report: created.report,
      tasks: created.tasks,
      cards: [],
    });
    expect(prompt).toContain(created.report.id);
    expect(prompt).toContain(created.tasks[0].id);
    expect(prompt).toContain(created.tasks[1].id);
    expect(prompt).toContain('最终只输出一个 JSON 对象');
    expect(prompt).toContain(researchContext);
  });

  it('creates a screenshot-first report without calling claim extraction and imports ChatGPT-created tasks', async () => {
    const created = await createResearchReport({
      executionMode: 'chatgpt_screenshot',
      candidateClaims: [],
      pageTitle: '截图来源',
      pageUrl: 'https://example.com/screenshot',
      selectedText: '',
      extractedText: '',
      researchContext: '优先核查截图里的数字。',
      imageDataUrl: '',
      rect: { x: 4, y: 8, width: 320, height: 180, devicePixelRatio: 2 },
    });
    expect(created.tasks).toEqual([]);
    expect(created.report.candidateClaims).toEqual([]);

    const prompt = buildChatGptScreenshotResearchPrompt({ report: created.report });
    expect(prompt).toContain('读取与本消息一起粘贴的原始截图');
    expect(prompt).toContain(created.report.id);
    expect(prompt).toContain('claim-1');
    expect(prompt).toContain('10 个只是硬上限，不是目标');
    expect(prompt).toContain('优先返回 3 至 7 个');
    expect(prompt).toContain('recommendation_review');
    expect(prompt).toContain('不要按原文的每句话或每个列表项机械拆分');
    expect(prompt).toContain('不能仅因一个限定词或子命题被反驳');
    expect(prompt).toContain('预测、承诺、目标或引用');
    expect(prompt).toContain('状态由核心命题决定');
    expect(prompt).toContain('主体、时间、地区、专业、样本和指标口径');
    expect(prompt).toContain('优先返回 2 条');
    expect(prompt).toContain('最多 3 条');
    expect(prompt).toContain('每个字段只能出现一次');
    expect(prompt).toContain('没有内容时填写 []');
    expect(prompt).toContain('sourceUrl 必须匹配');
    expect(prompt).toContain('禁止出现方括号、圆括号');
    expect(prompt).toContain('A1：');
    expect(prompt).not.toContain('每个论点最多返回 5 条');

    const result = {
      taskId: 'claim-1',
      title: '截图中的数字论点',
      question: '核查这个论点：截图声称该指标增长 20%。',
      claim: '截图声称该指标增长 20%。',
      status: 'supported',
      conclusion: '一手来源支持这个数字。',
      evidence: [
        {
          id: 'evidence-1',
          stance: 'support',
          summary: '官方统计显示相同增幅。',
          sourceName: 'Example Official Source',
          sourceUrl: 'https://example.com/official',
          publishedAt: '2026-07-27',
          coveragePeriod: '2025-2026',
          tier: 'A1',
          sourceType: 'official',
          directness: '与截图中的指标和期间一致。',
          methodology: null,
          conflictOfInterest: null,
          currentValue: 120,
          comparisonValue: 100,
          changeRate: 0.2,
          unit: 'points',
          currency: null,
          comparisonBasis: 'current versus previous',
        },
      ],
      limitations: [],
      unresolvedQuestions: [],
      researchAsOf: '2026-07-27',
    };
    const imported = await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText: JSON.stringify({ reportId: created.report.id, results: [result] }),
    });
    expect(imported.imported).toBe(1);

    const tasks = await getResearchTasksByReportId(created.report.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      claim: result.claim,
      question: result.question,
      status: 'review',
    });
    const card = await getEvidenceCardByTaskId(tasks[0].id);
    expect(card).toMatchObject({ claim: result.claim, taskId: tasks[0].id });
  });

  it('builds the screenshot contract for a Kimi report', async () => {
    const created = await createResearchReport({
      executionMode: 'kimi_screenshot',
      candidateClaims: [],
      pageTitle: 'Kimi screenshot source',
      pageUrl: 'https://example.com/kimi',
      selectedText: '',
      extractedText: '',
      imageDataUrl: '',
      rect: { x: 1, y: 1, width: 120, height: 80, devicePixelRatio: 1 },
    });

    const prompt = buildChatGptScreenshotResearchPrompt({ report: created.report });
    expect(created.report.executionMode).toBe('kimi_screenshot');
    expect(prompt).toContain(created.report.id);
    expect(prompt).toContain('claim-1');
  });

  it('imports a Kimi screenshot result with non-standard evidence tiers conservatively', async () => {
    const created = await createResearchReport({
      executionMode: 'kimi_screenshot',
      candidateClaims: [],
      pageTitle: 'Kimi screenshot source',
      pageUrl: 'https://example.com/kimi',
      selectedText: '',
      extractedText: '',
      imageDataUrl: '',
      rect: { x: 1, y: 1, width: 120, height: 80, devicePixelRatio: 1 },
    });
    const result = resultFor({
      id: 'claim-1',
      claim: '截图声称罗布斯塔咖啡因更高。',
      question: '核查这个论点：截图声称罗布斯塔咖啡因更高。',
    } as Awaited<ReturnType<typeof manualReport>>['tasks'][number]);
    result.evidence = [
      { ...result.evidence[0], id: 'evidence-1', tier: 'S' },
      {
        ...result.evidence[0],
        id: 'evidence-2',
        sourceUrl: 'https://example.com/context',
        tier: 'A',
      },
    ];

    await expect(
      importChatGptResearchResults({
        reportId: created.report.id,
        pastedText: JSON.stringify({ reportId: created.report.id, results: [result] }),
      }),
    ).resolves.toMatchObject({ imported: 1 });

    const tasks = await getResearchTasksByReportId(created.report.id);
    const card = await getEvidenceCardByTaskId(tasks[0].id);
    expect(card?.evidence.map((item) => item.tier)).toEqual(['D', 'D']);
    expect(card?.limitations.join(' ')).toContain('非标准证据等级');
  });

  it('maps a non-standard tier on a known news source to C instead of discarding direct support', async () => {
    const created = await createResearchReport({
      executionMode: 'kimi_screenshot',
      candidateClaims: [],
      pageTitle: 'Kimi screenshot source',
      pageUrl: 'https://example.com/kimi',
      selectedText: '',
      extractedText: '',
      imageDataUrl: '',
      rect: { x: 1, y: 1, width: 120, height: 80, devicePixelRatio: 1 },
    });
    const result = resultFor({
      id: 'claim-1',
      claim: '同期报道记录了该调查结果。',
      question: '核查这个论点：同期报道记录了该调查结果。',
    } as Awaited<ReturnType<typeof manualReport>>['tasks'][number]);
    result.evidence = [
      {
        ...result.evidence[0],
        tier: 'S',
        sourceType: 'news',
        sourceUrl: 'https://www.chinanews.com.cn/example',
      },
    ];

    await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText: JSON.stringify({ reportId: created.report.id, results: [result] }),
    });

    const tasks = await getResearchTasksByReportId(created.report.id);
    const card = await getEvidenceCardByTaskId(tasks[0].id);
    expect(card?.evidence[0]?.tier).toBe('C');
    expect(card?.status).toBe('supported');
  });

  it('imports a Kimi text result that uses null for an empty question list', async () => {
    const created = await createResearchReport({
      executionMode: 'kimi_text',
      candidateClaims: [],
      pageTitle: 'Kimi text source',
      pageUrl: 'https://example.com/kimi-text',
      selectedText: '00后最大的才到26岁，最小的不过16岁。',
      extractedText: '00后最大的才到26岁，最小的不过16岁。',
      imageDataUrl: '',
      rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
    });
    const result = resultFor({
      id: 'claim-1',
      claim: '00后最大的才到26岁，最小的不过16岁。',
      question: '核查这个论点：00后最大的才到26岁，最小的不过16岁。',
    } as Awaited<ReturnType<typeof manualReport>>['tasks'][number]) as ReturnType<typeof resultFor> & {
      unresolvedQuestions: string[] | null;
    };
    result.unresolvedQuestions = null;

    await expect(
      importChatGptResearchResults({
        reportId: created.report.id,
        pastedText: JSON.stringify({ reportId: created.report.id, results: [result] }),
      }),
    ).resolves.toMatchObject({ imported: 1 });

    const tasks = await getResearchTasksByReportId(created.report.id);
    const card = await getEvidenceCardByTaskId(tasks[0].id);
    expect(card?.unresolvedQuestions).toEqual([]);
  });

  it('creates a selected-text Kimi report with waiting tasks and a structured prompt', async () => {
    const created = await createResearchReport({
      executionMode: 'kimi_manual',
      candidateClaims: [{ id: 'claim-1', text: 'Agent 长程任务的可靠闭环执行能力不足。', selected: true }],
      pageTitle: 'Agent目前最大的瓶颈是什么？',
      pageUrl: 'https://www.zhihu.com/question/example',
      selectedText: 'Agent 长程任务的可靠闭环执行能力严重不足。',
      extractedText: 'Agent 长程任务的可靠闭环执行能力严重不足。',
      imageDataUrl: '',
      rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
    });

    const prompt = buildChatGptResearchPrompt({ report: created.report, tasks: created.tasks });
    expect(created.report.executionMode).toBe('kimi_manual');
    expect(created.tasks).toHaveLength(1);
    expect(created.tasks[0].status).toBe('captured');
    expect(prompt).toContain(created.report.id);
    expect(prompt).toContain(created.tasks[0].id);
  });

  it('creates a text-first Kimi report without pre-extracted claims or API tasks', async () => {
    const selectedText = 'Agent 长程任务的可靠闭环执行能力严重不足。';
    const created = await createResearchReport({
      executionMode: 'kimi_text',
      candidateClaims: [],
      pageTitle: 'Agent目前最大的瓶颈是什么？',
      pageUrl: 'https://www.zhihu.com/question/example',
      selectedText,
      extractedText: selectedText,
      imageDataUrl: '',
      rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
    });

    const prompt = buildTextFirstResearchPrompt({ report: created.report });
    expect(created.report.executionMode).toBe('kimi_text');
    expect(created.tasks).toEqual([]);
    expect(prompt).toContain('请读取下方“原始文字”');
    expect(prompt).toContain(selectedText);
    expect(prompt).toContain('claim-1');
    expect(prompt).not.toContain('一起粘贴的原始截图');

    const result = resultFor({
      id: 'claim-1',
      claim: 'Agent 长程任务的可靠闭环执行能力不足。',
      question: '核查这个论点：Agent 长程任务的可靠闭环执行能力不足。',
    } as Awaited<ReturnType<typeof manualReport>>['tasks'][number]);
    const imported = await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText: JSON.stringify({ reportId: created.report.id, results: [result] }),
    });
    expect(imported.imported).toBe(1);
    expect(await getResearchTasksByReportId(created.report.id)).toHaveLength(1);
  });

  it('parses a fenced ChatGPT response and rejects duplicate task IDs', async () => {
    const created = await manualReport();
    const result = resultFor(created.tasks[0]);
    const parsed = parseChatGptResearchImport(
      `\`\`\`json\n${JSON.stringify({ reportId: created.report.id, results: [result] })}\n\`\`\``,
    );
    expect(parsed.results[0].taskId).toBe(created.tasks[0].id);

    expect(() =>
      parseChatGptResearchImport(JSON.stringify({ reportId: created.report.id, results: [result, result] })),
    ).toThrow('重复');
  });

  it('repairs unescaped quotation marks inside a Kimi JSON string before schema validation', async () => {
    const created = await manualReport();
    const result = resultFor(created.tasks[0]);
    result.claim = '博主「测试账号」表示可以自动剪辑';
    result.question = `核查这个论点：${result.claim}`;
    const valid = JSON.stringify({ reportId: created.report.id, results: [result] });
    const kimiStyleInvalid = valid.replaceAll('博主「测试账号」表示可以自动剪辑', '博主"测试账号"表示可以自动剪辑');

    const parsed = parseChatGptResearchImport(kimiStyleInvalid);
    expect(parsed.results[0].claim).toBe('博主"测试账号"表示可以自动剪辑');
    expect(parsed.results[0].question).toContain('"测试账号"');
  });

  it('skips tool-call JSON before the final Kimi Research result', async () => {
    const created = await manualReport();
    const result = resultFor(created.tasks[0]);
    const kimiAssistantMessage = [
      '工具调用过程',
      JSON.stringify({ query: '先搜索资料', count: 10 }),
      '最终答案',
      JSON.stringify({ reportId: created.report.id, results: [result] }),
      'High demand. Switched to K2.6 Instant for speed.',
    ].join('\n');

    const parsed = parseChatGptResearchImport(kimiAssistantMessage);
    expect(parsed.reportId).toBe(created.report.id);
    expect(parsed.results).toHaveLength(1);
  });

  it('finds the latest structured Research result in assistant messages only', async () => {
    const created = await manualReport();
    const older = JSON.stringify({
      reportId: 'older-report',
      results: [resultFor(created.tasks[0])],
    });
    const latest = JSON.stringify({
      reportId: created.report.id,
      results: [resultFor(created.tasks[1])],
    });
    const found = findLatestChatGptResearchImport([
      { role: 'assistant', contentText: older },
      { role: 'user', contentText: latest },
      { role: 'assistant', contentMarkdown: `研究说明\n\n${latest}` },
    ]);

    expect(found?.parsed.reportId).toBe(created.report.id);
    expect(found?.parsed.results[0].taskId).toBe(created.tasks[1].id);
    expect(found?.messageIndex).toBe(2);
  });

  it('validates and imports each task result as a card in the same report', async () => {
    const created = await manualReport();
    const pastedText = JSON.stringify({
      reportId: created.report.id,
      results: created.tasks.map(resultFor),
    });

    const imported = await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText,
    });

    expect(imported.imported).toBe(2);
    const tasks = await getResearchTasksByReportId(created.report.id);
    expect(tasks.map((task) => task.status)).toEqual(['review', 'review']);
    expect(tasks.every((task) => Boolean(task.cardId))).toBe(true);
    const firstCard = await getEvidenceCardByTaskId(tasks[0].id);
    expect(firstCard).toMatchObject({
      reportId: created.report.id,
      taskId: tasks[0].id,
      status: 'supported',
    });
    expect(firstCard?.limitations.join(' ')).not.toContain('手动导入');
  });

  it('accepts a whole-number percentage from ChatGPT and stores it as a decimal change rate', async () => {
    const created = await manualReport();
    const result = resultFor(created.tasks[0]);
    result.evidence[0] = {
      ...result.evidence[0],
      currentValue: 120,
      comparisonValue: 100,
      changeRate: 20,
      unit: 'units',
      comparisonBasis: 'current versus previous',
      coveragePeriod: '2025-2026',
    };

    await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText: JSON.stringify({
        reportId: created.report.id,
        results: [result],
      }),
    });

    const card = await getEvidenceCardByTaskId(created.tasks[0].id);
    expect(card?.evidence[0].changeRate).toBeCloseTo(0.2);
  });

  it('accepts an absolute benchmark-point difference without treating it as a relative change rate', async () => {
    const created = await manualReport();
    const result = resultFor(created.tasks[0]);
    result.evidence[0] = {
      ...result.evidence[0],
      currentValue: 93.23,
      comparisonValue: 87.01,
      changeRate: 6.22,
      unit: 'benchmark points',
      comparisonBasis: 'Unlimited-OCR versus DeepSeek-OCR',
      coveragePeriod: 'OmniDocBench v1.5',
    };

    await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText: JSON.stringify({
        reportId: created.report.id,
        results: [result],
      }),
    });

    const card = await getEvidenceCardByTaskId(created.tasks[0].id);
    expect(card?.evidence[0]).toMatchObject({
      currentValue: 93.23,
      comparisonValue: 87.01,
      changeRate: null,
    });
  });

  it('drops an inconsistent derived change rate instead of aborting the whole manual import', async () => {
    const created = await manualReport();
    const result = resultFor(created.tasks[0]);
    result.evidence[0] = {
      ...result.evidence[0],
      currentValue: 15,
      comparisonValue: 10,
      changeRate: 0.2,
      unit: 'micrograms',
      comparisonBasis: 'supplement amount versus reference amount',
      coveragePeriod: '2026',
    };

    await expect(
      importChatGptResearchResults({
        reportId: created.report.id,
        pastedText: JSON.stringify({
          reportId: created.report.id,
          results: [result],
        }),
      }),
    ).resolves.toMatchObject({ imported: 1 });

    const card = await getEvidenceCardByTaskId(created.tasks[0].id);
    expect(card?.evidence[0]).toMatchObject({
      currentValue: 15,
      comparisonValue: 10,
      changeRate: null,
    });
    expect(card?.limitations.join(' ')).toContain('已移除该派生变化率');
  });

  it('extracts and cleans the target URL from ChatGPT Markdown links', async () => {
    const created = await manualReport();
    const result = resultFor(created.tasks[0]);
    result.evidence[0].sourceUrl =
      '[https://example.com/display](https://example.com/official?article=1&utm_source=chatgpt.com&utm_medium=search)';

    await importChatGptResearchResults({
      reportId: created.report.id,
      pastedText: JSON.stringify({
        reportId: created.report.id,
        results: [result],
      }),
    });

    const card = await getEvidenceCardByTaskId(created.tasks[0].id);
    expect(card?.evidence[0].sourceUrl).toBe('https://example.com/official?article=1');
  });

  it('rejects a result for another report before saving any card', async () => {
    const created = await manualReport();
    await expect(
      importChatGptResearchResults({
        reportId: created.report.id,
        pastedText: JSON.stringify({
          reportId: 'another-report',
          results: [resultFor(created.tasks[0])],
        }),
      }),
    ).rejects.toThrow('reportId');
    expect(await getEvidenceCardByTaskId(created.tasks[0].id)).toBeNull();
  });
});
