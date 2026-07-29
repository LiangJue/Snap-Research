import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyImageToClipboard, imageBlobFromDataUrl } from '@services/research/content/chatgpt-screenshot-clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatGPT screenshot clipboard payload', () => {
  it('writes only the raw image so ChatGPT cannot choose the text representation instead', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    class TestClipboardItem {
      constructor(readonly data: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', TestClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write } });

    const image = imageBlobFromDataUrl('data:image/png;base64,iVBORw0KGgo=');
    const copied = await copyImageToClipboard(image);

    expect(copied).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    const item = write.mock.calls[0][0][0] as TestClipboardItem;
    expect(Object.keys(item.data)).toEqual(['image/png']);
  });

  it('returns false when the browser denies clipboard access', async () => {
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(readonly data: Record<string, Blob>) {}
      },
    );
    vi.stubGlobal('navigator', {
      clipboard: { write: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    const copied = await copyImageToClipboard(new Blob(['png'], { type: 'image/png' }));
    expect(copied).toBe(false);
  });
});
