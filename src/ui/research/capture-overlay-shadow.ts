import type { RegionCaptureSubmission, ResearchCaptureOverlay } from '@services/research/content/capture-controller';
import type { CandidateClaim, ResearchExecutionMode } from '@services/research/domain/schemas';
import { updateCandidateClaimText } from '@services/research/domain/candidate-claims';
import { copyImageToClipboard, imageBlobFromDataUrl } from '@services/research/content/chatgpt-screenshot-clipboard';

const HOST_ID = 'syncnos-research-capture-host';
const MIN_SELECTION_SIZE = 20;

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

function normalizedRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function intersects(left: DOMRect, right: Rect): boolean {
  return (
    left.right > right.x &&
    left.left < right.x + right.width &&
    left.bottom > right.y &&
    left.top < right.y + right.height
  );
}

function textInRect(rect: Rect): string {
  const root = document.body || document.documentElement;
  if (!root) return '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const values: string[] = [];
  let visited = 0;
  let length = 0;
  let node: Node | null;

  while ((node = walker.nextNode()) && visited < 3_000 && length < 20_000) {
    visited += 1;
    if (!node.parentElement || node.parentElement.closest(`#${HOST_ID}`)) continue;
    const value = String(node.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!value) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const clientRects = Array.from(range.getClientRects());
    range.detach();
    if (!clientRects.some((clientRect) => intersects(clientRect, rect))) continue;

    values.push(value);
    length += value.length + 1;
  }

  return values.join('\n').slice(0, 20_000);
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

type OverlayCallbacks = Parameters<ResearchCaptureOverlay['open']>[0];
type TextSelectionSource = Parameters<ResearchCaptureOverlay['openTextSelection']>[0]['source'];

function createOverlay(input: OverlayCallbacks, textSource: TextSelectionSource | null = null): void {
  document.getElementById(HOST_ID)?.remove();

  const selectedText = String(textSource?.selectionText || globalThis.getSelection?.()?.toString() || '')
    .trim()
    .slice(0, 20_000);
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.display = 'block';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        --research-bg: rgb(255 255 255);
        --research-text: rgb(52 46 40);
        --research-muted: rgb(113 101 89);
        --research-border: rgb(210 216 226);
        --research-accent: rgb(246 196 166);
        --research-accent-text: rgb(62 45 36);
        --research-radius-card: 20px;
        --research-radius-control: 12px;
        --research-radius-pill: 999px;
        font-family: "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      * { box-sizing: border-box; }
      button, input, textarea { font: inherit; }
      .surface {
        position: fixed;
        inset: 0;
        cursor: crosshair;
        background: rgb(0 0 0 / 44%);
        user-select: none;
      }
      .hint {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border: 1px solid rgb(255 255 255 / 28%);
        border-radius: var(--research-radius-pill);
        color: white;
        background: rgb(20 22 24 / 90%);
        box-shadow: 0 12px 28px rgb(0 0 0 / 28%);
        font-size: 13px;
        font-weight: 650;
        cursor: default;
      }
      .hint kbd {
        padding: 2px 7px;
        border: 1px solid rgb(255 255 255 / 30%);
        border-radius: var(--research-radius-control);
        font-size: 11px;
      }
      .selection {
        position: fixed;
        display: none;
        border: 2px solid var(--research-accent);
        background: rgb(255 255 255 / 5%);
        box-shadow: 0 0 0 1px rgb(0 0 0 / 20%), 0 0 0 9999px rgb(0 0 0 / 18%);
        pointer-events: none;
      }
      .panel {
        position: fixed;
        left: 50%;
        bottom: 28px;
        transform: translateX(-50%);
        display: none;
        width: min(520px, calc(100vw - 32px));
        padding: 16px;
        border: 1px solid var(--research-border);
        border-radius: var(--research-radius-card);
        color: var(--research-text);
        background: var(--research-bg);
        box-shadow: 0 18px 50px rgb(0 0 0 / 30%);
        cursor: default;
        user-select: text;
      }
      .title { font-size: 15px; font-weight: 750; }
      .description { margin-top: 4px; color: var(--research-muted); font-size: 12px; }
      .question {
        width: 100%;
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px solid var(--research-border);
        border-radius: var(--research-radius-control);
        outline: none;
        color: var(--research-text);
        background: white;
        font-size: 13px;
      }
      .question:focus-visible {
        border-color: var(--research-accent);
        box-shadow: 0 0 0 3px rgb(246 196 166 / 35%);
      }
      .error { min-height: 18px; margin-top: 6px; color: rgb(198 48 48); font-size: 11px; }
      .checklist {
        display: none;
        max-height: min(42vh, 360px);
        margin-top: 12px;
        padding: 6px;
        overflow: auto;
        border: 1px solid var(--research-border);
        border-radius: var(--research-radius-control);
        background: rgb(249 250 252);
      }
      .prompt-fallback {
        display: none;
        width: 100%;
        min-height: 160px;
        margin-top: 12px;
        padding: 10px 12px;
        resize: vertical;
        border: 1px solid var(--research-border);
        border-radius: var(--research-radius-control);
        color: var(--research-text);
        background: white;
        font-size: 12px;
        line-height: 1.45;
      }
      .claim {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 9px;
        align-items: start;
        padding: 9px;
        border-radius: 9px;
        cursor: default;
        font-size: 13px;
        line-height: 1.45;
      }
      .claim:hover { background: white; }
      .claim input { margin-top: 2px; accent-color: rgb(204 123 78); }
      .claim textarea {
        width: 100%;
        min-height: 48px;
        padding: 7px 8px;
        resize: vertical;
        border: 1px solid transparent;
        border-radius: 8px;
        outline: none;
        color: var(--research-text);
        background: transparent;
        line-height: 1.45;
      }
      .claim textarea:hover { border-color: var(--research-border); background: white; }
      .claim textarea:focus-visible {
        border-color: var(--research-accent);
        background: white;
        box-shadow: 0 0 0 3px rgb(246 196 166 / 28%);
      }
      .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
      .button {
        min-height: 34px;
        padding: 7px 12px;
        border: 1px solid var(--research-border);
        border-radius: var(--research-radius-control);
        color: var(--research-text);
        background: white;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
      }
      .button.primary {
        border-color: var(--research-accent);
        color: var(--research-accent-text);
        background: var(--research-accent);
      }
      .button:hover { filter: brightness(0.98); }
      .button:disabled { cursor: wait; opacity: 0.65; }
      .button:focus-visible {
        outline: 3px solid rgb(246 196 166 / 45%);
        outline-offset: 2px;
      }
      .toast {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        padding: 11px 15px;
        border-radius: var(--research-radius-pill);
        color: white;
        background: rgb(32 104 72);
        box-shadow: 0 12px 28px rgb(0 0 0 / 24%);
        font-size: 13px;
        font-weight: 700;
      }
    </style>
    <div class="surface" aria-label="选择要研究的区域">
      <div class="hint">拖动选择要研究的区域 <kbd>Esc 取消</kbd></div>
      <div class="selection"></div>
      <section class="panel" role="dialog" aria-label="研究截图">
        <div class="title">提取截图中的全部论点</div>
        <div class="description">先拆成可单独核查的 checklist；确认后，每条所选论点会建立独立 Research 任务，并汇总在同一个 Report。</div>
         <input class="question" maxlength="300" placeholder="可选：补充研究范围或背景" />
         <div class="checklist" aria-label="选择要研究的论点"></div>
         <textarea class="prompt-fallback" readonly aria-label="ChatGPT 研究提示词"></textarea>
         <div class="error" role="alert"></div>
         <div class="actions">
           <button class="button cancel" type="button">取消</button>
           <button class="button reselect" type="button">重选</button>
           <button class="button chatgpt" type="button" style="display:none">截图直送 ChatGPT（无需 API）</button>
           <button class="button kimi" type="button" style="display:none">截图直送 Kimi（无需 API）</button>
           <button class="button primary submit" type="button">提取论点</button>
        </div>
      </section>
    </div>
    <div class="toast" role="status">研究任务已创建，你可以继续浏览</div>
  `;

  const surface = shadow.querySelector<HTMLDivElement>('.surface')!;
  const hint = shadow.querySelector<HTMLDivElement>('.hint')!;
  const selection = shadow.querySelector<HTMLDivElement>('.selection')!;
  const panel = shadow.querySelector<HTMLElement>('.panel')!;
  const title = shadow.querySelector<HTMLDivElement>('.title')!;
  const description = shadow.querySelector<HTMLDivElement>('.description')!;
  const question = shadow.querySelector<HTMLInputElement>('.question')!;
  const error = shadow.querySelector<HTMLDivElement>('.error')!;
  const checklist = shadow.querySelector<HTMLDivElement>('.checklist')!;
  const promptFallback = shadow.querySelector<HTMLTextAreaElement>('.prompt-fallback')!;
  const cancel = shadow.querySelector<HTMLButtonElement>('.cancel')!;
  const reselect = shadow.querySelector<HTMLButtonElement>('.reselect')!;
  const chatgpt = shadow.querySelector<HTMLButtonElement>('.chatgpt')!;
  const kimi = shadow.querySelector<HTMLButtonElement>('.kimi')!;
  const submit = shadow.querySelector<HTMLButtonElement>('.submit')!;
  const toast = shadow.querySelector<HTMLDivElement>('.toast')!;

  let start: Point | null = null;
  let currentRect: Rect | null = textSource ? { x: 0, y: 0, width: 1, height: 1 } : null;
  let submitting = false;
  let candidateClaims: CandidateClaim[] = [];
  let captureDraft: Record<string, unknown> | null = null;

  const destroy = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    host.remove();
  };

  const reset = () => {
    start = null;
    currentRect = null;
    selection.style.display = 'none';
    panel.style.display = 'none';
    error.textContent = '';
    checklist.style.display = 'none';
    checklist.replaceChildren();
    promptFallback.style.display = 'none';
    promptFallback.value = '';
    candidateClaims = [];
    captureDraft = null;
    submit.textContent = '提取论点';
    submit.classList.add('primary');
    chatgpt.style.display = 'none';
    chatgpt.classList.remove('primary');
    kimi.style.display = 'none';
    question.style.display = 'block';
    surface.style.cursor = 'crosshair';
  };

  const updateSelection = (rect: Rect) => {
    selection.style.display = 'block';
    selection.style.left = `${rect.x}px`;
    selection.style.top = `${rect.y}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    destroy();
  };
  document.addEventListener('keydown', onKeyDown, true);

  surface.addEventListener('pointerdown', (event) => {
    if (textSource) return;
    if (submitting || panel.contains(event.target as Node)) return;
    start = { x: event.clientX, y: event.clientY };
    currentRect = { x: start.x, y: start.y, width: 0, height: 0 };
    panel.style.display = 'none';
    surface.setPointerCapture(event.pointerId);
    updateSelection(currentRect);
  });

  surface.addEventListener('pointermove', (event) => {
    if (textSource) return;
    if (!start || submitting) return;
    currentRect = normalizedRect(start, { x: event.clientX, y: event.clientY });
    updateSelection(currentRect);
  });

  surface.addEventListener('pointerup', (event) => {
    if (textSource) return;
    if (!start || !currentRect || submitting) return;
    surface.releasePointerCapture(event.pointerId);
    start = null;
    if (currentRect.width < MIN_SELECTION_SIZE || currentRect.height < MIN_SELECTION_SIZE) {
      reset();
      return;
    }
    surface.style.cursor = 'default';
    panel.style.display = 'block';
    chatgpt.style.display = input.onCaptureForChatGpt ? 'inline-block' : 'none';
    chatgpt.textContent = '截图直送 ChatGPT（无需 API）';
    kimi.style.display = input.onCaptureForChatGpt ? 'inline-block' : 'none';
    kimi.textContent = '截图直送 Kimi（无需 API）';
    question.focus();
  });

  cancel.addEventListener('click', destroy);
  reselect.addEventListener('click', reset);
  question.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && candidateClaims.length === 0) {
      event.preventDefault();
      submit.click();
    }
  });

  const selectedClaimCount = () => candidateClaims.filter((item) => item.selected).length;

  const setBusy = (value: boolean) => {
    submitting = value;
    submit.disabled = value;
    chatgpt.disabled = value;
    kimi.disabled = value;
    cancel.disabled = value;
    reselect.disabled = value;
  };

  const copyScreenshot = async (imageDataUrl: string): Promise<boolean> => {
    return copyImageToClipboard(imageBlobFromDataUrl(imageDataUrl));
  };

  const createReport = async (executionMode: ResearchExecutionMode) => {
    if (!captureDraft || submitting) return;
    setBusy(true);
    error.textContent = '';
    try {
      const result = await input.onCreate({ candidateClaims, captureDraft, executionMode });
      if (
        executionMode === 'chatgpt_manual' ||
        executionMode === 'kimi_manual' ||
        executionMode === 'chatgpt_text' ||
        executionMode === 'kimi_text' ||
        executionMode === 'chatgpt_screenshot' ||
        executionMode === 'kimi_screenshot'
      ) {
        const providerName =
          executionMode === 'kimi_manual' || executionMode === 'kimi_text' || executionMode === 'kimi_screenshot'
            ? 'Kimi'
            : 'ChatGPT';
        const screenshotMode = executionMode === 'chatgpt_screenshot' || executionMode === 'kimi_screenshot';
        const prompt = String(result.chatGptPrompt || '');
        if (!prompt) throw new Error(`Report 已创建，但没有生成 ${providerName} 提示词。请从 Report 中重新打开。`);
        const copied = screenshotMode ? await copyScreenshot(String(captureDraft.imageDataUrl || '')) : true;
        if (!copied) {
          promptFallback.value = prompt;
          promptFallback.style.display = 'block';
          promptFallback.focus();
          promptFallback.select();
          error.textContent = screenshotMode
            ? 'Report 已创建，但浏览器没有允许复制截图。请从 Report 重新尝试。'
            : `Report 已创建，但浏览器未允许自动复制。请复制上方提示词后发送到 ${providerName}。`;
          cancel.textContent = '关闭';
          reselect.style.display = 'none';
          submit.style.display = 'none';
          chatgpt.style.display = 'none';
          kimi.style.display = 'none';
          setBusy(false);
          return;
        }
        if (executionMode === 'kimi_manual' || executionMode === 'kimi_text' || executionMode === 'kimi_screenshot') {
          await input.onOpenKimi(prompt);
        } else {
          await input.onOpenChatGpt(prompt);
        }
      }
      surface.style.display = 'none';
      toast.textContent =
        executionMode === 'chatgpt_screenshot' || executionMode === 'kimi_screenshot'
          ? `研究提示词已写入 ${executionMode === 'kimi_screenshot' ? 'Kimi' : 'ChatGPT'}；请粘贴截图，确认图片出现后再发送`
          : executionMode === 'chatgpt_text' || executionMode === 'kimi_text'
            ? `所选文字和研究提示词已写入 ${executionMode === 'kimi_text' ? 'Kimi' : 'ChatGPT'}，请确认后发送`
            : executionMode === 'chatgpt_manual' || executionMode === 'kimi_manual'
              ? `${selectedClaimCount()} 个任务已保存；研究提示词已写入 ${
                  executionMode === 'kimi_manual' ? 'Kimi' : 'ChatGPT'
                }，请确认后发送`
              : `${selectedClaimCount()} 个研究任务已创建，并汇总到同一个 Report`;
      toast.style.display = 'block';
      window.setTimeout(destroy, 3200);
    } catch (submitError) {
      error.textContent = (submitError as Error)?.message || '创建研究任务失败，请重试。';
      setBusy(false);
    }
  };

  const captureForWebResearch = (provider: 'chatgpt' | 'kimi') => {
    if (candidateClaims.length) {
      void createReport(provider === 'kimi' ? 'kimi_manual' : 'chatgpt_manual');
      return;
    }
    if (textSource) {
      captureDraft = {
        question: question.value.trim(),
        pageTitle: textSource.pageTitle,
        pageUrl: textSource.pageUrl,
        selectedText,
        extractedText: selectedText,
        imageDataUrl: '',
        rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
      };
      void createReport(provider === 'kimi' ? 'kimi_text' : 'chatgpt_text');
      return;
    }
    if (!currentRect || !input.onCaptureForChatGpt || submitting) return;
    setBusy(true);
    error.textContent = '';
    void (async () => {
      try {
        const rect = currentRect!;
        host.style.visibility = 'hidden';
        await nextPaint();
        const captured = await input.onCaptureForChatGpt!({
          question: question.value.trim(),
          pageTitle: document.title,
          pageUrl: location.href,
          selectedText,
          extractedText: textInRect(rect),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          rect: { ...rect, devicePixelRatio: window.devicePixelRatio || 1 },
        });
        host.style.visibility = 'visible';
        captureDraft = captured.captureDraft;
        candidateClaims = [];
        setBusy(false);
        await createReport(provider === 'kimi' ? 'kimi_screenshot' : 'chatgpt_screenshot');
      } catch (submitError) {
        host.style.visibility = 'visible';
        error.textContent =
          (submitError as Error)?.message || `截图直送 ${provider === 'kimi' ? 'Kimi' : 'ChatGPT'} 失败，请重试。`;
        setBusy(false);
      }
    })();
  };

  chatgpt.addEventListener('click', () => captureForWebResearch('chatgpt'));
  kimi.addEventListener('click', () => captureForWebResearch('kimi'));

  submit.addEventListener('click', () => {
    if (!currentRect || submitting) return;
    setBusy(true);
    error.textContent = '';
    void (async () => {
      try {
        if (!candidateClaims.length) {
          const rect = currentRect;
          const submission: RegionCaptureSubmission = {
            question: question.value.trim(),
            pageTitle: textSource?.pageTitle || document.title,
            pageUrl: textSource?.pageUrl || location.href,
            selectedText,
            extractedText: textSource ? selectedText : textInRect(rect),
            viewportWidth: textSource ? 1 : window.innerWidth,
            viewportHeight: textSource ? 1 : window.innerHeight,
            rect: {
              ...rect,
              devicePixelRatio: textSource ? 1 : window.devicePixelRatio || 1,
            },
          };
          if (!textSource) {
            host.style.visibility = 'hidden';
            await nextPaint();
          }
          const extracted = await input.onExtract(submission);
          host.style.visibility = 'visible';
          candidateClaims = extracted.candidateClaims;
          captureDraft = extracted.captureDraft;
          if (!candidateClaims.length) throw new Error('所选内容中没有提取到可核查的论点。');
          checklist.replaceChildren();
          candidateClaims.forEach((claim, index) => {
            const row = document.createElement('div');
            row.className = 'claim';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.setAttribute('aria-label', `选择观点 ${index + 1}`);
            checkbox.checked = claim.selected;
            checkbox.addEventListener('change', () => {
              candidateClaims[index] = { ...candidateClaims[index], selected: checkbox.checked };
              const count = selectedClaimCount();
              submit.textContent = `API 研究（${count}）`;
              chatgpt.textContent = `ChatGPT 网页研究（无需 API，${count}）`;
              kimi.textContent = `Kimi 网页研究（无需 API，${count}）`;
              submit.disabled = count === 0 || candidateClaims.some((item) => item.selected && !item.text.trim());
              chatgpt.disabled = submit.disabled;
              kimi.disabled = submit.disabled;
            });
            const text = document.createElement('textarea');
            text.maxLength = 500;
            text.value = claim.text;
            text.setAttribute('aria-label', `编辑观点 ${index + 1}`);
            text.addEventListener('input', () => {
              candidateClaims = updateCandidateClaimText(candidateClaims, index, text.value);
              const count = selectedClaimCount();
              submit.disabled = count === 0 || candidateClaims.some((item) => item.selected && !item.text.trim());
              chatgpt.disabled = submit.disabled;
              kimi.disabled = submit.disabled;
            });
            row.append(checkbox, text);
            checklist.append(row);
          });
          checklist.style.display = 'block';
          question.style.display = 'none';
          submit.textContent = `API 研究（${selectedClaimCount()}）`;
          submit.classList.remove('primary');
          chatgpt.textContent = `ChatGPT 网页研究（无需 API，${selectedClaimCount()}）`;
          chatgpt.style.display = 'inline-block';
          chatgpt.classList.add('primary');
          kimi.textContent = `Kimi 网页研究（无需 API，${selectedClaimCount()}）`;
          kimi.style.display = 'inline-block';
          setBusy(false);
          return;
        }

        setBusy(false);
        await createReport('api');
      } catch (submitError) {
        host.style.visibility = 'visible';
        error.textContent = (submitError as Error)?.message || '创建研究任务失败，请重试。';
        setBusy(false);
      }
    })();
  });

  (document.documentElement || document.body).appendChild(host);
  if (textSource) {
    hint.style.display = 'none';
    selection.style.display = 'none';
    surface.style.cursor = 'default';
    panel.style.display = 'block';
    title.textContent = '提取所选文字中的论点';
    description.textContent = '直接分析所选文字，不截图、不识别图片；确认后，所选论点会分别研究并汇总在同一个 Report。';
    reselect.style.display = 'none';
    chatgpt.style.display = 'inline-block';
    chatgpt.textContent = '文字直送 ChatGPT（无需 API）';
    kimi.style.display = 'inline-block';
    kimi.textContent = '文字直送 Kimi（无需 API）';
    question.focus();
  }
}

export const researchCaptureOverlay: ResearchCaptureOverlay = {
  open: createOverlay,
  openTextSelection: (input) => createOverlay(input, input.source),
};
