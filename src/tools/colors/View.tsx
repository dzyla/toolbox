import { useMemo, useState } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import {
  schemesByGroup, findScheme, schemeSize, samplePalette, MAX_COLORS,
  simulatePalette, VISIONS, type Vision, type Deficiency,
  contrastRatio, labelColor, closestPair, JND_DELTA_E, WCAG,
  variations, toPyMOL, toMatplotlib, toHexList, toRgbList, toHex, ColorError,
} from '@/core/colors';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

interface State { scheme: string; n: number; sims: Deficiency[]; selected: string | null; name: string }
const DEFAULTS: State = { scheme: 'viridis', n: 8, sims: ['deuteranopia'], selected: null, name: 'color' };
const DEFICIENCIES = VISIONS.filter(v => v.id !== 'normal') as { id: Deficiency; label: string; blurb: string }[];

const input = 'mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 disabled:opacity-60';
const btn = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-accent-500 dark:border-slate-700';

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One clickable colour. Copies its hex and (optionally) selects it for the variations panel. */
function Swatch({ hex, original, onPick, size = 'h-16' }: { hex: string; original?: string; onPick: (hex: string) => void; size?: string }) {
  const changed = original !== undefined && original !== hex;
  return (
    <button type="button" onClick={() => onPick(hex)} title={changed ? `${hex} (from ${original})` : hex}
      aria-label={`Copy ${hex}${changed ? `, simulated from ${original}` : ''}`}
      class={`${size} min-w-0 overflow-hidden rounded-md border border-slate-200 text-left transition hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700`}
      style={{ background: hex, color: labelColor(hex) }}>
      <span class="mono block px-1 pt-1 text-[10px] leading-tight sm:text-xs">{hex}</span>
    </button>
  );
}

function VisionPanel({ vision, palette, onPick }: { vision: Vision; palette: string[]; onPick: (hex: string, original: string) => void }) {
  const meta = VISIONS.find(v => v.id === vision)!;
  const shown = useMemo(() => simulatePalette(palette, vision), [palette, vision]);
  const pair = useMemo(() => closestPair(shown), [shown]);
  const belowJnd = pair !== undefined && pair.deltaE < JND_DELTA_E;
  return (
    <section aria-label={meta.label} class="min-w-0 space-y-2">
      <h3 class="text-sm font-semibold">{meta.label} <span class="font-normal text-slate-500 dark:text-slate-400">· {meta.blurb}</span></h3>
      <div class="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(3.5rem, 1fr))' }}>
        {shown.map((h, i) => <Swatch key={i} hex={h} original={vision === 'normal' ? undefined : palette[i]} onPick={() => onPick(h, palette[i]!)} />)}
      </div>
      {pair && (
        <p class="text-xs text-slate-600 dark:text-slate-300">
          Closest pair: swatches {pair.i + 1} and {pair.j + 1}, ΔE*ab {pair.deltaE.toFixed(1)}
          {belowJnd ? ' — below the 2.3 just-noticeable difference, these will read as the same colour.' : pair.deltaE < 10 ? ' — close; label these directly rather than by colour alone.' : '.'}
        </p>
      )}
    </section>
  );
}

function Contrast({ hex, against, label }: { hex: string; against: string; label: string }) {
  const r = contrastRatio(hex, against);
  const grade = r >= WCAG.AAA_TEXT ? 'AAA' : r >= WCAG.AA_TEXT ? 'AA' : r >= WCAG.AA_LARGE ? 'AA large text only' : 'fails AA';
  return <li>vs {label}: <span class="mono">{r.toFixed(2)}:1</span> ({grade})</li>;
}

export default function View() {
  const [state, shareUrl] = useUrlState<State>('colors', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1500); };
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState('');

  const scheme = findScheme(s.scheme);
  const fixed = schemeSize(s.scheme);
  const { palette, error } = useMemo(() => {
    try { return { palette: samplePalette(s.scheme, fixed ?? s.n), error: '' }; }
    catch (e) { return { palette: [] as string[], error: (e as Error).message }; }
  }, [s.scheme, s.n, fixed]);

  const pick = async (hex: string, original: string) => {
    set({ selected: original });
    flash((await copyText(hex)) ? `${hex} copied` : 'Copy failed');
  };
  const copyOnly = async (hex: string) => flash((await copyText(hex)) ? `${hex} copied` : 'Copy failed');
  const toggleSim = (id: Deficiency) => set({ sims: s.sims.includes(id) ? s.sims.filter(x => x !== id) : [...s.sims, id] });
  const showCustom = () => {
    try { set({ selected: toHex(customInput) }); setCustomError(''); }
    catch (e) { setCustomError(e instanceof ColorError ? e.message : String(e)); }
  };

  const header = `# ${scheme?.label ?? s.scheme}, ${palette.length} colours, Bio-Bench Figure Colours`;
  const pymol = () => `${header}\n${toPyMOL(palette, s.name)}`;
  const mpl = () => `${header}\n${toMatplotlib(palette, s.name === 'color' ? 'colors' : s.name)}`;
  const copyExport = async (text: string, what: string) => flash((await copyText(text)) ? `${what} copied` : 'Copy failed');

  const sel = s.selected;
  const vars = useMemo(() => (sel ? variations(sel) : null), [sel]);
  const visions: Vision[] = ['normal', ...DEFICIENCIES.map(d => d.id).filter(d => s.sims.includes(d))];

  return (
    <ToolLayout icon="🎨" title="Figure Colours" blurb="Palettes from matplotlib and ColorBrewer, colour-blind check, tints and shades, PyMOL and matplotlib export."
      inputs={<>
        <label for="col-scheme" class="block"><span class="mb-1 block text-sm font-medium">Scheme</span>
          <select id="col-scheme" value={s.scheme} onChange={e => set({ scheme: (e.target as HTMLSelectElement).value })} class={input}>
            {schemesByGroup().map(g => <optgroup key={g.group} label={g.group}>{g.schemes.map(sc => <option key={sc.id} value={sc.id}>{sc.label}{sc.uniform ? ' (perceptually uniform)' : ''}</option>)}</optgroup>)}
          </select></label>
        <label for="col-n" class="block"><span class="mb-1 block text-sm font-medium">Number of colours (1–{MAX_COLORS})</span>
          <input id="col-n" type="number" min={1} max={MAX_COLORS} step={1} value={fixed ?? s.n} disabled={fixed !== undefined}
            onInput={e => { const v = Math.floor(Number((e.target as HTMLInputElement).value)); if (Number.isFinite(v)) set({ n: Math.min(MAX_COLORS, Math.max(1, v)) }); }} class={input} />
          {fixed !== undefined && <span class="mt-1 block text-xs text-slate-500">Categorical scheme with a fixed set of {fixed} colours.</span>}
        </label>
        <fieldset>
          <legend class="mb-1 text-sm font-medium">Simulate colour vision deficiency (shown beside the original)</legend>
          <div class="grid grid-cols-2 gap-1">
            {DEFICIENCIES.map(d => (
              <label key={d.id} class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.sims.includes(d.id)} onChange={() => toggleSim(d.id)} /> {d.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label for="col-name" class="block"><span class="mb-1 block text-sm font-medium">Export name (PyMOL prefix, Python variable)</span>
          <input id="col-name" type="text" value={s.name} onInput={e => set({ name: (e.target as HTMLInputElement).value })} class={input} /></label>
        <div>
          <label for="col-custom" class="mb-1 block text-sm font-medium">Variations of any colour</label>
          <div class="flex gap-2">
            <input id="col-custom" type="text" placeholder="#3366cc, rgb(…), name" value={customInput} onInput={e => setCustomInput((e.target as HTMLInputElement).value)}
              onKeyDown={e => { if (e.key === 'Enter') showCustom(); }} aria-invalid={!!customError} class={input} />
            <button type="button" class={btn} onClick={showCustom}>Show</button>
          </div>
          {customError && <p role="alert" class="mt-1 text-xs text-red-600">{customError}</p>}
        </div>
      </>}
      results={error ? <p role="alert" class="text-red-600">{error}</p> : <div class="space-y-6">
        <div class={`grid gap-6 ${visions.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {visions.map(v => <VisionPanel key={v} vision={v} palette={palette} onPick={pick} />)}
        </div>
        <p class="text-xs text-slate-500">Click a swatch to copy its hex code and open its variations. Simulated swatches show the simulated colour; the tooltip names the original.</p>
        {vars && sel && (
          <section aria-label="Variations" class="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div class="flex flex-wrap items-center gap-3">
              <span class="h-8 w-8 rounded-full border border-slate-300 dark:border-slate-600" style={{ background: sel }} aria-hidden="true" />
              <h3 class="font-semibold">Variations of <span class="mono">{sel}</span></h3>
              <button type="button" class={btn} onClick={() => set({ selected: null })}>Close</button>
            </div>
            <ul class="text-xs text-slate-600 dark:text-slate-300">
              <Contrast hex={sel} against="#ffffff" label="white" />
              <Contrast hex={sel} against="#000000" label="black" />
            </ul>
            {([['Tints (towards white)', vars.tints], ['Tones (towards grey)', vars.tones], ['Shades (towards black)', vars.shades]] as const).map(([label, list]) => (
              <div key={label}>
                <h4 class="mb-1 text-sm font-medium">{label}</h4>
                <div class="grid grid-cols-5 gap-1.5">{list.map(h => <Swatch key={h} hex={h} onPick={copyOnly} size="h-12" />)}</div>
              </div>
            ))}
          </section>
        )}
        <section aria-label="Export" class="space-y-2">
          <h3 class="text-sm font-semibold">Export</h3>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btn} onClick={() => copyExport(pymol(), 'PyMOL script')}>Copy PyMOL</button>
            <button type="button" class={btn} onClick={() => download(`${s.name || 'colors'}.pml`, pymol())}>Download .pml</button>
            <button type="button" class={btn} onClick={() => copyExport(mpl(), 'matplotlib list')}>Copy matplotlib</button>
            <button type="button" class={btn} onClick={() => download(`${s.name || 'colors'}.py`, mpl())}>Download .py</button>
            <button type="button" class={btn} onClick={() => copyExport(toHexList(palette), 'Hex list')}>Copy hex list</button>
            <button type="button" class={btn} onClick={() => copyExport(toRgbList(palette), 'RGB list')}>Copy RGB list</button>
          </div>
          <pre class="mono max-h-40 overflow-auto rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800" data-testid="pymol">{pymol()}</pre>
        </section>
        <p role="status" class="text-xs text-slate-500">{msg}</p>
      </div>}
      actions={<ActionBar onCopy={() => `${header}\n${toHexList(palette)}\n\n${scienceText(SCIENCE)}`} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
