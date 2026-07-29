import { chatgptComposerEditorAdapter } from '@services/integrations/item-mention/content/editor-chatgpt';

export function insertChatGptResearchPrompt(prompt: string): boolean {
  const text = String(prompt || '').trim();
  if (!text || location.hostname !== 'chatgpt.com') return false;
  const editor = chatgptComposerEditorAdapter.detectActiveEditor();
  if (!editor) return false;
  const element = (editor as any).el as HTMLElement;
  const current = String(element.textContent || '');
  chatgptComposerEditorAdapter.focus(editor);
  chatgptComposerEditorAdapter.replaceRange(editor, { start: 0, end: current.length }, text);
  // This integration only prepares the draft. ChatGPT exclusively owns the
  // composer after insertion, including submission and clearing its contents.
  return String(element.textContent || '').trim() === text;
}
