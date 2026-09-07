/* Vector export for the gel tool: the exported SVG embeds the (display-adjusted) image
 * as a raster and draws every annotation — lane boxes, headers, band marks, size and mass
 * labels, title and method note — as real vector text, per the rebuild spec (section 6).
 * Pure module: no DOM. Rasterisation of the plane to a PNG data URL happens in the tool. */
import type { Lane } from './types';

export interface DisplayTransform {
  brightness: number;
  contrast: number;
  minClip: number;
  maxClip: number;
  gamma: number;
  invert: boolean;
}

export const DEFAULT_DISPLAY: DisplayTransform = {
  brightness: 1,
  contrast: 1,
  minClip: 0,
  maxClip: 1,
  gamma: 1,
  invert: false,
};

/**
 * Apply the display pipeline to a 0..1 luminance plane.
 * Order matches the on-screen renderer: contrast clipping, gamma, contrast, brightness, invert.
 */
export function applyDisplayTransform(plane: Float32Array, t: DisplayTransform): Float32Array {
  const out = new Float32Array(plane.length);
  const clipRange = Math.max(0.01, t.maxClip - t.minClip);
  for (let i = 0; i < plane.length; i++) {
    let val = plane[i]!;
    val = Math.max(0, Math.min(1, (val - t.minClip) / clipRange));
    if (t.gamma !== 1) val = Math.pow(val, 1 / t.gamma);
    val = (val - 0.5) * t.contrast + 0.5;
    val = val * t.brightness;
    val = Math.max(0, Math.min(1, val));
    if (t.invert) val = 1 - val;
    out[i] = val;
  }
  return out;
}

/** One resolved band annotation for the vector layer (text already formatted by the tool). */
export interface BandAnnotation {
  laneId: string;
  /** Vertical position of the band in image pixel coordinates (from top of gel). */
  y: number;
  sizeText?: string | null;
  massText?: string | null;
}

export interface GelSvgInput {
  width: number;
  height: number;
  /** PNG data URL of the display-adjusted image. */
  imageDataUrl: string;
  display: DisplayTransform;
  lanes: Lane[];
  laneLabels?: Record<string, string>;
  ladderLaneId?: string;
  selectedLaneId?: string | null;
  showHeaders?: boolean;
  showMwLabels?: boolean;
  showMassLabels?: boolean;
  bands?: BandAnnotation[];
  title?: string;
  subtitle?: string;
  footnote?: string;
}

const HEADER_H = 64;
const FOOTNOTE_H = 30;
const FONT = 'Helvetica, Arial, sans-serif';

/** Deterministic monospace-ish width estimate for label backgrounds (no canvas needed). */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build the publication SVG. The image is embedded once; everything else is vector text
 * that stays crisp at any zoom and is selectable/searchable in the file.
 */
export function buildGelSvg(input: GelSvgInput): string {
  const { width, height } = input;
  const showHeaders = input.showHeaders ?? true;
  const showMwLabels = input.showMwLabels ?? true;
  const showMassLabels = input.showMassLabels ?? false;
  const bands = input.bands ?? [];

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width + HEADER_H + 24}" height="${height + HEADER_H + (input.footnote ? FOOTNOTE_H : 0)}" ` +
    `viewBox="0 0 ${width + HEADER_H + 24} ${height + HEADER_H + (input.footnote ? FOOTNOTE_H : 0)}" font-family="${FONT}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  // Header band
  const title = input.title?.trim() || 'Gel export';
  const subtitle = input.subtitle || '';
  parts.push(`<rect x="0" y="0" width="${width + HEADER_H + 24}" height="${HEADER_H}" fill="#0f172a"/>`);
  parts.push(`<text x="16" y="26" font-size="16" font-weight="bold" fill="#f8fafc">${esc(title)}</text>`);
  if (subtitle) {
    parts.push(`<text x="16" y="46" font-size="11" fill="#94a3b8">${esc(subtitle)}</text>`);
  }

  // Embedded raster image, offset under the header and to the right of the MW gutter
  const imgX = HEADER_H;
  const imgY = HEADER_H;
  parts.push(
    `<image x="${imgX}" y="${imgY}" width="${width}" height="${height}" ` +
    `href="${input.imageDataUrl}" xlink:href="${input.imageDataUrl}"/>`,
  );

  // Lane layer (coordinates relative to the image origin)
  input.lanes.forEach((l, idx) => {
    const half = l.width / 2;
    const isSelected = !!input.selectedLaneId && l.id === input.selectedLaneId;
    const isLadder = !!input.ladderLaneId && l.id === input.ladderLaneId;
    const fill = isSelected ? 'rgba(37,99,235,0.18)' : isLadder ? 'rgba(234,179,8,0.12)' : 'rgba(148,163,184,0.10)';
    const stroke = isSelected ? '#2563eb' : isLadder ? '#d97706' : '#64748b';
    const sw = isSelected ? 2 : 1;
    parts.push(`<rect x="${imgX + l.x - half}" y="${imgY + l.y0}" width="${l.width}" height="${l.y1 - l.y0}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
    // centre guide
    parts.push(`<line x1="${imgX + l.x}" y1="${imgY + l.y0}" x2="${imgX + l.x}" y2="${imgY + l.y1}" stroke="rgba(148,163,184,0.35)" stroke-width="1"/>`);

    // Lane header badge
    if (showHeaders) {
      const custom = input.laneLabels?.[l.id];
      const labelText = custom ? `L${idx + 1}: ${custom}` : isLadder ? `L${idx + 1} (Ladder)` : `L${idx + 1}`;
      const tw = estimateTextWidth(labelText, 11);
      const bx = imgX + l.x - tw / 2 - 4;
      const by = imgY + Math.max(2, l.y0 - 18);
      parts.push(`<rect x="${bx}" y="${by}" width="${tw + 8}" height="16" fill="${isSelected ? '#2563eb' : isLadder ? '#d97706' : '#475569'}"/>`);
      parts.push(`<text x="${imgX + l.x}" y="${by + 12}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(labelText)}</text>`);
    }
  });

  // Band layer
  for (const b of bands) {
    const lane = input.lanes.find(l => l.id === b.laneId);
    if (!lane) continue;
    const half = lane.width / 2;
    const y = imgY + b.y;
    const isLadder = !!input.ladderLaneId && lane.id === input.ladderLaneId;
    parts.push(`<line x1="${imgX + lane.x - half}" y1="${y}" x2="${imgX + lane.x + half}" y2="${y}" stroke="${isLadder ? '#d97706' : '#334155'}" stroke-width="1.5"/>`);
    parts.push(`<circle cx="${imgX + lane.x}" cy="${y}" r="2.5" fill="#334155"/>`);

    // Size label on the right
    if (showMwLabels && b.sizeText) {
      const tw = estimateTextWidth(b.sizeText, 10);
      parts.push(`<rect x="${imgX + lane.x + half + 2}" y="${y - 7}" width="${tw + 4}" height="14" fill="rgba(15,23,42,0.75)"/>`);
      parts.push(`<text x="${imgX + lane.x + half + 4}" y="${y + 4}" font-size="10" font-weight="bold" fill="#ffffff">${esc(b.sizeText)}</text>`);
    }
    // Mass label on the left
    if (showMassLabels && b.massText) {
      const tw = estimateTextWidth(b.massText, 9);
      parts.push(`<rect x="${imgX + lane.x - half - tw - 6}" y="${y - 7}" width="${tw + 4}" height="14" fill="rgba(5,150,105,0.85)"/>`);
      parts.push(`<text x="${imgX + lane.x - half - 4}" y="${y + 4}" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="end">${esc(b.massText)}</text>`);
    }
  }

  // Footnote (method note so the number never travels without its method)
  if (input.footnote) {
    const fy = HEADER_H + height + 18;
    parts.push(`<text x="16" y="${fy}" font-size="10" fill="#475569">${esc(input.footnote)}</text>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}
