/* Image decoding for the image tools. PNG/JPG/WebP via the browser decoder; TIFF 8/16/32-bit via utif.
 * The result is a Float32 luminance plane in 0..1 (nominal range of the source bit depth) plus the original blob.
 * Quantification reads this plane; the display is a view on top of it. */
import * as UTIF from 'utif';

export interface DecodedImage {
  width: number; height: number;
  /** Luminance, row-major, 0..1 of the nominal range (255, 65535, or min..max for float TIFF). */
  data: Float32Array;
  /** Bits per sample of the source (8 for PNG/JPG). */
  bitDepth: 8 | 16 | 32;
  /** Colour source as RGBA 8-bit, for the colour display option; absent for grayscale sources. */
  rgba?: Uint8ClampedArray;
  original: Blob;
  channels: number;
  format: 'tiff' | 'png' | 'jpeg' | 'webp' | 'other';
}

export class ImageDecodeError extends Error {}

export const SUPPORTED = 'PNG, JPEG, WebP, and 8/16-bit TIFF (single page, uncompressed/LZW/Deflate)';

const REC601 = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Detect TIFF by magic bytes (II*\0 or MM\0*), independent of the file name. */
export function isTiff(bytes: Uint8Array): boolean {
  return bytes.length > 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a));
}

/** Decode a TIFF buffer (first IFD that carries pixel data). DOM-free; exported for tests. */
export function decodeTiff(buffer: ArrayBuffer, original: Blob = new Blob([buffer], { type: 'image/tiff' })): DecodedImage {
  let ifds: UTIF.IFD[];
  try { ifds = UTIF.decode(buffer); } catch (e) { throw new ImageDecodeError(`Cannot parse TIFF: ${(e as Error).message}`); }
  const ifd = ifds.find(i => i['t256'] != null && (i['t273'] != null || i['t324'] != null));
  if (!ifd) throw new ImageDecodeError('TIFF has no image data');
  try { UTIF.decodeImage(buffer, ifd); } catch (e) { throw new ImageDecodeError(`Cannot decode TIFF pixels: ${(e as Error).message}`); }
  const width = ifd.width, height = ifd.height;
  const bpsTag = ifd['t258'] as number[] | undefined;
  const bps = bpsTag?.[0] ?? 8;
  const channels = bpsTag?.length ?? ((ifd['t277'] as number[] | undefined)?.[0] ?? 1);
  const photometric = (ifd['t262'] as number[] | undefined)?.[0] ?? 1; // 0 WhiteIsZero, 1 BlackIsZero, 2 RGB
  const sampleFormat = (ifd['t339'] as number[] | undefined)?.[0] ?? 1; // 1 uint, 2 int, 3 float
  const n = width * height;
  const data = new Float32Array(n);
  const raw = ifd.data;
  let bitDepth: DecodedImage['bitDepth'] = 8;
  let rgba: Uint8ClampedArray | undefined;

  if (bps === 8) {
    if (channels === 1) { for (let i = 0; i < n; i++) data[i] = raw[i]! / 255; }
    else {
      rgba = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) {
        const r = raw[i * channels]!, g = raw[i * channels + 1]!, b = raw[i * channels + 2]!;
        data[i] = REC601(r, g, b) / 255;
        rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
      }
    }
  } else if (bps === 16) {
    bitDepth = 16;
    // utif rewrites 16-bit samples to little-endian byte order while decoding.
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const signed = sampleFormat === 2;
    const read = (idx: number) => signed ? dv.getInt16(idx * 2, true) + 32768 : dv.getUint16(idx * 2, true);
    if (channels === 1) { for (let i = 0; i < n; i++) data[i] = read(i) / 65535; }
    else for (let i = 0; i < n; i++) data[i] = REC601(read(i * channels), read(i * channels + 1), read(i * channels + 2)) / 65535;
  } else if (bps === 32 && sampleFormat === 3) {
    bitDepth = 32;
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const v = dv.getFloat32(i * channels * 4, true); data[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
    // Float images have no nominal range; min..max becomes 0..1 so display and saturation logic still work.
    const span = hi > lo ? hi - lo : 1;
    for (let i = 0; i < n; i++) data[i] = (data[i]! - lo) / span;
  } else {
    throw new ImageDecodeError(`Unsupported TIFF: ${bps}-bit, sample format ${sampleFormat}. Supported: ${SUPPORTED}.`);
  }
  if (photometric === 0) for (let i = 0; i < n; i++) data[i] = 1 - data[i]!;
  return { width, height, data, bitDepth, rgba, original, channels, format: 'tiff' };
}

/** RGBA bytes to a luminance plane (Rec. 601 weights). */
export function rgbaToPlane(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const n = width * height, data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = REC601(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!) / 255;
  return data;
}

function isGray(rgba: Uint8ClampedArray): boolean {
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] !== rgba[i + 1] || rgba[i] !== rgba[i + 2]) return false;
  return true;
}

async function decodeWithBrowser(blob: Blob): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  let bitmap: ImageBitmap | HTMLImageElement;
  const fail = () => new ImageDecodeError(`The browser could not decode this image. Supported: ${SUPPORTED}.`);
  if (typeof createImageBitmap === 'function') {
    try { bitmap = await createImageBitmap(blob); } catch { throw fail(); }
  } else {
    const url = URL.createObjectURL(blob);
    try {
      bitmap = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(fail()); im.src = url; });
    } finally { URL.revokeObjectURL(url); }
  }
  const width = bitmap.width, height = bitmap.height;
  if (!width || !height) throw new ImageDecodeError('Image has no pixels');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageDecodeError('Canvas 2D is not available in this browser');
  ctx.drawImage(bitmap, 0, 0);
  if ('close' in bitmap) bitmap.close();
  return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
}

function formatOf(blob: Blob, bytes: Uint8Array): DecodedImage['format'] {
  if (isTiff(bytes)) return 'tiff';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (blob.type === 'image/webp') return 'webp';
  return 'other';
}

/** Decode any supported image file into a luminance plane. Throws ImageDecodeError naming the supported formats. */
export async function decodeImageFile(blob: Blob): Promise<DecodedImage> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const format = formatOf(blob, bytes);
  if (format === 'tiff') return decodeTiff(buffer, blob);
  const { rgba, width, height } = await decodeWithBrowser(blob);
  const data = rgbaToPlane(rgba, width, height);
  const gray = isGray(rgba);
  return { width, height, data, bitDepth: 8, rgba: gray ? undefined : rgba, original: blob, channels: gray ? 1 : 3, format };
}
