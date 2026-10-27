/** The plate the colony counter starts on, and loading photos into a working canvas. */

/** Longest side (px) a photo is analysed at: enough for colonies of a few pixels, fast to filter. */
export const WORK_SIZE = 1200;

export interface PlateImage {
  /** The pixels everything is drawn from and measured on (never stretched). */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** 'example' for the drawn plate. */
  source: 'example' | 'photo' | 'camera';
}

/** A canvas holding `src` scaled so its longest side is at most `max`, aspect ratio kept. */
export function toWorkingCanvas(src: CanvasImageSource & { width: number; height: number }, srcW: number, srcH: number, max = WORK_SIZE): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(srcW, srcH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(srcW * k));
  canvas.height = Math.max(1, Math.round(srcH * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx?.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decode a photo data URL once into a working canvas. */
export async function photoToPlate(src: string, source: PlateImage['source'] = 'photo'): Promise<PlateImage> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = toWorkingCanvas(img, img.naturalWidth, img.naturalHeight);
  return { canvas, width: canvas.width, height: canvas.height, source };
}

const SYNTHETIC_COORDS = [
  { x: 230, y: 160, r: 8 },
  { x: 280, y: 190, r: 10 },
  { x: 190, y: 220, r: 6 },
  { x: 330, y: 220, r: 9 },
  { x: 240, y: 250, r: 14 },
  { x: 290, y: 270, r: 7 },
  { x: 160, y: 280, r: 11 },
  { x: 370, y: 270, r: 8 },
  { x: 210, y: 310, r: 6 },
  { x: 270, y: 330, r: 12 },
  { x: 320, y: 340, r: 7 },
  { x: 180, y: 360, r: 9 },
  { x: 240, y: 390, r: 5 },
  { x: 150, y: 210, r: 5 },
  { x: 340, y: 160, r: 7 },
  { x: 210, y: 120, r: 6 },
  { x: 290, y: 130, r: 8 },
  { x: 370, y: 340, r: 6 },
  { x: 140, y: 330, r: 6 },
  { x: 220, y: 180, r: 4 },
  { x: 260, y: 210, r: 5 },
  { x: 300, y: 230, r: 4 },
  { x: 180, y: 160, r: 4 },
  { x: 350, y: 300, r: 4 },
];

/** A drawn 500 × 500 LB plate with dark, domed colonies (the starting example). */
export function examplePlate(): PlateImage {
  const size = 500, r = 215;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r + 10, 0, 2 * Math.PI);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    for (const sc of SYNTHETIC_COORDS) {
      const g = ctx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.r);
      g.addColorStop(0, '#260e02');
      g.addColorStop(0.7, '#451a03');
      g.addColorStop(1, '#78350f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  return { canvas, width: size, height: size, source: 'example' };
}
