import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  getEvidenceCard,
  getResearchReport,
  getResearchTask,
  importChatGptResearchResults,
  openChatGptForManualResearch,
  openKimiForManualResearch,
  updateEvidenceCardJudgment,
} from '@services/research/client/repo';
import { getImageCacheAssetById } from '@services/conversations/data/image-cache-read';
import { copyImageToClipboard } from '@services/research/content/chatgpt-screenshot-clipboard';
import {
  buildChatGptResearchPrompt,
  buildChatGptScreenshotResearchPrompt,
  buildTextFirstResearchPrompt,
} from '@services/research/domain/chatgpt-manual-research';
import { researchDurationMs } from '@services/research/domain/research-duration';
import { normalizeResearchSourceUrl } from '@services/research/domain/research-result';
import type { Evidence, EvidenceCard, ResearchTask } from '@services/research/domain/schemas';
import {
  isScreenshotResearchMode,
  isSourceFirstResearchMode,
  isTextFirstResearchMode,
  manualResearchProviderForMode,
  manualResearchProviderName,
} from '@services/research/domain/manual-research-provider';
import { readerPrefsToCssVars } from '@services/protocols/reader-prefs';
import { ArticleReaderView } from '@ui/conversations/views/ArticleReaderView';
import type { DetailViewSharedProps } from '@ui/conversations/views/detail-view-props';
import { useArticleOutlineMinimap } from '@ui/reader/ArticleOutlineMinimap';
import type { ReaderOutlineDomEntry } from '@ui/reader/article-outline-dom';
import { ReaderHeaderToolbar } from '@ui/reader/ReaderHeaderToolbar';
import { ReaderToolbar, type ReaderToolbarNarration } from '@ui/reader/ReaderToolbar';
import { scrollOutlineEntryIntoView } from '@ui/reader/scroll-outline-entry';
import { buttonFilledClassName, buttonTintClassName } from '@ui/shared/button-styles';
import { useConversationsApp } from '@viewmodels/conversations/conversations-context';
import { useReaderPrefs } from '@viewmodels/reader/useReaderPrefs';
import { useAppThemeMode } from '@viewmodels/theme/useAppThemeMode';

type Props = DetailViewSharedProps & {
  readerFeatures: {
    textLayout: boolean;
    theme: boolean;
    narration: boolean;
  };
  readerToolbarPortalTarget: HTMLDivElement | null;
  readerOutlinePortalTarget: HTMLDivElement | null;
  outlineScrollRoot: Element | null;
};

type ResearchTaskPanelProps = {
  taskId: string;
  cardId?: string | null;
  status?: string | null;
  fallback?: ReactNode;
  onChanged?: () => void | Promise<void>;
  manualImport?: boolean;
  manualProviderName?: 'ChatGPT' | 'Kimi';
  showOriginalClue?: boolean;
};

const MAX_RESEARCH_MS = 10 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  captured: '已截取',
  queued: '等待研究',
  researching: '正在研究',
  review: '等待你的判断',
  complete: '研究完成',
  failed: '研究失败',
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

const DECISION_LABEL = {
  accepted: '接受',
  needs_followup: '标记待跟进',
  rejected: '不采纳',
} as const;

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function EvidenceCardBody({
  card,
  showOriginalClue = true,
}: {
  card: EvidenceCard;
  showOriginalClue?: boolean;
}) {
  const sourcePageUrl = card.sourcePageUrl ? normalizeResearchSourceUrl(card.sourcePageUrl) : null;
  const qualityWarnings = card.limitations.filter((item) => item.startsWith('系统检查：'));
  const limitations = card.limitations.filter((item) => !item.startsWith('系统检查：'));

  return (
    <article className="tw-mx-auto tw-w-full tw-max-w-3xl tw-space-y-6 tw-pb-10">
      <header className="tw-space-y-2">
        <div className="tw-text-sm tw-font-semibold tw-text-[var(--text-secondary)]">
          {STATUS_LABEL[card.status]} · 核查截至 {card.researchAsOf}
        </div>
        <h1 className="tw-text-2xl tw-font-semibold tw-leading-tight tw-text-[var(--text-primary)]">{card.title}</h1>
      </header>

      <section className="tw-space-y-2">
        <h2 className="tw-text-base tw-font-semibold tw-text-[var(--text-primary)]">结论</h2>
        <p className="tw-m-0 tw-text-base tw-leading-7 tw-text-[var(--text-primary)]">{card.conclusion}</p>
      </section>

      <section className="tw-space-y-3">
        <div>
          <h2 className="tw-m-0 tw-text-sm tw-font-semibold tw-text-[var(--text-secondary)]">研究问题</h2>
          <p className="tw-mb-0 tw-mt-1 tw-leading-7 tw-text-[var(--text-primary)]">{card.question}</p>
        </div>
        <div>
          <h2 className="tw-m-0 tw-text-sm tw-font-semibold tw-text-[var(--text-secondary)]">待核查主张</h2>
          <p className="tw-mb-0 tw-mt-1 tw-leading-7 tw-text-[var(--text-primary)]">{card.claim}</p>
        </div>
      </section>

      <section className="tw-space-y-3">
        <h2 className="tw-text-base tw-font-semibold tw-text-[var(--text-primary)]">证据</h2>
        {card.evidence.length ? (
          <div className="tw-space-y-4">
            {card.evidence.map((item) => {
              const sourceUrl = normalizeResearchSourceUrl(item.sourceUrl);
              return (
                <div
                  key={item.id}
                  className="tw-border-l-2 tw-border-[var(--border-subtle)] tw-pl-4 tw-text-sm tw-leading-6"
                >
                  <div className="tw-font-semibold tw-text-[var(--text-primary)]">
                    {item.tier} · {STANCE_LABEL[item.stance]}
                    {item.publishedAt ? ` · ${item.publishedAt}` : ''}
                  </div>
                  <p className="tw-mb-0 tw-mt-1 tw-text-[var(--text-primary)]">{item.summary}</p>
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="tw-mt-1 tw-inline-block tw-break-words tw-text-[var(--text-primary)] tw-underline hover:tw-opacity-80"
                    >
                      {item.sourceName || '查看来源'}
                    </a>
                  ) : (
                    <div className="tw-mt-1 tw-text-[var(--text-secondary)]">{item.sourceName}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="tw-text-sm tw-text-[var(--text-secondary)]">未找到可核查证据。</p>
        )}
      </section>

      {limitations.length ? (
        <section className="tw-space-y-2">
          <h2 className="tw-text-base tw-font-semibold tw-text-[var(--text-primary)]">局限</h2>
          <ul className="tw-list-disc tw-space-y-1 tw-pl-5 tw-text-sm tw-leading-6 tw-text-[var(--text-primary)]">
            {limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {qualityWarnings.length ? (
        <section className="tw-space-y-2">
          <h2 className="tw-text-base tw-font-semibold tw-text-[var(--text-primary)]">系统检查</h2>
          <ul className="tw-list-disc tw-space-y-1 tw-pl-5 tw-text-sm tw-leading-6 tw-text-[var(--text-primary)]">
            {qualityWarnings.map((item) => (
              <li key={item}>{item.replace(/^系统检查：/, '')}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.unresolvedQuestions.length ? (
        <section className="tw-space-y-2">
          <h2 className="tw-text-base tw-font-semibold tw-text-[var(--text-primary)]">尚未解决</h2>
          <ul className="tw-list-disc tw-space-y-1 tw-pl-5 tw-text-sm tw-leading-6 tw-text-[var(--text-primary)]">
            {card.unresolvedQuestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {showOriginalClue ? (
        <details className="tw-rounded-[var(--radius-card)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-raised)] tw-p-3 tw-text-sm">
          <summary className="tw-cursor-pointer tw-font-semibold tw-text-[var(--text-primary)]">查看原始线索</summary>
          <div className="tw-mt-3 tw-space-y-3">
            {sourcePageUrl ? (
              <a
                href={sourcePageUrl}
                target="_blank"
                rel="noreferrer"
                className="tw-block tw-break-words tw-text-[var(--text-primary)] tw-underline hover:tw-opacity-80"
              >
                {card.sourcePageTitle || '打开原始页面'}
              </a>
            ) : (
              <div className="tw-text-[var(--text-secondary)]">{card.sourcePageTitle || '无原始页面'}</div>
            )}
            {card.extractedText ? (
              <blockquote className="tw-m-0 tw-whitespace-pre-wrap tw-break-words tw-border-l-2 tw-border-[var(--border-subtle)] tw-pl-4 tw-leading-6 tw-text-[var(--text-secondary)]">
                {card.extractedText}
              </blockquote>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}

export function ResearchTaskPanel({
  taskId,
  cardId: initialCardId,
  status: initialStatus,
  fallback,
  onChanged,
  manualImport = false,
  manualProviderName = 'ChatGPT',
  showOriginalClue = true,
}: ResearchTaskPanelProps) {
  const [task, setTask] = useState<ResearchTask | null>(null);
  const [card, setCard] = useState<EvidenceCard | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedFeedback, setSavedFeedback] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const notifiedTerminalRef = useRef('');
  const effectiveCardId = String(task?.cardId || initialCardId || '').trim();
  const effectiveStatus = String(card?.status || task?.status || initialStatus || 'queued').trim();
  const active =
    !manualImport &&
    (effectiveStatus === 'captured' || effectiveStatus === 'queued' || effectiveStatus === 'researching');

  useEffect(() => {
    let disposed = false;
    if (!taskId) {
      setTask(null);
      return;
    }

    const load = async () => {
      try {
        const value = await getResearchTask(taskId);
        if (!disposed) setTask(value);
      } catch (reason) {
        if (!disposed) setError(String((reason as Error)?.message || reason));
      }
    };
    void load();
    if (!active) return () => void (disposed = true);
    const timer = window.setInterval(() => void load(), 4_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active, taskId]);

  useEffect(() => {
    let disposed = false;
    if (!effectiveCardId) {
      setCard(null);
      return;
    }
    void getEvidenceCard(effectiveCardId)
      .then((value) => {
        if (disposed) return;
        setCard(value);
        setNote(value?.judgment.note || '');
      })
      .catch((reason) => {
        if (!disposed) setError(String((reason as Error)?.message || reason));
      });
    return () => {
      disposed = true;
    };
  }, [effectiveCardId]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (active || (!card && effectiveStatus !== 'failed')) return;
    const terminalKey = `${taskId}:${effectiveStatus}:${effectiveCardId}`;
    if (notifiedTerminalRef.current === terminalKey) return;
    notifiedTerminalRef.current = terminalKey;
    void onChanged?.();
  }, [active, card, effectiveCardId, effectiveStatus, onChanged, taskId]);

  const statusLabel = useMemo(
    () =>
      manualImport && !card ? `等待导入 ${manualProviderName} 结果` : STATUS_LABEL[effectiveStatus] || effectiveStatus,
    [card, effectiveStatus, manualImport, manualProviderName],
  );
  const durationMs = researchDurationMs(task, card, nowMs);

  const save = async (decision: 'accepted' | 'rejected' | 'needs_followup') => {
    if (!effectiveCardId || busy) return;
    setBusy(true);
    setError('');
    setSavedFeedback('');
    try {
      const saved = await updateEvidenceCardJudgment({ cardId: effectiveCardId, decision, note });
      setCard(saved);
      setSavedFeedback(`已保存：${DECISION_LABEL[decision]}`);
      await onChanged?.();
    } catch (reason) {
      setError(String((reason as Error)?.message || reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tw-space-y-4">
      <section className="tw-rounded-[var(--radius-card)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-raised)] tw-p-4">
        <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
          <div>
            <div className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-[var(--text-secondary)]">
              Research Task
            </div>
            <div className="tw-mt-1 tw-text-base tw-font-semibold tw-text-[var(--text-primary)]" aria-live="polite">
              {statusLabel}
            </div>
          </div>
          {durationMs != null ? (
            <div className="tw-text-right tw-text-xs tw-font-semibold tw-text-[var(--text-secondary)]">
              <div>
                {active ? '已研究' : '研究用时'} {formatDuration(durationMs)}
              </div>
              <div className="tw-mt-1">最长 {formatDuration(MAX_RESEARCH_MS)}</div>
            </div>
          ) : null}
        </div>

        {effectiveStatus === 'failed' && task?.errorCode ? (
          <div className="tw-mt-3 tw-text-sm tw-text-[var(--error)]">失败原因：{task.errorCode}</div>
        ) : null}

        {card ? (
          <div className="tw-mt-4 tw-space-y-3">
            <label className="tw-block">
              <span className="tw-text-sm tw-font-medium tw-text-[var(--text-primary)]">我的判断备注</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                rows={3}
                className="tw-mt-2 tw-w-full tw-resize-y tw-rounded-[var(--radius-control)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-base)] tw-px-3 tw-py-2 tw-text-sm tw-text-[var(--text-primary)]"
                placeholder="这张卡是否足以支持你的下一步决策？"
              />
            </label>
            <div className="tw-flex tw-flex-wrap tw-gap-2">
              <button
                type="button"
                className={card.judgment.decision === 'accepted' ? buttonFilledClassName() : buttonTintClassName()}
                disabled={busy}
                aria-pressed={card.judgment.decision === 'accepted'}
                onClick={() => void save('accepted')}
              >
                接受
              </button>
              <button
                type="button"
                className={
                  card.judgment.decision === 'needs_followup' ? buttonFilledClassName() : buttonTintClassName()
                }
                disabled={busy}
                aria-pressed={card.judgment.decision === 'needs_followup'}
                onClick={() => void save('needs_followup')}
              >
                标记待跟进
              </button>
              <button
                type="button"
                className={card.judgment.decision === 'rejected' ? buttonFilledClassName() : buttonTintClassName()}
                disabled={busy}
                aria-pressed={card.judgment.decision === 'rejected'}
                onClick={() => void save('rejected')}
              >
                不采纳
              </button>
            </div>
            {savedFeedback ? (
              <div
                className="tw-text-sm tw-font-semibold tw-text-[var(--text-secondary)]"
                role="status"
                aria-live="polite"
              >
                {savedFeedback}
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <div className="tw-mt-3 tw-text-sm tw-text-[var(--error)]">{error}</div> : null}
      </section>

      {card ? <EvidenceCardBody card={card} showOriginalClue={showOriginalClue} /> : fallback}
    </div>
  );
}

export function ResearchReportPanel({
  reportId,
  onChanged,
  fallback,
}: {
  reportId: string;
  onChanged?: () => void | Promise<void>;
  fallback?: ReactNode;
}) {
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof getResearchReport>>>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [promptFallback, setPromptFallback] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const value = await getResearchReport(reportId);
    setBundle(value);
    return value;
  }, [reportId]);

  useEffect(() => {
    let disposed = false;
    void load()
      .then((bundle) => {
        if (!disposed) setBundle(bundle);
      })
      .catch((reason) => {
        if (!disposed) setError(String((reason as Error)?.message || reason));
      });
    return () => {
      disposed = true;
    };
  }, [load]);

  const tasks = bundle?.tasks || [];
  const cards = bundle?.cards || [];
  const screenshotImport = Boolean(bundle && isScreenshotResearchMode(bundle.report.executionMode));
  const textFirstImport = Boolean(bundle && isTextFirstResearchMode(bundle.report.executionMode));
  const sourceFirstImport = Boolean(bundle && isSourceFirstResearchMode(bundle.report.executionMode));
  const provider = bundle ? manualResearchProviderForMode(bundle.report.executionMode) : null;
  const providerName = provider ? manualResearchProviderName(provider) : 'ChatGPT';
  const manualImport = Boolean(bundle && bundle.report.executionMode !== 'api');
  const pendingTasks = tasks.filter((task) => !cards.some((card) => card.taskId === task.id));
  const showManualResearchControls = sourceFirstImport ? cards.length === 0 : pendingTasks.length > 0;
  const reportSourceUrl = bundle?.report.capture.pageUrl
    ? normalizeResearchSourceUrl(bundle.report.capture.pageUrl)
    : null;
  const reportSourceText = bundle?.report.capture.selectedText || bundle?.report.capture.extractedText || '';
  const statusSummary = Object.entries(
    cards.reduce<Record<string, number>>((summary, card) => {
      summary[card.status] = (summary[card.status] || 0) + 1;
      return summary;
    }, {}),
  )
    .map(([status, count]) => `${STATUS_LABEL[status] || status} ${count}`)
    .join(' · ');

  const openManualResearch = async () => {
    if (!bundle || busy) return;
    setError('');
    setFeedback('');
    setPromptFallback('');
    let prompt = '';
    try {
      prompt = screenshotImport
        ? buildChatGptScreenshotResearchPrompt({ report: bundle.report })
        : textFirstImport
          ? buildTextFirstResearchPrompt({ report: bundle.report })
          : buildChatGptResearchPrompt({
              report: bundle.report,
              tasks: bundle.tasks,
              cards: bundle.cards,
            });
    } catch (reason) {
      setError(String((reason as Error)?.message || reason));
      return;
    }
    try {
      if (screenshotImport) {
        const imageAssetId = bundle.report.capture.imageAssetId;
        const image = imageAssetId
          ? await getImageCacheAssetById({
              id: imageAssetId,
              conversationId: bundle.report.conversationId,
            })
          : null;
        if (!image) throw new Error('找不到这个 Report 保存的原始截图。');
        if (!(await copyImageToClipboard(image.blob))) {
          throw new Error('浏览器没有允许复制截图。');
        }
        setFeedback(`截图已复制；正在打开 ${providerName} 并写入研究提示词。`);
      }
    } catch (reason) {
      setPromptFallback(prompt);
      setFeedback(
        screenshotImport
          ? String((reason as Error)?.message || '没有复制截图。请从 Report 重新尝试。')
          : '研究提示词准备失败，请手动复制下面的提示词。',
      );
      if (screenshotImport) return;
    }
    try {
      if (provider === 'kimi') {
        await openKimiForManualResearch(prompt);
      } else {
        await openChatGptForManualResearch(prompt);
      }
      if (screenshotImport) {
        setFeedback(`研究提示词已写入 ${providerName}。请粘贴截图，确认图片出现后再发送。`);
      } else {
        setFeedback(`研究提示词已写入 ${providerName}，请确认后发送。`);
      }
    } catch (reason) {
      setError(String((reason as Error)?.message || reason));
    }
  };

  const importResults = async () => {
    if (!importText.trim() || busy) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const result = await importChatGptResearchResults({ reportId, pastedText: importText });
      setImportText('');
      setFeedback(`已导入 ${result.imported} 个研究结果。`);
      await load();
      await onChanged?.();
    } catch (reason) {
      setError(String((reason as Error)?.message || reason));
    } finally {
      setBusy(false);
    }
  };

  if (error && !bundle) return <div className="tw-text-sm tw-text-[var(--error)]">{error}</div>;
  if (!tasks.length && !sourceFirstImport) return fallback;

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-3xl tw-space-y-8">
      <header className="tw-space-y-2">
        <div className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-[var(--text-secondary)]">
          Research Report
        </div>
        <h1 className="tw-m-0 tw-text-2xl tw-font-semibold tw-text-[var(--text-primary)]">
          {sourceFirstImport && !tasks.length
            ? `等待 ${providerName} 拆分${textFirstImport ? '所选文字' : '截图'}论点`
            : `${tasks.length} 个论点`}
        </h1>
        <p className="tw-m-0 tw-text-sm tw-text-[var(--text-secondary)]">
          {sourceFirstImport && !tasks.length
            ? textFirstImport
              ? `所选文字和研究提示词会写入 ${providerName} 输入框；导入结果后会自动生成论点和 Evidence Cards。`
              : `研究提示词会写入 ${providerName} 输入框，原始截图单独复制供你粘贴；导入结果后会自动生成论点和 Evidence Cards。`
            : '每个论点分别研究，所有结果保留在同一个 Report。'}
        </p>
        {statusSummary ? (
          <div className="tw-rounded-[var(--radius-card)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-raised)] tw-p-3">
            <div className="tw-text-sm tw-font-semibold tw-text-[var(--text-primary)]">结论概览</div>
            <div className="tw-mt-1 tw-text-sm tw-leading-6 tw-text-[var(--text-secondary)]">{statusSummary}</div>
          </div>
        ) : null}
        {manualImport && cards.length ? (
          <div className="tw-rounded-[var(--radius-card)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-raised)] tw-p-3 tw-text-sm tw-leading-6 tw-text-[var(--text-secondary)]">
            这些结果由用户从 {providerName} 手动导入。Snap Research
            已校验结构、来源网址、数值关系和基础证据门槛，但不会替代人工确认来源内容与最终结论。
          </div>
        ) : null}
        {bundle ? (
          <details className="tw-rounded-[var(--radius-card)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-raised)] tw-p-3 tw-text-sm">
            <summary className="tw-cursor-pointer tw-font-semibold tw-text-[var(--text-primary)]">
              查看{textFirstImport ? '原始文字' : screenshotImport ? '截图文字' : '原始材料'}
            </summary>
            <div className="tw-mt-3 tw-space-y-3">
              {reportSourceUrl ? (
                <a
                  href={reportSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="tw-block tw-break-words tw-text-[var(--text-primary)] tw-underline hover:tw-opacity-80"
                >
                  {bundle.report.capture.pageTitle || '打开原始页面'}
                </a>
              ) : (
                <div className="tw-text-[var(--text-secondary)]">{bundle.report.capture.pageTitle || '无原始页面'}</div>
              )}
              {reportSourceText ? (
                <blockquote className="tw-m-0 tw-whitespace-pre-wrap tw-break-words tw-border-l-2 tw-border-[var(--border-subtle)] tw-pl-4 tw-leading-6 tw-text-[var(--text-secondary)]">
                  {reportSourceText}
                </blockquote>
              ) : null}
            </div>
          </details>
        ) : null}
        {showManualResearchControls ? (
          <div className="tw-space-y-3 tw-rounded-[var(--radius-card)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-raised)] tw-p-4">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-[var(--text-primary)]">
                使用你的 {providerName} 研究
              </div>
              <p className="tw-mb-0 tw-mt-1 tw-text-sm tw-leading-6 tw-text-[var(--text-secondary)]">
                {sourceFirstImport
                  ? `${
                      textFirstImport
                        ? `请确认 ${providerName} 输入框里已出现所选文字和研究提示词。`
                        : `粘贴后请确认 ${providerName} 输入框里同时出现截图和提示词。`
                    }研究完成后，在该页面打开 Snap Research，点击“导入当前 ${providerName} 研究”。`
                  : `研究提示词会直接写入 ${providerName}。研究完成后，在该页面打开 Snap Research，点击“导入当前 ${providerName} 研究”；插件会先预览任务和证据，再导入当前 Report。`}
              </p>
            </div>
            <div className="tw-flex tw-flex-wrap tw-gap-2">
              <button
                type="button"
                className={buttonFilledClassName()}
                disabled={busy}
                onClick={() => void openManualResearch()}
              >
                {screenshotImport ? `复制截图和提示词并打开 ${providerName}` : `打开 ${providerName}（无需 API）`}
              </button>
              <button
                type="button"
                className={buttonTintClassName()}
                disabled={busy}
                aria-expanded={showImport}
                onClick={() => setShowImport((value) => !value)}
              >
                手动粘贴（备用）
              </button>
            </div>
            {promptFallback ? (
              <label className="tw-block">
                <span className="tw-text-sm tw-font-medium tw-text-[var(--text-primary)]">研究提示词</span>
                <textarea
                  readOnly
                  value={promptFallback}
                  rows={8}
                  onFocus={(event) => event.currentTarget.select()}
                  className="tw-mt-2 tw-w-full tw-resize-y tw-rounded-[var(--radius-control)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-base)] tw-px-3 tw-py-2 tw-text-xs tw-leading-5 tw-text-[var(--text-primary)]"
                />
              </label>
            ) : null}
            {showImport ? (
              <div className="tw-space-y-2">
                <label className="tw-block">
                  <span className="tw-text-sm tw-font-medium tw-text-[var(--text-primary)]">
                    自动读取失败时，粘贴 {providerName} 返回的完整 JSON
                  </span>
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    rows={9}
                    className="tw-mt-2 tw-w-full tw-resize-y tw-rounded-[var(--radius-control)] tw-border tw-border-[var(--border-subtle)] tw-bg-[var(--surface-base)] tw-px-3 tw-py-2 tw-text-xs tw-leading-5 tw-text-[var(--text-primary)]"
                    placeholder='{"reportId":"...","results":[...]}'
                  />
                </label>
                <button
                  type="button"
                  className={buttonFilledClassName()}
                  disabled={busy || !importText.trim()}
                  onClick={() => void importResults()}
                >
                  {busy ? '正在校验并导入…' : '校验并导入'}
                </button>
              </div>
            ) : null}
            {feedback ? (
              <div
                className="tw-text-sm tw-font-semibold tw-text-[var(--text-secondary)]"
                role="status"
                aria-live="polite"
              >
                {feedback}
              </div>
            ) : null}
            {error ? <div className="tw-text-sm tw-text-[var(--error)]">{error}</div> : null}
          </div>
        ) : null}
        {!pendingTasks.length && feedback ? (
          <div className="tw-text-sm tw-font-semibold tw-text-[var(--text-secondary)]" role="status" aria-live="polite">
            {feedback}
          </div>
        ) : null}
      </header>
      {tasks.map((task, index) => (
        <section
          key={task.id}
          className="tw-border-t tw-border-[var(--border-subtle)] tw-pt-8"
          aria-label={`论点 ${index + 1}`}
        >
          <div className="tw-mb-4 tw-text-sm tw-font-semibold tw-text-[var(--text-secondary)]">
            论点 {index + 1}/{tasks.length}：{task.claim}
          </div>
          <ResearchTaskPanel
            taskId={task.id}
            cardId={task.cardId}
            status={task.status}
            manualImport={manualImport}
            manualProviderName={providerName}
            showOriginalClue={false}
            onChanged={onChanged}
            fallback={
              <div className="tw-rounded-[var(--radius-card)] tw-bg-[var(--surface-raised)] tw-p-4 tw-text-sm tw-text-[var(--text-secondary)]">
                {manualImport
                  ? '等待你从 ChatGPT 导入这个论点的结构化结果。'
                  : '正在分别核查这个论点，结果完成后会显示在这里。'}
              </div>
            }
          />
        </section>
      ))}
    </div>
  );
}

export function ResearchCardView(props: Props) {
  const { refreshActiveDetail, refreshList } = useConversationsApp();
  const { prefs, update } = useReaderPrefs();
  const themeTarget = useMemo(() => {
    const rootNode = props.readerToolbarPortalTarget?.getRootNode();
    if (!rootNode) return null;
    if ('host' in rootNode && rootNode.host instanceof HTMLElement) return rootNode.host;
    if (rootNode instanceof Document) return rootNode.documentElement;
    return null;
  }, [props.readerToolbarPortalTarget]);
  const { mode: themeMode, update: updateThemeMode } = useAppThemeMode({ target: themeTarget });
  const [outlineRoot, setOutlineRoot] = useState<HTMLDivElement | null>(null);
  const outline = useArticleOutlineMinimap(outlineRoot, props.outlineScrollRoot);
  const cardId = String(props.selected?.researchCardId || '').trim();
  const taskId = String(props.selected?.researchTaskId || '').trim();
  const reportId = String(props.selected?.researchReportId || '').trim();
  const status = String(props.selected?.researchStatus || 'queued').trim();
  const readerVars = readerPrefsToCssVars(prefs) as CSSProperties;
  const features = props.readerFeatures ?? { textLayout: false, theme: false, narration: false };
  const idleNarration = useMemo<ReaderToolbarNarration>(
    () => ({
      state: 'idle',
      isPlaying: false,
      error: null,
      webSpeechAvailable: false,
      pause: () => {},
      stop: () => {},
      toggle: () => {},
    }),
    [],
  );
  const assignResearchRoot = useCallback(
    (node: HTMLDivElement | null) => {
      setOutlineRoot(node);
      const ref = props.setMessagesRootRef as unknown;
      if (typeof ref === 'function') {
        (ref as (value: HTMLDivElement | null) => void)(node);
      } else if (ref && typeof ref === 'object') {
        (ref as { current: HTMLDivElement | null }).current = node;
      }
    },
    [props.setMessagesRootRef],
  );
  const handleOutlinePick = useCallback(
    (entry: ReaderOutlineDomEntry) => {
      scrollOutlineEntryIntoView(entry, props.outlineScrollRoot);
    },
    [props.outlineScrollRoot],
  );
  const outlinePayload = useMemo(
    () =>
      outline.entries.length
        ? {
            ...outline,
            onPickStripEntry: handleOutlinePick,
            onPickPanelEntry: handleOutlinePick,
          }
        : null,
    [handleOutlinePick, outline],
  );
  const headerToolbar =
    props.readerToolbarPortalTarget && (features.textLayout || features.theme || features.narration)
      ? createPortal(
          <ReaderHeaderToolbar
            features={features}
            prefs={prefs}
            update={update}
            themeMode={themeMode}
            updateThemeMode={updateThemeMode}
            narration={idleNarration}
          />,
          props.readerToolbarPortalTarget,
        )
      : null;
  const outlineRail = outlinePayload ? (
    <aside className="tw-flex-none tw-shrink-0 tw-self-start" data-reader-rail="research-rail">
      <ReaderToolbar outline={outlinePayload} />
    </aside>
  ) : null;
  const outlineToolbarPortal =
    props.readerOutlinePortalTarget && outlineRail ? createPortal(outlineRail, props.readerOutlinePortalTarget) : null;

  return (
    <>
      {headerToolbar}
      {outlineToolbarPortal}
      <div className="tw-flex tw-w-full tw-items-start tw-gap-4" style={readerVars} data-reader-shell="research">
        <div ref={assignResearchRoot} className="tw-min-w-0 tw-flex-1 tw-max-w-full">
          {reportId ? (
            <ResearchReportPanel
              reportId={reportId}
              onChanged={async () => {
                await Promise.all([refreshActiveDetail(), refreshList()]);
              }}
              fallback={<ArticleReaderView {...props} />}
            />
          ) : (
            <ResearchTaskPanel
              taskId={taskId}
              cardId={cardId}
              status={status}
              onChanged={async () => {
                await Promise.all([refreshActiveDetail(), refreshList()]);
              }}
              fallback={<ArticleReaderView {...props} />}
            />
          )}
        </div>
        {outlineRail && !props.readerOutlinePortalTarget ? outlineRail : null}
      </div>
    </>
  );
}
