/* Local file reading for tool imports. Files never leave the device. */

/** Default ceiling for text imports (plate-reader exports, CSV/TSV tables, sequences). */
export const MAX_TEXT_IMPORT_BYTES = 50 * 1024 * 1024;

export class FileImportError extends Error {}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function checkSize(file: File, maxBytes: number) {
  if (file.size > maxBytes) {
    throw new FileImportError(`${file.name} is ${formatBytes(file.size)}; this import accepts files up to ${formatBytes(maxBytes)}.`);
  }
}

/** Read a file as UTF-8 text, rejecting oversized, unreadable, or empty files with a user-facing message. */
export async function readTextFile(file: File, maxBytes = MAX_TEXT_IMPORT_BYTES): Promise<string> {
  checkSize(file, maxBytes);
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new FileImportError(`${file.name} could not be read.`);
  }
  if (!text.trim()) throw new FileImportError(`${file.name} is empty.`);
  return text;
}

/** Read a file's bytes, rejecting oversized or unreadable files with a user-facing message. */
export async function readBinaryFile(file: File, maxBytes: number): Promise<ArrayBuffer> {
  checkSize(file, maxBytes);
  try {
    return await file.arrayBuffer();
  } catch {
    throw new FileImportError(`${file.name} could not be read.`);
  }
}

/** A user-facing message for any error raised while importing `fileName`. */
export function importErrorMessage(error: unknown, fileName: string): string {
  if (error instanceof FileImportError) return error.message;
  const detail = error instanceof Error && error.message ? error.message : String(error);
  return `Could not import ${fileName}: ${detail}`;
}

/** Default ceiling for photographed images (gel, plate, and micrograph photos). */
export const MAX_IMAGE_IMPORT_BYTES = 100 * 1024 * 1024;

/**
 * Read an image file as a data URL and confirm the browser can decode it, so a non-image or
 * corrupt file produces a message instead of a silently blank canvas.
 */
export async function readImageDataUrl(
  file: File,
  maxBytes = MAX_IMAGE_IMPORT_BYTES,
): Promise<{ src: string; width: number; height: number }> {
  checkSize(file, maxBytes);
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new FileImportError(`${file.name} could not be read.`));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new FileImportError(`${file.name} is not an image this browser can display (use PNG, JPEG, or WebP).`));
    img.src = src;
  });
}
