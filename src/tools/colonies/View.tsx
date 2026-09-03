import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import {
  calculateCfu,
  DEFAULT_COLONY_CATEGORIES,
  type ColonySpot,
  type ColonyCategory,
} from '@/core/counting';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  volumePlatedUl: number;
  dilutionExponent: number; // e.g. 4 for 10^4
  activeCategoryId: string;
}

const DEFAULTS: State = {
  volumePlatedUl: 100,
  dilutionExponent: 4,
  activeCategoryId: 'cat-1',
};

export default function ColoniesView() {
  const [stateSig, shareUrl] = useUrlState<State>('colonies', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [spots, setSpots] = useState<ColonySpot[]>([
    { id: 's1', x: 250, y: 180, category: 'cat-1' },
    { id: 's2', x: 310, y: 220, category: 'cat-1' },
    { id: 's3', x: 220, y: 280, category: 'cat-1' },
    { id: 's4', x: 340, y: 310, category: 'cat-1' },
    { id: 's5', x: 280, y: 350, category: 'cat-2' },
    { id: 's6', x: 190, y: 210, category: 'cat-1' },
    { id: 's7', x: 370, y: 250, category: 'cat-1' },
  ]);

  const [categories] = useState<ColonyCategory[]>(DEFAULT_COLONY_CATEGORIES);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dilutionFactor = Math.pow(10, s.dilutionExponent);
  const volumePlatedMl = s.volumePlatedUl / 1000;

  const cfuResult = useMemo(() => {
    try {
      return calculateCfu({
        coloniesCounted: spots.length,
        volumePlatedMl,
        dilutionFactor,
      });
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [spots.length, volumePlatedMl, dilutionFactor]);

  // Redraw canvas whenever spots, image, or size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (imageSrc) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        drawSpots(ctx);
      };
      img.src = imageSrc;
    } else {
      // Draw standard synthetic agar dish
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r = 210;

      // Outer dish rim
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();

      // Agar surface
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      const grad = ctx.createRadialGradient(cx, cy, 50, cx, cy, r);
      grad.addColorStop(0, '#fef9c3'); // soft amber agar
      grad.addColorStop(1, '#fde047');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      ctx.stroke();

      drawSpots(ctx);
    }
  }, [imageSrc, spots, categories]);

  function drawSpots(ctx: CanvasRenderingContext2D) {
    const catColorMap = new Map(categories.map(c => [c.id, c.color]));
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i]!;
      const color = catColorMap.get(sp.category) || '#ef4444';

      // Outer glow
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label index
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((i + 1).toString(), sp.x, sp.y);
    }
  }

  function handleCanvasClick(e: MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // If click is near an existing spot (within 10 px), remove it
    const existingIdx = spots.findIndex(sp => Math.hypot(sp.x - x, sp.y - y) <= 12);
    if (existingIdx !== -1) {
      setSpots(prev => prev.filter((_, i) => i !== existingIdx));
    } else {
      // Add new spot
      setSpots(prev => [...prev, {
        id: `spot-${Date.now()}`,
        x,
        y,
        category: s.activeCategoryId,
      }]);
    }
  }

  function handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (src) {
        setImageSrc(src);
        setSpots([]); // clear spots on new image
      }
    };
    reader.readAsDataURL(file);
  }

  function handleExportCsv() {
    const rows = [
      ['Spot_ID', 'Index', 'X_px', 'Y_px', 'Category'],
      ...spots.map((sp, i) => [
        sp.id,
        i + 1,
        Math.round(sp.x),
        Math.round(sp.y),
        categories.find(c => c.id === sp.category)?.name || 'Default',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `colony_counts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const copyText = 'error' in cfuResult ? cfuResult.error! : [
    `Colonies Counted: ${spots.length}`,
    `CFU/mL: ${cfuResult.cfuPerMl.toExponential(3)} CFU/mL`,
    `Volume Plated: ${s.volumePlatedUl} µL`,
    `Dilution: 10^${s.dilutionExponent} (1:${dilutionFactor.toLocaleString()})`,
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="🔴"
      title="Colony & Object Counter"
      blurb="Tap-to-count colonies on agar plates, classify colony phenotypes, and compute CFU/mL."
      inputs={
        <div class="space-y-4">
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Plating & Dilution Parameters
            </h3>
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Volume Plated (µL)
              </label>
              <input
                type="number"
                min="1"
                step="10"
                value={s.volumePlatedUl}
                onInput={(e) => set({ volumePlatedUl: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>Dilution: 10^{s.dilutionExponent}</span>
                <span class="mono font-semibold">1 : {dilutionFactor.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={s.dilutionExponent}
                onInput={(e) => set({ dilutionExponent: parseInt((e.target as HTMLInputElement).value) })}
                class="w-full accent-accent-600"
              />
            </div>
          </div>

          {/* Active Category Selector */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Active Marking Category
            </span>
            <div class="space-y-1.5">
              {categories.map(cat => {
                const count = spots.filter(sp => sp.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => set({ activeCategoryId: cat.id })}
                    class={`w-full p-2 rounded-lg text-xs font-semibold flex items-center justify-between border transition ${s.activeCategoryId === cat.id ? 'border-accent-500 bg-accent-50/30 dark:border-accent-600 dark:bg-accent-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span>{cat.name}</span>
                    </div>
                    <span class="font-mono text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              📷 Upload Plate Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => setSpots([])}
              class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
            >
              Clear
            </button>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {'error' in cfuResult ? (
            <p role="alert" class="text-sm text-red-600">{cfuResult.error}</p>
          ) : (
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Total Colonies</span>
                <span data-testid="colony-count" class="font-mono text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {spots.length}
                </span>
                <span class="text-[11px] text-slate-400 block">marked on plate</span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Estimated CFU / mL</span>
                <span data-testid="cfu-ml" class="font-mono text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {cfuResult.cfuPerMl.toExponential(2)}
                </span>
                <span class="text-[11px] text-slate-400 block">colony forming units</span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Plated Dilution</span>
                <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                  10⁻{s.dilutionExponent}
                </span>
                <span class="text-[11px] text-slate-400 block">in {s.volumePlatedUl} µL volume</span>
              </div>
            </div>
          )}

          {/* Interactive Plate Canvas Card */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Plate Marking View
                </h3>
                <p class="text-xs text-slate-500">
                  Click on any colony to place a marker. Click an existing marker to remove it.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Export CSV
              </button>
            </div>

            <div class="flex justify-center p-2 bg-slate-50 dark:bg-slate-950 rounded-xl overflow-hidden">
              <canvas
                ref={canvasRef}
                width={500}
                height={500}
                onClick={handleCanvasClick}
                class="cursor-crosshair max-w-full h-auto rounded-lg shadow-xs"
              />
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
