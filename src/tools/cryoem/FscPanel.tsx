import { useMemo, useRef, useState } from 'preact/hooks';
import { useDraftText } from '@/lib/drafts';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { ImportAlert } from '@/app/components/ImportAlert';
import { downloadBlob, downloadSvg, downloadText, svgToPngBlob, toCsv } from '@/lib/export';
import {
  analyzeFscCurve, buildFscCurves, detectFscColumns, nyquistSummary, parseFscTable, syntheticFscStar,
  FSC_GOLD_STANDARD, FSC_HALF,
  type FreqKind, type FscAnalysis, type FscCurve, type FscMapping, type FscTable,
} from '@/core/cryoem';

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const BTN = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';
const MUTED = 'text-slate-500 dark:text-slate-400';

/** Okabe-Ito colour-blind-safe palette, readable on white. */
const COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#7A5C00', '#555555'];
const colorOf = (i: number) => COLORS[i % COLORS.length]!;

const KIND_LABEL: Record<FreqKind, string> = {
  invAngstrom: 'Spatial frequency (1/Å)',
  angstrom: 'Resolution (Å)',
  index: 'Shell index (needs pixel and box size)',
};
const EXAMPLE = syntheticFscStar();
const positiveOrUndefined = (s: string) => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) && v > 0 ? v : undefined; };
const fmtRes = (r?: number) => (r === undefined ? '' : `${r.toFixed(2)} Å`);

interface Kept { source: string; curve: FscCurve }

// ---------- plot ----------

const W = 680, H = 400, ML = 56, MR = 20, MT = 16, MB = 62;
const RES_TICKS = [100, 50, 20, 10, 8, 6, 5, 4, 3.5, 3, 2.5, 2, 1.8, 1.6, 1.4, 1.2, 1];

function FscPlot({ curves, analyses, nyquistRes, svgRef }: {
  curves: FscCurve[]; analyses: FscAnalysis[]; nyquistRes?: number; svgRef: { current: SVGSVGElement | null };
}) {
  const fmax = Math.max(...curves.map(c => Math.max(...c.freq)));
  const ymin = Math.min(0, ...curves.map(c => Math.min(...c.fsc)));
  const y0 = ymin < 0 ? Math.floor(ymin * 5) / 5 : 0, y1 = 1.02;
  const x = (f: number) => ML + (f / fmax) * (W - ML - MR);
  const y = (v: number) => MT + (1 - (v - y0) / (y1 - y0)) * (H - MT - MB);
  const xticks: { f: number; label: string }[] = [{ f: 0, label: '∞' }];
  for (const r of RES_TICKS) {
    const f = 1 / r;
    if (f > fmax * 1.001) continue;
    if (x(f) - x(xticks[xticks.length - 1]!.f) < 44) continue;
    xticks.push({ f, label: `${r} Å` });
  }
  const yticks: number[] = [];
  for (let v = Math.ceil(y0 * 5) / 5; v <= 1.0001; v += 0.2) yticks.push(Math.round(v * 10) / 10);
  const text = '#334155', grid = '#cbd5e1';
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="FSC curves versus spatial frequency with resolution labels, threshold lines at 0.143 and 0.5 and drop-lines at the crossings"
      style={{ maxWidth: `${W}px`, background: '#ffffff' }} font-family="system-ui, sans-serif">
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      {yticks.map(v => (
        <g key={v}>
          <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke={grid} stroke-width="0.5" />
          <text x={ML - 6} y={y(v) + 4} text-anchor="end" font-size="11" fill={text}>{v.toFixed(1)}</text>
        </g>
      ))}
      {xticks.map(t => (
        <g key={t.label}>
          <line x1={x(t.f)} x2={x(t.f)} y1={H - MB} y2={H - MB + 4} stroke={text} />
          <text x={x(t.f)} y={H - MB + 16} text-anchor="middle" font-size="11" fill={text}>{t.label}</text>
          <text x={x(t.f)} y={H - MB + 29} text-anchor="middle" font-size="9" fill="#475569">{t.f === 0 ? '0' : t.f.toFixed(3)}</text>
        </g>
      ))}
      <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke={text} />
      <line x1={ML} x2={ML} y1={MT} y2={H - MB} stroke={text} />
      <text x={(ML + W - MR) / 2} y={H - 8} text-anchor="middle" font-size="12" fill={text}>
        Resolution (Å); spatial frequency (1/Å) in grey, increasing to the right
      </text>
      <text transform={`translate(14 ${(MT + H - MB) / 2}) rotate(-90)`} text-anchor="middle" font-size="12" fill={text}>FSC</text>
      {[FSC_GOLD_STANDARD, FSC_HALF].map(t => (
        <g key={t}>
          <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} stroke="#64748b" stroke-width="1" stroke-dasharray="6 4" />
          <text x={W - MR - 2} y={y(t) - 3} text-anchor="end" font-size="10" fill="#475569">FSC = {t}</text>
        </g>
      ))}
      {nyquistRes !== undefined && 1 / nyquistRes <= fmax * 1.001 && (
        <g>
          <line x1={x(1 / nyquistRes)} x2={x(1 / nyquistRes)} y1={MT} y2={H - MB} stroke="#94a3b8" stroke-dasharray="2 3" />
          <text x={x(1 / nyquistRes) - 3} y={MT + 10} text-anchor="end" font-size="10" fill="#475569">Nyquist {nyquistRes.toFixed(2)} Å</text>
        </g>
      )}
      {curves.map((c, i) => {
        const col = colorOf(i);
        const d = c.freq.map((f, k) => `${k ? 'L' : 'M'}${x(f).toFixed(1)} ${y(c.fsc[k]!).toFixed(1)}`).join(' ');
        return (
          <g key={`${i}-${c.name}`}>
            <path d={d} fill="none" stroke={col} stroke-width="1.8" stroke-linejoin="round" />
            {analyses[i]?.crossings.map(cr => cr.status === 'crossed' && cr.frequency !== undefined && (
              <g key={cr.threshold}>
                <line x1={x(cr.frequency)} x2={x(cr.frequency)} y1={y(cr.threshold)} y2={H - MB} stroke={col} stroke-width="1" stroke-dasharray="3 3" />
                <circle cx={x(cr.frequency)} cy={y(cr.threshold)} r="3" fill={col} />
                <title>{`${c.name}: ${fmtRes(cr.resolution)} at FSC ${cr.threshold}`}</title>
              </g>
            ))}
          </g>
        );
      })}
      <g>
        {curves.map((c, i) => (
          <g key={`l${i}`} transform={`translate(${ML + 14} ${MT + 14 + i * 16})`}>
            <line x1="0" x2="18" y1="-4" y2="-4" stroke={colorOf(i)} stroke-width="2.5" />
            <text x="24" y="0" font-size="11" fill={text}>{c.name.length > 48 ? `${c.name.slice(0, 47)}…` : c.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ---------- panel ----------

export function FscPanel() {
  const [text, setText] = useDraftText('cryoem:fsc', () => '');
  const [sourceName, setSourceName] = useState('Pasted');
  const [pixelStr, setPixelStr] = useState('');
  const [boxStr, setBoxStr] = useState('');
  const [override, setOverride] = useState<{ forText: string; mapping: FscMapping } | null>(null);
  const [kept, setKept] = useState<Kept[]>([]);
  const [importError, setImportError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const box = positiveOrUndefined(boxStr);
  const isExample = text === EXAMPLE;

  const parsed = useMemo((): { table?: FscTable; auto?: FscMapping; error?: string } => {
    if (!text.trim()) return {};
    try {
      const table = parseFscTable(text);
      return { table, auto: detectFscColumns(table) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [text]);

  // The pixel size typed by the user wins; otherwise take the one RELION recorded in its command line.
  const pixelFromFile = parsed.table?.meta?.pixelSize;
  const pixelSize = positiveOrUndefined(pixelStr) ?? pixelFromFile;

  const mapping = parsed.auto && (override && override.forText === text ? override.mapping : parsed.auto);

  const built = useMemo((): { curves: FscCurve[]; error?: string } => {
    if (!parsed.table || !mapping) return { curves: [] };
    try { return { curves: buildFscCurves(parsed.table, mapping, { pixelSize, box }) }; }
    catch (e) { return { curves: [], error: e instanceof Error ? e.message : String(e) }; }
  }, [parsed.table, mapping, pixelSize, box]);

  const all = useMemo(() => [
    ...kept.map(k => ({ ...k.curve, name: `${k.source}: ${k.curve.name}` })),
    ...built.curves,
  ], [kept, built.curves]);
  const analyses = useMemo(() => all.map(c => analyzeFscCurve(c, { pixelSize })), [all, pixelSize]);
  const nyquistRes = pixelSize ? 2 * pixelSize : undefined;
  const error = parsed.error ?? built.error ?? '';

  const setMapping = (patch: Partial<FscMapping>) => {
    if (!mapping) return;
    setOverride({ forText: text, mapping: { ...mapping, ...patch, confident: true } });
  };

  async function loadFile(file: File) {
    setImportError('');
    try {
      setText(await readTextFile(file));
      setSourceName(file.name);
    } catch (e) {
      setImportError(importErrorMessage(e, file.name));
    }
  }

  const exportCsv = () => {
    const rows: (string | number)[][] = [[
      'Curve', 'Resolution at FSC 0.143 (A)', 'Resolution at FSC 0.5 (A)', 'Frequency at 0.143 (1/A)', 'Frequency at 0.5 (1/A)',
      'Nyquist resolution (A)', 'Nyquist check', 'Warnings',
    ]];
    for (const a of analyses) {
      const g = a.crossings.find(c => c.threshold === FSC_GOLD_STANDARD), h = a.crossings.find(c => c.threshold === FSC_HALF);
      rows.push([
        a.name, g?.resolution?.toFixed(3) ?? '', h?.resolution?.toFixed(3) ?? '',
        g?.frequency?.toFixed(5) ?? '', h?.frequency?.toFixed(5) ?? '',
        a.nyquistResolution.toFixed(3) + (a.nyquistInferred ? ' (inferred from last shell)' : ''),
        nyquistSummary(a), a.warnings.join(' | '),
      ]);
    }
    downloadText(toCsv(rows), 'fsc-resolution.csv', 'text/csv;charset=utf-8');
  };

  return (
    <div class="space-y-4" data-testid="cryo-fsc">
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900">
        <h3 class="mb-1 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">FSC curve import</h3>
        <p class={MUTED}>
          Load a RELION <code>postprocess.star</code> (<code>data_fsc</code>) or a CSV/TSV/space-separated table such as a cryoSPARC export.
          Curves are only read, never computed from maps. Column auto-detection is heuristic: always check the mapping under
          Advanced options and override it if it is wrong.
        </p>
      </div>

      <div
        class={`space-y-2 rounded-xl border-2 border-dashed p-3 ${dragging ? 'border-accent-600 bg-accent-50 dark:bg-slate-800' : 'border-slate-300 dark:border-slate-700'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) void loadFile(f);
        }}
      >
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700"
            onClick={() => { setText(EXAMPLE, { persist: false }); setSourceName('Synthetic example'); setOverride(null); setImportError(''); }}>
            Load example (synthetic)
          </button>
          <button type="button" class={BTN} onClick={() => fileRef.current?.click()}>Upload FSC file</button>
          <input ref={fileRef} type="file" accept=".star,.csv,.tsv,.txt,.dat" class="hidden" aria-label="FSC file"
            onChange={e => {
              const input = e.target as HTMLInputElement;
              const f = input.files?.[0];
              input.value = '';
              if (f) void loadFile(f);
            }} />
          <button type="button" class={`${BTN} text-rose-700 dark:text-rose-400`}
            onClick={() => { setText(''); setOverride(null); setImportError(''); }}>Clear</button>
          <span class={`text-xs ${MUTED}`}>or drop a file here, or paste below</span>
        </div>
        <textarea
          aria-label="Paste FSC data (RELION STAR, CSV, TSV or space-separated)"
          class={`${FIELD} h-28 font-mono text-xs`}
          spellcheck={false}
          placeholder={'Resolution (1/A),FSC\n0.00,1.000\n0.05,0.998\n...'}
          value={text}
          onInput={e => { setText((e.target as HTMLTextAreaElement).value); setSourceName('Pasted'); }}
        />
        <ImportAlert message={importError || error} />
        {isExample && (
          <p class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Synthetic example: curves generated from FSC = 1/(1+(f/f0)<sup>n</sup>), not measured data.
          </p>
        )}
      </div>

      <details class="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800" open={!!mapping && !mapping.confident ? true : undefined}>
        <summary class="cursor-pointer text-sm font-semibold">Advanced options: units, columns, overlay</summary>
        <div class="mt-3 space-y-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-xs font-medium">Pixel size (Å/px), for the Nyquist check
              <input type="number" inputMode="decimal" min="0" step="any" class={`${FIELD} mt-1`} value={pixelStr}
                placeholder="optional" onInput={e => setPixelStr((e.target as HTMLInputElement).value)} />
            </label>
            <label class="block text-xs font-medium">Box size (px), only for shell-index columns
              <input type="number" inputMode="numeric" min="0" step="1" class={`${FIELD} mt-1`} value={boxStr}
                placeholder="optional" onInput={e => setBoxStr((e.target as HTMLInputElement).value)} />
            </label>
          </div>
          {parsed.table && mapping && (
            <div class="space-y-2">
              {!mapping.confident && (
                <p class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  Column headers were not recognised, so the mapping below is a guess from the values. Please check it.
                </p>
              )}
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block text-xs font-medium">Frequency / resolution column
                  <select class={`${FIELD} mt-1`} value={mapping.freqCol}
                    onChange={e => setMapping({ freqCol: Number((e.target as HTMLSelectElement).value) })}>
                    {parsed.table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
                <label class="block text-xs font-medium">Units of that column
                  <select class={`${FIELD} mt-1`} value={mapping.freqKind}
                    onChange={e => setMapping({ freqKind: (e.target as HTMLSelectElement).value as FreqKind })}>
                    {(Object.keys(KIND_LABEL) as FreqKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                </label>
              </div>
              <fieldset class="text-xs">
                <legend class="font-medium">FSC columns to plot</legend>
                <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {parsed.table.headers.map((h, i) => i === mapping.freqCol ? null : (
                    <label key={i} class="flex items-center gap-1.5">
                      <input type="checkbox" checked={mapping.fscCols.includes(i)}
                        onChange={e => {
                          const on = (e.target as HTMLInputElement).checked;
                          setMapping({ fscCols: on ? [...mapping.fscCols, i].sort((a, b) => a - b) : mapping.fscCols.filter(c => c !== i) });
                        }} />
                      <span>{h}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {[...parsed.table.notes, ...mapping.notes].map(n => <p key={n} class={`text-[11px] ${MUTED}`}>{n}</p>)}
            </div>
          )}
          <div class="space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class={BTN} disabled={built.curves.length === 0}
                onClick={() => { setKept([...kept, ...built.curves.map(curve => ({ source: sourceName, curve }))]); setText(''); setOverride(null); }}>
                Keep these curves and load another
              </button>
              <span class={`text-xs ${MUTED}`}>Kept curves stay in the overlay (this session only).</span>
            </div>
            {kept.length > 0 && (
              <ul class="text-xs">
                {kept.map((k, i) => (
                  <li key={i} class="flex items-center gap-2">
                    <span>{k.source}: {k.curve.name}</span>
                    <button type="button" class="text-rose-700 underline dark:text-rose-400" aria-label={`Remove kept curve ${k.source}: ${k.curve.name}`}
                      onClick={() => setKept(kept.filter((_, j) => j !== i))}>remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>

      {all.length === 0 ? (
        <p class={`text-sm ${MUTED}`}>No curves yet. Load the synthetic example, upload a file, or paste a table.</p>
      ) : (
        <div class="space-y-3">
          <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700">
            <FscPlot curves={all} analyses={analyses} nyquistRes={nyquistRes} svgRef={svgRef} />
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={BTN} onClick={() => svgRef.current && downloadSvg(svgRef.current, 'fsc-curves.svg')}>Download plot (SVG)</button>
            <button type="button" class={BTN} onClick={async () => { if (svgRef.current) downloadBlob(await svgToPngBlob(svgRef.current, 2), 'fsc-curves.png'); }}>Download plot (PNG)</button>
            <button type="button" class={BTN} onClick={exportCsv}>Download table (CSV)</button>
          </div>
          {parsed.table?.meta?.relionFinalResolution !== undefined && (
            <p class={`rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800/50 ${MUTED}`}>
              RELION reported a final resolution of <strong class="font-mono">{parsed.table.meta.relionFinalResolution.toFixed(3)} Å</strong> (the last shell with corrected FSC ≥ 0.143, no interpolation). The interpolated value below is slightly better by design.
              {pixelFromFile !== undefined && positiveOrUndefined(pixelStr) === undefined && <> Pixel size {pixelFromFile} Å was read from the file header.</>}
            </p>
          )}
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm" aria-label="FSC resolution at thresholds">
              <thead>
                <tr class="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th scope="col" class="py-1.5 pr-3">Curve</th>
                  <th scope="col" class="py-1.5 pr-3">Resolution at 0.143</th>
                  <th scope="col" class="py-1.5 pr-3">Resolution at 0.5</th>
                  <th scope="col" class="py-1.5">Nyquist check</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a, i) => {
                  const cell = (t: number) => {
                    const c = a.crossings.find(x => x.threshold === t)!;
                    if (c.status === 'crossed') {
                      return (
                        <>
                          {fmtRes(c.resolution)}{c.reCrosses ? ' (re-crosses)' : ''}
                          {c.lastShellResolution !== undefined && (
                            <span class={`block font-sans text-[11px] ${MUTED}`}>last shell ≥ {t}: {fmtRes(c.lastShellResolution)}</span>
                          )}
                        </>
                      );
                    }
                    return c.status === 'below-start' ? 'starts below' : 'no crossing';
                  };
                  const ok = nyquistSummary(a) === 'OK';
                  return (
                    <tr key={i} class="border-b border-slate-100 align-top dark:border-slate-800">
                      <td class="py-1.5 pr-3">
                        <span aria-hidden="true" class="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(i) }} />
                        {a.name}
                      </td>
                      <td class="py-1.5 pr-3 font-mono tabular-nums">{cell(FSC_GOLD_STANDARD)}</td>
                      <td class="py-1.5 pr-3 font-mono tabular-nums">{cell(FSC_HALF)}</td>
                      <td class={`py-1.5 ${ok ? '' : 'font-semibold text-amber-800 dark:text-amber-300'}`}>
                        {ok ? 'OK' : `Warning: ${nyquistSummary(a)}`}
                        <span class={`block text-[11px] font-normal ${MUTED}`}>
                          Nyquist {a.nyquistResolution.toFixed(2)} Å{a.nyquistInferred ? ' (from last shell; enter pixel size in Advanced options)' : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {analyses.some(a => a.warnings.length > 0) && (
            <ul class="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" aria-label="FSC warnings">
              {analyses.flatMap(a => a.warnings.map(w => <li key={`${a.name}-${w}`}><strong>{a.name}:</strong> {w}</li>))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
