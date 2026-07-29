export function imageBlobFromDataUrl(dataUrl: string): Blob {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('截图格式无效，无法复制到剪贴板。');
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

export async function copyImageToClipboard(image: Blob): Promise<boolean> {
  try {
    const ClipboardItemConstructor = (globalThis as any).ClipboardItem;
    if (!navigator.clipboard?.write || !ClipboardItemConstructor) return false;
    await navigator.clipboard.write([
      new ClipboardItemConstructor({
        [image.type || 'image/png']: image,
      }),
    ]);
    return true;
  } catch (_error) {
    return false;
  }
}
