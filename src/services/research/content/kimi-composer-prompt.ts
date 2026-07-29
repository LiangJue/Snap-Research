import { textareaOrContentEditableEditorAdapter } from '@services/integrations/item-mention/content/editor-textarea-or-contenteditable';

const PREPARED_PROMPT_ATTRIBUTE = 'data-syncnos-kimi-research-prompt';

function isKimiHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === 'kimi.moonshot.cn' || host === 'kimi.com' || host.endsWith('.kimi.com');
}

function promptFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length}-${(hash >>> 0).toString(36)}`;
}

function replaceKimiComposer(
  editor: ReturnType<typeof textareaOrContentEditableEditorAdapter.detectActiveEditor>,
  text: string,
) {
  if (!editor) return;
  textareaOrContentEditableEditorAdapter.focus(editor);

  if (editor.kind === 'textarea') {
    const current = String(editor.el.value || '');
    textareaOrContentEditableEditorAdapter.replaceRange(editor, { start: 0, end: current.length }, text);
    return;
  }

  const element = editor.el;
  const selection = globalThis.getSelection?.();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  let inserted = false;
  try {
    const command = (document as any).execCommand;
    if (typeof command === 'function') {
      inserted = command.call(document, 'insertText', false, text) === true;
    }
  } catch (_error) {
    inserted = false;
  }
  if (inserted) return;

  element.textContent = text;
  try {
    element.dispatchEvent(
      typeof InputEvent === 'function'
        ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
        : new Event('input', { bubbles: true }),
    );
  } catch (_error) {
    // The DOM value is still prepared even when the synthetic event is unavailable.
  }
}

export function insertKimiResearchPrompt(prompt: string): boolean {
  const normalizedPrompt = String(prompt || '').trim();
  if (!normalizedPrompt || !isKimiHost(location.hostname)) return false;

  const fingerprint = promptFingerprint(normalizedPrompt);
  if (document.documentElement?.getAttribute(PREPARED_PROMPT_ATTRIBUTE) === fingerprint) {
    return true;
  }

  const editor = textareaOrContentEditableEditorAdapter.detectActiveEditor();
  if (!editor) return false;

  // Claim ownership before mutating the controlled editor. This DOM marker is
  // shared by duplicate content-script listeners, unlike module-local state.
  // A delayed retry therefore acknowledges success without writing again,
  // even while Kimi is still reconciling a partially rendered long prompt.
  document.documentElement?.setAttribute(PREPARED_PROMPT_ATTRIBUTE, fingerprint);
  try {
    replaceKimiComposer(editor, normalizedPrompt);
    return true;
  } catch (_error) {
    if (document.documentElement?.getAttribute(PREPARED_PROMPT_ATTRIBUTE) === fingerprint) {
      document.documentElement.removeAttribute(PREPARED_PROMPT_ATTRIBUTE);
    }
    return false;
  }
}
