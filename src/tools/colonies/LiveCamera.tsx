import { useEffect, useRef, useState } from 'preact/hooks';
import { detectColonies, type DetectOptions } from '@/core/counting';
import { toWorkingCanvas, type PlateImage } from './plate-image';

/** Longest side of the frames counted live: small enough for several counts a second on a phone. */
const LIVE_SIZE = 640;
const LIVE_INTERVAL_MS = 300;

export interface LiveCameraProps {
  /** Detection settings in working-image pixels (WORK_SIZE); scaled to the live frames here. */
  options: DetectOptions;
  workSize: number;
  sensitivity: number;
  onSensitivity(v: number): void;
  onCapture(plate: PlateImage): void;
  onClose(): void;
}

/**
 * The phone's back camera with a live colony count drawn over it (a few times a second, on small
 * frames); Capture freezes the current frame at full working resolution for the full analysis.
 */
export function LiveCamera({ options, workSize, sensitivity, onSensitivity, onCapture, onClose }: LiveCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const latest = useRef(options);
  latest.current = { ...options, sensitivity };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const frame = document.createElement('canvas');

    const tick = () => {
      const v = video.current, o = overlay.current;
      if (stopped || !v || !o || v.readyState < 2 || !v.videoWidth) return;
      const k = Math.min(1, LIVE_SIZE / Math.max(v.videoWidth, v.videoHeight));
      frame.width = Math.round(v.videoWidth * k);
      frame.height = Math.round(v.videoHeight * k);
      const fctx = frame.getContext('2d', { willReadFrequently: true });
      if (!fctx) return;
      fctx.drawImage(v, 0, 0, frame.width, frame.height);
      // Pixel sizes were chosen on the working image; the live frame is smaller.
      const scale = Math.max(frame.width, frame.height) / workSize;
      const o2 = latest.current;
      const result = detectColonies(fctx.getImageData(0, 0, frame.width, frame.height), {
        ...o2,
        colonyDiameter: o2.colonyDiameter ? o2.colonyDiameter * scale : 0,
        minDiameter: o2.minDiameter ? o2.minDiameter * scale : 0,
      });
      o.width = frame.width;
      o.height = frame.height;
      const ctx = o.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, o.width, o.height);
        ctx.strokeStyle = 'rgba(56,189,248,0.9)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(result.searchCircle.cx, result.searchCircle.cy, result.searchCircle.radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        for (const c of result.colonies) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, Math.max(2.5, (c.radius ?? 3) + 1.5), 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
      setCount(result.colonies.length);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera here. Use “Take photo” instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        timer = window.setInterval(tick, LIVE_INTERVAL_MS);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        setError(name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site, or use “Take photo” instead.'
          : 'The camera could not be opened. Use “Take photo” instead.');
      }
    })();

    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = toWorkingCanvas(v, v.videoWidth, v.videoHeight, workSize);
    onCapture({ canvas, width: canvas.width, height: canvas.height, source: 'camera' });
  };

  return (
    <section aria-label="Live camera" class="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">Live camera</h3>
        <span role="status" class="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
          {count === null ? 'Starting…' : `${count} colonies`}
        </span>
      </div>
      {error ? (
        <p role="alert" class="text-xs text-rose-700 dark:text-rose-400">{error}</p>
      ) : (
        <div class="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} class="block w-full" autoplay playsInline muted aria-label="Camera preview" />
          <canvas ref={overlay} class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        </div>
      )}
      <label class="block text-xs text-slate-600 dark:text-slate-400">
        <span class="flex justify-between"><span>Sensitivity</span><span class="font-mono">{Math.round(sensitivity * 100)}%</span></span>
        <input type="range" min="0" max="1" step="0.05" value={sensitivity} aria-label="Live sensitivity"
          onInput={e => onSensitivity(parseFloat((e.target as HTMLInputElement).value))} class="w-full accent-accent-600" />
      </label>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Hold the phone level over the plate, fill the frame with it, and avoid ceiling-light reflections on the lid.</p>
      <div class="flex gap-2">
        <button type="button" onClick={capture} disabled={!!error || count === null}
          class="flex-1 rounded-lg bg-accent-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-accent-700 disabled:opacity-50">
          Capture and count
        </button>
        <button type="button" onClick={onClose}
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Close
        </button>
      </div>
    </section>
  );
}
