import { tabsCaptureVisibleTab } from '@platform/webext/tabs';

export type CssRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PixelRegion = CssRegion;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function computePixelCrop(input: {
  rect: CssRegion;
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
}): PixelRegion {
  const viewportWidth = Math.max(1, finite(input.viewportWidth, 1));
  const viewportHeight = Math.max(1, finite(input.viewportHeight, 1));
  const imageWidth = Math.max(1, Math.floor(finite(input.imageWidth, 1)));
  const imageHeight = Math.max(1, Math.floor(finite(input.imageHeight, 1)));
  const scaleX = imageWidth / viewportWidth;
  const scaleY = imageHeight / viewportHeight;

  const left = Math.max(0, Math.min(imageWidth - 1, Math.floor(finite(input.rect.x) * scaleX)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.floor(finite(input.rect.y) * scaleY)));
  const right = Math.max(
    left + 1,
    Math.min(imageWidth, Math.ceil((finite(input.rect.x) + Math.max(1, finite(input.rect.width, 1))) * scaleX)),
  );
  const bottom = Math.max(
    top + 1,
    Math.min(imageHeight, Math.ceil((finite(input.rect.y) + Math.max(1, finite(input.rect.height, 1))) * scaleY)),
  );

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || 'image/png'};base64,${bytesToBase64(bytes)}`;
}

export async function captureRegionScreenshot(input: {
  windowId?: number | null;
  rect: CssRegion;
  viewportWidth: number;
  viewportHeight: number;
}): Promise<string> {
  const visibleTab = await tabsCaptureVisibleTab(input.windowId, { format: 'png' });
  const sourceBlob = await (await fetch(visibleTab)).blob();
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const crop = computePixelCrop({
      rect: input.rect,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
    });
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2d canvas unavailable');
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return await blobToDataUrl(croppedBlob);
  } finally {
    bitmap.close();
  }
}
