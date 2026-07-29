import type { Evidence, EvidenceCard } from '@services/research/domain/schemas';
import { rankEvidence } from '@services/research/domain/rank-source';

const STATUS_LABEL: Record<EvidenceCard['status'], string> = {
  supported: '有证据支持',
  countered: '存在反证',
  mixed: '证据混合',
  insufficient: '证据不足',
  unverifiable: '暂时无法核查',
};

const STANCE_LABEL: Record<Evidence['stance'], string> = {
  support: '支持',
  counter: '反证',
  context: '背景',
};

function clean(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 10 || (code >= 32 && code !== 127);
    })
    .join('');
}

function yaml(value: string | null | undefined): string {
  return JSON.stringify(clean(value));
}

function inline(value: string | null | undefined): string {
  return clean(value)
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[图片数据已省略]')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]<>#+!|~])/g, '\\$1');
}

function safeHttpUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch (_error) {
    return '';
  }
}

function sourceLink(evidence: Evidence): string {
  const label = inline(evidence.sourceName) || '来源';
  const url = safeHttpUrl(evidence.sourceUrl);
  return url ? `[${label}](${url})` : label;
}

function list(values: readonly string[], emptyLabel = '无'): string {
  return values.length ? values.map((value) => `- ${inline(value)}`).join('\n') : emptyLabel;
}

export function cardToMarkdown(card: EvidenceCard): string {
  const qualityWarnings = card.limitations.filter((item) => item.startsWith('系统检查：'));
  const limitations = card.limitations.filter((item) => !item.startsWith('系统检查：'));
  const evidence = rankEvidence(card.evidence)
    .map((item) => {
      const meta = [item.tier, STANCE_LABEL[item.stance], item.publishedAt].filter(Boolean).join(' / ');
      return `- **${inline(meta)}** ${inline(item.summary)} — ${sourceLink(item)}`;
    })
    .join('\n');

  const pageUrl = card.sourcePageUrl ? safeHttpUrl(card.sourcePageUrl) : '';
  const sourcePage = pageUrl
    ? `[${inline(card.sourcePageTitle || '原始页面')}](${pageUrl})`
    : inline(card.sourcePageTitle) || '无';

  const frontmatter = [
    '---',
    `title: ${yaml(card.title)}`,
    `type: ${yaml('evidence-card')}`,
    `status: ${yaml(card.status)}`,
    `research_as_of: ${yaml(card.researchAsOf)}`,
    `source_url: ${yaml(card.sourcePageUrl ?? '')}`,
    `task_id: ${yaml(card.taskId)}`,
    '---',
  ].join('\n');

  return `${frontmatter}

# ${inline(card.title)}

## 研究问题

${inline(card.question)}

## 待核查主张

${inline(card.claim)}

## 结论

**${STATUS_LABEL[card.status]}：** ${inline(card.conclusion)}

## 证据

${evidence || '未找到可核查证据。'}

## 局限

${list(limitations)}

## 系统检查

${list(qualityWarnings.map((item) => item.replace(/^系统检查：/, '')))}

## 尚未解决

${list(card.unresolvedQuestions)}

## 我的判断

- 决定：${inline(card.judgment.decision)}
- 下一步：${inline(card.judgment.nextAction) || '未填写'}
- 备注：${inline(card.judgment.note) || '未填写'}

## 原始线索

- 页面：${sourcePage}
- 原始材料：

> ${inline(card.extractedText).replace(/\n/g, '\n> ') || '无'}
`;
}
