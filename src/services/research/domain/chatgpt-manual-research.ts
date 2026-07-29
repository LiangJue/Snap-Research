import { z } from 'zod/v4';

import { ResearchResultSchema, type ResearchResult } from '@services/research/domain/research-result';
import type { EvidenceCard, ResearchReport, ResearchTask } from '@services/research/domain/schemas';
import { isScreenshotResearchMode, isTextFirstResearchMode } from '@services/research/domain/manual-research-provider';

const ChatGptTaskResultSchema = ResearchResultSchema.extend({
  taskId: z.string().min(1).max(100),
});

const ChatGptResearchImportSchema = z.object({
  reportId: z.string().min(1).max(100),
  results: z.array(ChatGptTaskResultSchema).min(1).max(10),
});

export type ChatGptResearchImport = {
  reportId: string;
  results: Array<ResearchResult & { taskId: string }>;
};

export type ChatGptResearchMessage = {
  role?: unknown;
  contentText?: unknown;
  contentMarkdown?: unknown;
};

export type FoundChatGptResearchImport = {
  parsed: ChatGptResearchImport;
  pastedText: string;
  messageIndex: number;
};

function jsonPayload(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return trimmed;
}

function jsonObjectCandidates(value: string): string[] {
  const input = String(value || '');
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character !== '}' || depth <= 0) continue;

    depth -= 1;
    if (depth === 0 && start >= 0) {
      candidates.push(input.slice(start, index + 1));
      start = -1;
    }
  }

  return candidates.length ? candidates : [jsonPayload(input)];
}

function repairUnescapedJsonStringQuotes(payload: string): string {
  let repaired = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (!inString) {
      repaired += character;
      if (character === '"') inString = true;
      continue;
    }

    if (escaped) {
      repaired += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      repaired += character;
      escaped = true;
      continue;
    }
    if (character !== '"') {
      repaired += character;
      continue;
    }

    let lookahead = index + 1;
    while (lookahead < payload.length && /\s/.test(payload[lookahead])) lookahead += 1;
    const next = payload[lookahead];
    const closesJsonString = next === undefined || next === ':' || next === ',' || next === '}' || next === ']';
    if (closesJsonString) {
      repaired += character;
      inString = false;
    } else {
      repaired += '\\"';
    }
  }

  return repaired;
}

function parseJsonPayload(value: string): unknown {
  const payload = jsonPayload(value);
  try {
    return JSON.parse(payload);
  } catch (strictError) {
    const repaired = repairUnescapedJsonStringQuotes(payload);
    if (repaired === payload) throw strictError;
    return JSON.parse(repaired);
  }
}

function plainSourceUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const markdownLink = trimmed.match(/^\[[^\]]*]\((https:\/\/[^\s)]+)\)$/i);
  const candidate = markdownLink?.[1] || trimmed;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return candidate;
    const trackingKeys = [...url.searchParams.keys()].filter((key) =>
      /^(?:utm_.+|gclid|fbclid|msclkid|mc_cid|mc_eid|ref_src)$/i.test(key),
    );
    for (const key of trackingKeys) url.searchParams.delete(key);
    return url.toString();
  } catch (_error) {
    return candidate;
  }
}

const STANDARD_EVIDENCE_TIERS = new Set(['A1', 'A2', 'B', 'C', 'D']);
const NON_STANDARD_TIER_LIMITATION = '系统检查：网页 AI 返回了非标准证据等级；已按来源类型保守重估，请人工复核。';

function inferredTierForSource(sourceUrl: unknown, sourceType: unknown): 'A2' | 'B' | 'C' | 'D' {
  const type = typeof sourceType === 'string' ? sourceType.toLowerCase() : '';
  let hostname = '';
  try {
    hostname = new URL(typeof sourceUrl === 'string' ? sourceUrl : '').hostname.toLowerCase();
  } catch (_error) {
    // Unknown or malformed sources are intentionally treated conservatively.
  }

  if (
    /(?:^|\.)(?:gov\.[a-z]{2}|gov|go\.[a-z]{2}|gc\.ca)$/i.test(hostname) ||
    ['europa.eu', 'oecd.org', 'un.org', 'who.int', 'worldbank.org'].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return 'A2';
  }
  if (
    ['doi.org', 'nature.com', 'science.org', 'sciencedirect.com', 'springer.com'].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) ||
    /paper|journal|study|systematic review|research/.test(type)
  ) {
    return 'B';
  }
  if (
    ['apnews.com', 'bbc.com', 'bbc.co.uk', 'chinanews.com.cn', 'huxiu.com', 'reuters.com', 'thepaper.cn'].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) ||
    /news|media|journalism|secondary/.test(type)
  ) {
    return 'C';
  }
  return 'D';
}

function normalizedEvidenceTier(
  value: unknown,
  sourceUrl: unknown,
  sourceType: unknown,
): { value: unknown; downgraded: boolean } {
  if (typeof value !== 'string') return { value, downgraded: false };
  const normalized = value.trim().toUpperCase();
  if (STANDARD_EVIDENCE_TIERS.has(normalized)) {
    return { value: normalized, downgraded: false };
  }
  return { value: inferredTierForSource(sourceUrl, sourceType), downgraded: true };
}

function normalizeManualImportShape(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.results)) return value;
  return {
    ...input,
    results: input.results.map((rawResult) => {
      if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) return rawResult;
      const result = rawResult as Record<string, unknown>;
      if (!Array.isArray(result.evidence)) return rawResult;
      let downgradedTier = false;
      const evidence = result.evidence.map((rawEvidence) => {
        if (!rawEvidence || typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) return rawEvidence;
        const item = rawEvidence as Record<string, unknown>;
        const sourceUrl = plainSourceUrl(item.sourceUrl);
        const tier = normalizedEvidenceTier(item.tier, sourceUrl, item.sourceType);
        downgradedTier ||= tier.downgraded;
        return {
          ...item,
          sourceUrl,
          tier: tier.value,
        };
      });
      const rawLimitations = result.limitations === null ? [] : result.limitations;
      const limitations =
        downgradedTier && Array.isArray(rawLimitations) && rawLimitations.every((item) => typeof item === 'string')
          ? [...new Set([...rawLimitations, NON_STANDARD_TIER_LIMITATION])].slice(0, 5)
          : rawLimitations;
      return {
        ...result,
        evidence,
        limitations,
        unresolvedQuestions: result.unresolvedQuestions === null ? [] : result.unresolvedQuestions,
      };
    }),
  };
}

export function parseChatGptResearchImport(value: string): ChatGptResearchImport {
  let parsedAnyCandidate = false;
  for (const candidate of jsonObjectCandidates(value)) {
    let parsed: unknown;
    try {
      parsed = parseJsonPayload(candidate);
      parsedAnyCandidate = true;
    } catch (_error) {
      continue;
    }
    const result = ChatGptResearchImportSchema.safeParse(normalizeManualImportShape(parsed));
    if (!result.success) continue;

    const taskIds = result.data.results.map((item) => item.taskId);
    if (new Set(taskIds).size !== taskIds.length) {
      throw new Error('网页 AI 结果中包含重复的 taskId。');
    }
    return result.data;
  }

  if (!parsedAnyCandidate) {
    throw new Error('无法读取网页 AI 结果：请粘贴完整的 JSON 结果。');
  }
  throw new Error('网页 AI 结果结构不完整，请确认复制了包含 reportId 和 results 的完整 JSON。');
}

export function findLatestChatGptResearchImport(
  messages: readonly ChatGptResearchMessage[],
): FoundChatGptResearchImport | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message?.role || '').trim() !== 'assistant') continue;
    const candidates = [
      String(message?.contentMarkdown || '').trim(),
      String(message?.contentText || '').trim(),
    ].filter((value, candidateIndex, all) => value && all.indexOf(value) === candidateIndex);
    for (const pastedText of candidates) {
      try {
        return {
          parsed: parseChatGptResearchImport(pastedText),
          pastedText,
          messageIndex: index,
        };
      } catch (_error) {
        // Keep scanning older assistant messages until a valid Research payload is found.
      }
    }
  }
  return null;
}

function researchResultExample(input: { taskId: string; question: string; claim: string }) {
  return {
    taskId: input.taskId,
    title: '不超过 60 字的标题',
    question: input.question,
    claim: input.claim,
    status: 'supported',
    conclusion: '不超过 220 字的结论',
    evidence: [
      {
        id: 'evidence-1',
        stance: 'support',
        summary: '不超过 160 字的证据摘要',
        sourceName: '来源名称',
        sourceUrl: 'https://example.com/source',
        publishedAt: '2026-07-27',
        coveragePeriod: null,
        tier: 'A1',
        sourceType: 'official',
        directness: '不超过 120 字，说明该来源如何直接支持或反驳核心命题',
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
    limitations: ['不超过 120 字的证据局限'],
    unresolvedQuestions: ['不超过 120 字的待确认问题'],
    researchAsOf: new Date().toISOString().slice(0, 10),
  };
}

function buildSourceFirstResearchPrompt(input: { report: ResearchReport }): string {
  const textMode = isTextFirstResearchMode(input.report.executionMode);
  const materialLabel = textMode ? '原始文字' : '截图';
  if (!textMode && !isScreenshotResearchMode(input.report.executionMode)) {
    throw new Error('当前 Report 不是原始材料直送网页 AI 模式。');
  }
  const outputExample = {
    reportId: input.report.id,
    results: [
      researchResultExample({
        taskId: 'claim-1',
        question: '核查这个论点：从截图中逐字提取的可核查陈述',
        claim: '从截图中逐字提取的可核查陈述',
      }),
    ],
  };

  const lines = [
    textMode
      ? '请读取下方“原始文字”，先拆分其中的可核查论点，再逐条进行网页研究。'
      : '请读取与本消息一起粘贴的原始截图，先拆分其中的可核查论点，再逐条进行网页研究。',
    '开始搜索前，先在内部完成研究模式判断、论点去重和证据口径规划；不要输出中间过程。',
    '',
    '研究模式：',
    '1. 默认使用 fact_check：核查事实、数字、事件、引用、归因和因果陈述。',
    `2. 如果${materialLabel}主要是流程、建议或经验观点，且补充问题要求判断是否合理或寻找更好方案，使用 recommendation_review：评估适用条件、风险、反例和更优做法。`,
    '3. 不要在 JSON 中新增研究模式字段；两种模式都使用下方同一输出结构。',
    '',
    '拆分要求：',
    `1. 只提取${materialLabel}中明确表达且与补充问题相关的内容；不要把标题、按钮、情绪表达或无关背景当作论点。`,
    `2. 10 个只是硬上限，不是目标；优先返回 3 至 7 个实质不同的论点，${materialLabel}内容较少时可以更少。`,
    '3. 同一主体、同一因果链或依赖同一组证据的重复表述必须合并；只有各部分可能得到不同结论或需要不同证据时，才拆开复合陈述。',
    '4. recommendation_review 不要按原文的每句话或每个列表项机械拆分；共享同一决策、适用条件和主要证据的建议必须合并，通常优先形成 3 至 5 个决策单元。',
    '5. 尽量保留限定词、主体和时间，每个论点必须能独立理解且不超过 250 字。',
    '6. 遇到预测、承诺、目标或引用时，claim 必须明确写成“某人在某时预测／承诺／表示……”；status 只判断该发言归属是否真实，未来结果本身必须说明尚未验证。',
    '7. 为每个论点依次使用 taskId：claim-1、claim-2……；question 固定写成“核查这个论点：”加上该 claim。',
    '8. 如果原文用一个核心因果、解释或建议回答标题问题，至少有一个 claim 必须覆盖这个核心命题；不能只挑容易搜索的外围数字、日期或背景事实。',
    '',
    '状态判定要求：',
    '1. 状态由核心命题决定，不能因为外围事实成立就把缺乏直接证据的核心因果关系判为 mixed。',
    '2. 复合论点中不同子命题可能得到不同状态时，必须拆分或缩小 claim；不能仅因一个限定词或子命题被反驳，就把整个复合论点判为 countered。countered 要求核心命题整体受到直接反证。',
    '3. fact_check 中：supported 表示核心命题有直接证据支持且无实质反证；countered 表示核心命题被直接反驳；mixed 只用于同一原子论点的核心部分同时存在直接支持与直接反证；insufficient 表示原则上可核查但直接证据不足；unverifiable 表示含义过于模糊、不可操作化或未来结果尚不可验证。',
    '4. recommendation_review 中：supported 表示建议在所述条件下有充分依据；countered 表示证据显示该建议通常不合理或有害；mixed 表示是否合理取决于条件和权衡；insufficient 表示建议看似可行但缺乏直接证据；unverifiable 表示建议过于笼统，无法定义判断标准。',
    '',
    '来源与证据要求：',
    '1. 使用网页搜索，同时寻找支持证据与反证，并优先采用政府、监管机构、法院、公司公告、原始论文、标准或其他一手来源。',
    '2. 每个论点优先返回 2 条最直接、质量最高且真正访问过的来源；确有冲突或需要交叉验证时最多 3 条，不要为了凑数添加低相关来源。',
    '3. 主体、时间、地区、专业、样本和指标口径必须与论点一致；不一致的证据只能标为 context，不能单独决定 supported、countered 或 mixed。',
    '4. 对个人选择、动机或因果关系，优先寻找本人陈述、同期记录或直接研究；宏观统计不能替代个人因果证据。',
    '5. tier 按与当前论点的证据关系判断，而不是只看发布者名气：',
    '   A1：直接证明核心命题的一手权威材料，例如法律、裁判、监管文件、官方统计、原始论文、正式记录或当事人的原始发言。',
    '   A2：机构、大学或公司的官方资料，能够直接说明自身事实，但存在宣传、覆盖范围或方法披露限制。',
    '   B：方法透明的独立研究、系统综述或高质量专业报告。',
    '   C：可靠新闻、二手分析或无法取得一手材料时的可信转述。',
    '   D：社交帖子、论坛、聚合内容、匿名材料或未经独立核实的说法。',
    '6. 公司或机构的官方材料只能作为其自身行为、产品、政策或原话的一手证据；不能自动作为效果、普遍性或因果关系的独立证明。',
    '7. 不得编造来源、发布日期、数字或引文。数字比较必须保持单位、币种、期间、样本和比较口径一致；changeRate 使用小数比例，例如增长 20% 填写 0.2，下降 20% 填写 -0.2。',
    '8. 每条 evidence 的 summary、directness、数值和比较口径必须全部由该条 sourceUrl 自身支持；不得把另一个网页的数据拼进当前来源。若两个数来自不同页面，必须拆成两条 evidence。',
    '9. 同一 sourceUrl 同时提供直接支持和背景信息时，优先保留能决定 status 的 support 或 counter；不要让 context 覆盖直接证据。',
    '10. A1/A2 必须同时满足发布者身份和与当前命题的直接关系；新闻、知乎、豆瓣、百科、论坛或聚合页不能标为 A1/A2。',
    '',
    '输出要求：',
    '1. title 不超过 60 字，conclusion 不超过 220 字，每条 evidence.summary 不超过 160 字，directness 不超过 120 字；limitations 最多 3 项，unresolvedQuestions 最多 2 项，每项不超过 120 字。',
    '2. sourceUrl 必须匹配 ^https://[^\\s\\[\\]\\(\\)]+$；禁止出现方括号、圆括号或任何 Markdown 语法。若搜索结果是 Markdown 链接，只保留括号内的真实目标网址，并删除 utm_* 等跟踪参数。',
    '3. publishedAt 只填写页面明确标注的发布日期，无法确认时填写 null；不得把访问日期当作发布日期。',
    '4. limitations 和 unresolvedQuestions 必须始终为数组；没有内容时填写 []，不能填写 null。',
    '5. 输出前自检：reportId 原样返回；taskId 唯一且连续；每个字段只能出现一次；所有枚举值合法；没有值的可空字段写 null。',
    '6. JSON 字符串内容中不要使用英文双引号；引用名称或原话时统一改用中文直角引号「」或书名号。',
    '7. 最终只输出一个可由标准 JSON.parse 读取的 JSON 对象，不要 Markdown 代码块，不要解释文字。',
    '',
    `Report ID: ${input.report.id}`,
    `来源页面: ${input.report.capture.pageTitle || '未命名页面'}`,
    `来源网址: ${input.report.capture.pageUrl || '无'}`,
    '',
    '补充研究范围或背景（每个论点都必须遵守）：',
    input.report.capture.researchContext || '无额外要求。',
    ...(textMode
      ? ['', '原始文字：', input.report.capture.selectedText || input.report.capture.extractedText || '无可用原文。']
      : []),
    '',
    '严格按照下面的 JSON 形状输出。results 必须包含 1 至 10 项；status 只能是 supported、countered、mixed、insufficient、unverifiable；',
    'stance 只能是 support、counter、context；tier 只能是 A1、A2、B、C、D；没有值的可空字段必须写 null。',
    JSON.stringify(outputExample, null, 2),
  ];
  return (textMode ? lines.map((line) => line.replaceAll('截图', '原始文字')) : lines).join('\n');
}

export function buildChatGptScreenshotResearchPrompt(input: { report: ResearchReport }): string {
  if (!isScreenshotResearchMode(input.report.executionMode)) {
    throw new Error('当前 Report 不是截图直送网页 AI 模式。');
  }
  return buildSourceFirstResearchPrompt(input);
}

export function buildTextFirstResearchPrompt(input: { report: ResearchReport }): string {
  if (!isTextFirstResearchMode(input.report.executionMode)) {
    throw new Error('当前 Report 不是文字直送网页 AI 模式。');
  }
  return buildSourceFirstResearchPrompt(input);
}

export function buildChatGptResearchPrompt(input: {
  report: ResearchReport;
  tasks: ResearchTask[];
  cards?: EvidenceCard[];
}): string {
  const completedTaskIds = new Set((input.cards || []).map((card) => card.taskId));
  const tasks = input.tasks
    .filter((task) => !completedTaskIds.has(task.id))
    .map((task) => ({
      taskId: task.id,
      question: task.question || `核查这个论点：${task.claim || ''}`,
      claim: task.claim || '',
    }));
  if (!tasks.length) throw new Error('这个 Report 中的所有论点都已经有研究结果。');

  const sourceContext = input.report.capture.selectedText || input.report.capture.extractedText;
  const outputExample = {
    reportId: input.report.id,
    results: tasks.map(researchResultExample),
  };

  return [
    '请分别研究下面每一个论点。每个论点是独立 Research Task，但所有结果属于同一个 Report。',
    '',
    '研究要求：',
    '1. 使用网页搜索，并优先采用政府、监管机构、法院、公司公告、论文或其他一手来源。',
    '2. 同时寻找支持证据与反证；没有足够证据时必须使用 insufficient 或 unverifiable。',
    '3. 每个任务优先返回 2 条、最多返回 3 条真正访问过且最直接的来源；sourceUrl 必须是可直接打开的纯 HTTPS 网址，不能使用 Markdown 链接格式。',
    '4. 不得编造来源、发布日期、数字或引文。数字比较需保持单位、币种和比较口径一致。',
    '   changeRate 必须使用小数比例，例如增长 20% 填写 0.2，下降 20% 填写 -0.2。',
    '5. 每条 evidence 的摘要、数值与比较口径必须由该条 sourceUrl 自身支持，不得把另一个页面的数据拼入当前来源。',
    '6. A1/A2 必须同时满足发布者身份和与当前命题的直接关系；新闻、知乎、豆瓣、百科、论坛或聚合页不能标为 A1/A2。',
    '7. question、claim、taskId 和 reportId 必须原样返回，不能改写。',
    '8. limitations 和 unresolvedQuestions 必须始终为数组；没有内容时填写 []，不能填写 null。',
    '9. 最终只输出一个 JSON 对象，不要 Markdown 代码块，不要解释文字。',
    '',
    `Report ID: ${input.report.id}`,
    `来源页面: ${input.report.capture.pageTitle || '未命名页面'}`,
    `来源网址: ${input.report.capture.pageUrl || '无'}`,
    '',
    '补充研究范围或背景（每个任务都必须遵守）：',
    input.report.capture.researchContext || '无额外要求。',
    '',
    '原始内容：',
    sourceContext || '无可用原文，请仅根据论点进行核查。',
    '',
    '需要研究的任务：',
    JSON.stringify(tasks, null, 2),
    '',
    '严格按照下面的 JSON 形状输出。status 只能是 supported、countered、mixed、insufficient、unverifiable；',
    'stance 只能是 support、counter、context；tier 只能是 A1、A2、B、C、D；没有值的可空字段必须写 null。',
    JSON.stringify(outputExample, null, 2),
  ].join('\n');
}
