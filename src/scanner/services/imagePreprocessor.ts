const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
const MAX_WIDTH_PX = 2000;

export interface PreprocessedImage {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  blob: Blob;
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function sourceToImageBitmap(source: Blob | ImageBitmap | HTMLImageElement): Promise<ImageBitmap> {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return source;
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return createImageBitmap(source);
  }
  const image = source as HTMLImageElement;
  if (image.complete && image.naturalWidth > 0) {
    return createImageBitmap(image);
  }
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load statement image.'));
  });
  return createImageBitmap(image);
}

function applyLuminanceAndContrast(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  const luma = new Uint8Array(data.length / 4);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const y = Math.round(LUMA_R * data[i] + LUMA_G * data[i + 1] + LUMA_B * data[i + 2]);
    luma[p] = y;
    if (y < min) min = y;
    if (y > max) max = y;
  }

  const range = Math.max(1, max - min);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const stretched = Math.round(((luma[p] - min) / range) * 255);
    const binarized = stretched > 168 ? 255 : stretched < 92 ? 0 : stretched;
    data[i] = binarized;
    data[i + 1] = binarized;
    data[i + 2] = binarized;
    data[i + 3] = 255;
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to serialise preprocessed image.'));
    }, 'image/png');
  });
}

export async function preprocessStatementImage(
  source: Blob | ImageBitmap | HTMLImageElement
): Promise<PreprocessedImage> {
  const bitmap = await sourceToImageBitmap(source);
  const scale = bitmap.width > MAX_WIDTH_PX ? MAX_WIDTH_PX / bitmap.width : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas 2D context is unavailable on this device.');
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  applyLuminanceAndContrast(imageData.data);
  ctx.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(canvas);
  return { canvas, width, height, blob };
}
