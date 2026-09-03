import { useState, useMemo, useRef } from 'preact/hooks';
import {
  type Plasmid,
  type PlasmidFeature,
  type ORF,
  PRESET_PLASMIDS,
  FEATURE_COLORS,
  calculateGC,
  findRestrictionSites,
  findORFs,
  detectPlasmidElements,
  parseFastaPlasmid,
} from '@/core/plasmid';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  presetId: string;
  viewMode: 'circular' | 'linear' | 'sequence' | 'table';
  reFilter: 'unique' | 'dual' | 'all' | 'none';
  showOrfsOnMap: boolean;
  minOrfAa: number;
  showLabels: boolean;
  selectedFeatureId: string;
  selectedRange?: { start: number; end: number; name: string };
  seqZoomBp: number; // 20, 40, 60 bp per line
}

const DEFAULTS: State = {
  presetId: 'puc19',
  viewMode: 'circular',
  reFilter: 'unique',
  showOrfsOnMap: true,
  minOrfAa: 50,
  showLabels: true,
  selectedFeatureId: '',
  seqZoomBp: 60,
};

const FRAME_COLORS: Record<number, string> = {
  1: '#38bdf8',  // Sky
  2: '#818cf8',  // Indigo
  3: '#a855f7',  // Purple
  [-1]: '#f43f5e', // Rose
  [-2]: '#fb923c', // Orange
  [-3]: '#eab308', // Amber
};

export default function PlasmidView() {
  const [stateSig, shareUrl] = useUrlState<State>('plasmid', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [plasmid, setPlasmid] = useState<Plasmid>(() => PRESET_PLASMIDS[0]!);
  const [customFastaInput, setCustomFastaInput] = useState<string>('');
  const [detectionNotice, setDetectionNotice] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<{
    name: string;
    type: string;
    coords: string;
    details?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const seqContainerRef = useRef<HTMLDivElement>(null);

  // Restriction sites
  const allRestrictionSites = useMemo(() => {
    return findRestrictionSites(plasmid.seq, plasmid.isCircular);
  }, [plasmid.seq, plasmid.isCircular]);

  const filteredRestrictionSites = useMemo(() => {
    if (s.reFilter === 'none') return [];
    if (s.reFilter === 'unique') return allRestrictionSites.filter(site => site.cutCount === 1);
    if (s.reFilter === 'dual') return allRestrictionSites.filter(site => site.cutCount === 2);
    return allRestrictionSites;
  }, [allRestrictionSites, s.reFilter]);

  // Detected ORFs
  const detectedOrfs = useMemo(() => {
    return findORFs(plasmid.seq, s.minOrfAa, plasmid.isCircular);
  }, [plasmid.seq, s.minOrfAa, plasmid.isCircular]);

  const gcContent = useMemo(() => calculateGC(plasmid.seq), [plasmid.seq]);

  function handleSelectPreset(id: string) {
    set({ presetId: id, selectedFeatureId: '', selectedRange: undefined });
    const p = PRESET_PLASMIDS.find(item => item.id === id);
    if (p) {
      setPlasmid(p);
      setDetectionNotice(null);
    }
  }

  function handleAutoDetectElements() {
    const found = detectPlasmidElements(plasmid.seq, plasmid.isCircular);
    if (found.length === 0) {
      setDetectionNotice('No additional standard tags or elements detected in this sequence.');
      return;
    }

    // Merge non-duplicate features
    const existingNames = new Set(plasmid.features.map(f => f.name.toLowerCase()));
    const newFeatures = found.filter(f => !existingNames.has(f.name.toLowerCase()));

    if (newFeatures.length === 0) {
      setDetectionNotice('All standard elements and tags are already annotated.');
      return;
    }

    setPlasmid(prev => ({
      ...prev,
      features: [...prev.features, ...newFeatures],
    }));
    setDetectionNotice(`Detected and added ${newFeatures.length} new features: ${newFeatures.map(f => f.name).join(', ')}.`);
  }

  function handleAddOrfAsFeature(orf: ORF) {
    const newFeature: PlasmidFeature = {
      id: orf.id,
      name: `ORF (${orf.frame > 0 ? `+${orf.frame}` : orf.frame}) ${orf.lengthAa}aa`,
      type: 'cds',
      start: orf.start,
      end: orf.end,
      strand: orf.strand,
      color: FRAME_COLORS[orf.frame] || '#6366f1',
      notes: `Length: ${orf.lengthBp} bp (${orf.lengthAa} aa). Reading frame ${orf.frame}.`,
      translation: orf.protein,
    };
    setPlasmid(prev => ({
      ...prev,
      features: [...prev.features, newFeature],
    }));
  }

  function handleCustomFastaSubmit() {
    if (!customFastaInput.trim()) return;
    const parsed = parseFastaPlasmid(customFastaInput);
    if (parsed) {
      // Auto-detect elements on custom sequence
      const autoElements = detectPlasmidElements(parsed.seq, parsed.isCircular);
      parsed.features = autoElements;
      setPlasmid(parsed);
      set({ presetId: 'custom', selectedFeatureId: '', selectedRange: undefined });
      setDetectionNotice(`Loaded custom plasmid with ${autoElements.length} auto-detected features.`);
    }
  }

  function handleSelectFeatureRange(start: number, end: number, name: string, featId?: string) {
    set({
      selectedFeatureId: featId || '',
      selectedRange: { start, end, name },
    });
  }

  function handleZoomToSequence(start: number, end: number, name: string) {
    set({
      viewMode: 'sequence',
      selectedRange: { start, end, name },
    });
    setTimeout(() => {
      const lineIdx = Math.floor((start - 1) / s.seqZoomBp);
      const targetEl = document.getElementById(`seq-line-${lineIdx}`);
      targetEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  function handleExportSvg() {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plasmid.name}_plasmid_map.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Circular Map Geometry
  const cx = 350;
  const cy = 350;
  const radius = 175;

  function bpToAngleRad(bp: number): number {
    const frac = ((bp - 1) / Math.max(1, plasmid.length)) % 1;
    return frac * 2 * Math.PI - Math.PI / 2;
  }

  function polarToCartesian(centerX: number, centerY: number, r: number, angleRad: number) {
    return {
      x: centerX + r * Math.cos(angleRad),
      y: centerY + r * Math.sin(angleRad),
    };
  }

  function describeArcArrow(
    startBp: number,
    endBp: number,
    strand: 1 | -1,
    rInner: number,
    rOuter: number,
  ): string {
    const totalLen = plasmid.length;
    let span = endBp >= startBp ? endBp - startBp : totalLen - startBp + endBp;
    if (span <= 0) span = 1;

    const startAng = bpToAngleRad(startBp);
    const endAng = bpToAngleRad(startBp + span);
    const midR = (rInner + rOuter) / 2;
    const arrowLenRad = Math.min((endAng - startAng) * 0.4, (12 / midR));
    const largeArcFlag = span / totalLen > 0.5 ? 1 : 0;

    if (strand === 1) {
      const bodyEndAng = Math.max(startAng, endAng - arrowLenRad);
      const p1 = polarToCartesian(cx, cy, rInner, startAng);
      const p2 = polarToCartesian(cx, cy, rInner, bodyEndAng);
      const p3 = polarToCartesian(cx, cy, rInner - 3, bodyEndAng);
      const pTip = polarToCartesian(cx, cy, midR, endAng);
      const p4 = polarToCartesian(cx, cy, rOuter + 3, bodyEndAng);
      const p5 = polarToCartesian(cx, cy, rOuter, bodyEndAng);
      const p6 = polarToCartesian(cx, cy, rOuter, startAng);

      return [
        `M ${p1.x} ${p1.y}`,
        `A ${rInner} ${rInner} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`,
        `L ${p3.x} ${p3.y}`,
        `L ${pTip.x} ${pTip.y}`,
        `L ${p4.x} ${p4.y}`,
        `L ${p5.x} ${p5.y}`,
        `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 0 ${p6.x} ${p6.y}`,
        'Z',
      ].join(' ');
    } else {
      const bodyStartAng = Math.min(endAng, startAng + arrowLenRad);
      const pTip = polarToCartesian(cx, cy, midR, startAng);
      const p1 = polarToCartesian(cx, cy, rInner - 3, bodyStartAng);
      const p2 = polarToCartesian(cx, cy, rInner, bodyStartAng);
      const p3 = polarToCartesian(cx, cy, rInner, endAng);
      const p4 = polarToCartesian(cx, cy, rOuter, endAng);
      const p5 = polarToCartesian(cx, cy, rOuter, bodyStartAng);
      const p6 = polarToCartesian(cx, cy, rOuter + 3, bodyStartAng);

      return [
        `M ${pTip.x} ${pTip.y}`,
        `L ${p1.x} ${p1.y}`,
        `L ${p2.x} ${p2.y}`,
        `A ${rInner} ${rInner} 0 ${largeArcFlag} 1 ${p3.x} ${p3.y}`,
        `L ${p4.x} ${p4.y}`,
        `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 0 ${p5.x} ${p5.y}`,
        `L ${p6.x} ${p6.y}`,
        'Z',
      ].join(' ');
    }
  }

  // Ticks along circular plasmid
  const ticks = useMemo(() => {
    const len = plasmid.length;
    let step = 500;
    if (len <= 2000) step = 200;
    else if (len >= 8000) step = 1000;
    const list: { bp: number; label: string }[] = [];
    for (let bp = 0; bp < len; bp += step) {
      list.push({ bp: bp === 0 ? 1 : bp, label: `${bp.toLocaleString()} bp` });
    }
    return list;
  }, [plasmid.length]);

  const copyText = [
    `Plasmid: ${plasmid.name} (${plasmid.length.toLocaleString()} bp, GC: ${gcContent.toFixed(1)}%)`,
    `Features (${plasmid.features.length}):`,
    ...plasmid.features.map(f => `  - ${f.name} (${f.type}): ${f.start}..${f.end} (${f.strand === 1 ? '+' : '-'})`),
    `Restriction Sites (${filteredRestrictionSites.length}):`,
    ...filteredRestrictionSites.map(s => `  - ${s.enzyme}: cut at ${s.cutPosition} bp (${s.cutCount}×)`),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="⭕"
      title="Plasmid Viewer & Map"
      blurb="SnapGene-style circular & linear maps, auto-detection of tags and elements, 6-frame ORF tracks, and hierarchical sequence zoom."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Preset Picker */}
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Select Vector Preset
            </label>
            <select
              value={s.presetId}
              onChange={(e) => handleSelectPreset((e.target as HTMLSelectElement).value)}
              class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-medium"
            >
              {PRESET_PLASMIDS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.length.toLocaleString()} bp)
                </option>
              ))}
              <option value="custom">Custom Sequence / Upload</option>
            </select>
          </div>

          {/* Auto-Detect Tags & Elements Button */}
          <div class="space-y-2">
            <button
              type="button"
              onClick={handleAutoDetectElements}
              class="w-full py-2 px-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <span>🔍</span>
              <span>Auto-Detect Tags & Elements</span>
            </button>
            {detectionNotice && (
              <p class="text-[11px] p-2 bg-accent-50 dark:bg-accent-950/40 border border-accent-200 dark:border-accent-800 text-accent-800 dark:text-accent-300 rounded-lg">
                {detectionNotice}
              </p>
            )}
          </div>

          {/* Custom Sequence Paste / Upload */}
          <details open={s.presetId === 'custom'} class="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50 text-xs space-y-2">
            <summary class="cursor-pointer font-semibold text-slate-700 dark:text-slate-300 select-none">
              Import Sequence or File (FASTA)
            </summary>
            <textarea
              rows={4}
              placeholder="Paste FASTA or raw DNA sequence..."
              value={customFastaInput}
              onInput={(e) => setCustomFastaInput((e.target as HTMLTextAreaElement).value)}
              class="w-full p-2 mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 resize-y"
            />
            <div class="flex gap-2">
              <button
                type="button"
                onClick={handleCustomFastaSubmit}
                class="flex-1 py-1 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold rounded-lg text-xs hover:bg-slate-800 transition"
              >
                Load Sequence
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="px-3 py-1 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Upload File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".fasta,.fa,.dna,.txt,.gb"
                class="hidden"
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const txt = ev.target?.result as string;
                      if (txt) {
                        setCustomFastaInput(txt);
                        const parsed = parseFastaPlasmid(txt);
                        if (parsed) {
                          parsed.features = detectPlasmidElements(parsed.seq, parsed.isCircular);
                          setPlasmid(parsed);
                          set({ presetId: 'custom' });
                        }
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
            </div>
          </details>

          {/* View Modes */}
          <div>
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Display Mode
            </span>
            <div class="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => set({ viewMode: 'circular' })}
                class={`p-2 rounded-lg font-medium text-center transition ${s.viewMode === 'circular' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                🪐 Circular Map
              </button>
              <button
                type="button"
                onClick={() => set({ viewMode: 'linear' })}
                class={`p-2 rounded-lg font-medium text-center transition ${s.viewMode === 'linear' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                📏 Linear Map
              </button>
              <button
                type="button"
                onClick={() => set({ viewMode: 'sequence' })}
                class={`p-2 rounded-lg font-medium text-center transition ${s.viewMode === 'sequence' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                🔬 Sequence & ORFs
              </button>
              <button
                type="button"
                onClick={() => set({ viewMode: 'table' })}
                class={`p-2 rounded-lg font-medium text-center transition ${s.viewMode === 'table' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                📋 Features Table
              </button>
            </div>
          </div>

          {/* ORF On-Map Toggle and Minimum Size */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                ORF Tracks on Map
              </span>
              <span class="text-[11px] text-slate-400 mono">
                {detectedOrfs.length} ORFs
              </span>
            </div>
            <label class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={s.showOrfsOnMap}
                onChange={(e) => set({ showOrfsOnMap: (e.target as HTMLInputElement).checked })}
                class="rounded text-accent-600 accent-accent-600"
              />
              <span>Show ORFs on Circular & Linear Map</span>
            </label>
            <div>
              <div class="flex justify-between text-[11px] text-slate-500 mb-1">
                <span>Minimum ORF Size:</span>
                <span class="mono font-semibold">{s.minOrfAa} aa ({s.minOrfAa * 3} bp)</span>
              </div>
              <input
                type="range"
                min="30"
                max="200"
                step="10"
                value={s.minOrfAa}
                onInput={(e) => set({ minOrfAa: parseInt((e.target as HTMLInputElement).value) })}
                class="w-full accent-accent-600"
              />
            </div>
          </div>

          {/* Restriction Enzymes Filter */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Restriction Sites
              </span>
              <span class="text-[11px] text-slate-400 mono">
                {filteredRestrictionSites.length} sites
              </span>
            </div>
            <div class="grid grid-cols-2 gap-1 text-xs">
              <button
                type="button"
                onClick={() => set({ reFilter: 'unique' })}
                class={`px-2 py-1 rounded font-medium transition ${s.reFilter === 'unique' ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                Unique Cutters (1×)
              </button>
              <button
                type="button"
                onClick={() => set({ reFilter: 'dual' })}
                class={`px-2 py-1 rounded font-medium transition ${s.reFilter === 'dual' ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                Dual Cutters (2×)
              </button>
              <button
                type="button"
                onClick={() => set({ reFilter: 'all' })}
                class={`px-2 py-1 rounded font-medium transition ${s.reFilter === 'all' ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                All Enzymes
              </button>
              <button
                type="button"
                onClick={() => set({ reFilter: 'none' })}
                class={`px-2 py-1 rounded font-medium transition ${s.reFilter === 'none' ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                Hide Sites
              </button>
            </div>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Synchronized Zoom Breadcrumb & Selected Feature Banner */}
          {s.selectedRange && (
            <div class="p-3 rounded-2xl bg-accent-50 dark:bg-accent-950/40 border border-accent-200 dark:border-accent-800 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-base">📍</span>
                <div>
                  <strong class="text-xs text-accent-900 dark:text-accent-200 block">
                    Selected: {s.selectedRange.name}
                  </strong>
                  <span class="mono text-[11px] text-accent-700 dark:text-accent-400">
                    Position: {s.selectedRange.start}–{s.selectedRange.end} bp ({Math.abs(s.selectedRange.end - s.selectedRange.start) + 1} bp)
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-1.5">
                {s.viewMode !== 'sequence' && (
                  <button
                    type="button"
                    onClick={() => handleZoomToSequence(s.selectedRange!.start, s.selectedRange!.end, s.selectedRange!.name)}
                    class="px-2.5 py-1 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-xs font-semibold transition"
                  >
                    🔬 Zoom to Sequence
                  </button>
                )}
                {s.viewMode !== 'linear' && (
                  <button
                    type="button"
                    onClick={() => set({ viewMode: 'linear' })}
                    class="px-2.5 py-1 bg-white dark:bg-slate-900 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300 rounded-lg text-xs font-semibold hover:bg-accent-100 transition"
                  >
                    📏 Zoom to Linear
                  </button>
                )}
                {s.viewMode !== 'circular' && (
                  <button
                    type="button"
                    onClick={() => set({ viewMode: 'circular' })}
                    class="px-2.5 py-1 bg-white dark:bg-slate-900 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300 rounded-lg text-xs font-semibold hover:bg-accent-100 transition"
                  >
                    🪐 Plasmid View
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW 1: Circular Plasmid Map */}
          {s.viewMode === 'circular' && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Circular Plasmid Map
                  </h3>
                  <p class="text-xs text-slate-500">
                    Concentric tracks display features, ORFs (SnapGene style), and single-cutter restriction sites. Click any feature to inspect and zoom.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportSvg}
                  class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 transition shrink-0"
                >
                  Export SVG
                </button>
              </div>

              <div class="overflow-x-auto flex justify-center py-2">
                <svg
                  ref={svgRef}
                  viewBox="0 0 700 700"
                  class="w-full max-w-[620px] h-auto select-none"
                  role="img"
                  aria-label={`Circular map of ${plasmid.name}`}
                >
                  {/* Center circle details */}
                  <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#cbd5e1" stroke-width="2.5" />

                  {/* Graduation ticks around circle */}
                  {ticks.map(t => {
                    const ang = bpToAngleRad(t.bp);
                    const pInner = polarToCartesian(cx, cy, radius - 4, ang);
                    const pOuter = polarToCartesian(cx, cy, radius + 4, ang);
                    const pText = polarToCartesian(cx, cy, radius - 16, ang);
                    return (
                      <g key={t.bp}>
                        <line x1={pInner.x} y1={pInner.y} x2={pOuter.x} y2={pOuter.y} stroke="#94a3b8" stroke-width="1" />
                        <text
                          x={pText.x}
                          y={pText.y}
                          font-size="8"
                          font-family="monospace"
                          fill="#94a3b8"
                          text-anchor="middle"
                          dominant-baseline="central"
                        >
                          {t.bp}
                        </text>
                      </g>
                    );
                  })}

                  {/* Features (Curved Block Arrows) */}
                  {plasmid.features.map((feat, idx) => {
                    const trackOffset = (idx % 2) * 16;
                    const rIn = radius + 12 + trackOffset;
                    const rOut = rIn + 12;
                    const path = describeArcArrow(feat.start, feat.end, feat.strand, rIn, rOut);
                    const isSelected = s.selectedFeatureId === feat.id || s.selectedRange?.name === feat.name;
                    const isHovered = hoveredItem?.name === feat.name;

                    return (
                      <g
                        key={feat.id}
                        class="cursor-pointer transition-all"
                        onClick={() => handleSelectFeatureRange(feat.start, feat.end, feat.name, feat.id)}
                        onMouseEnter={() => setHoveredItem({
                          name: feat.name,
                          type: feat.type.toUpperCase(),
                          coords: `${feat.start}–${feat.end} bp (${feat.strand === 1 ? '5′→3′' : '3′←5′'})`,
                          details: feat.notes,
                        })}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        <path
                          d={path}
                          fill={feat.color || FEATURE_COLORS[feat.type] || '#3b82f6'}
                          stroke={isSelected || isHovered ? '#38bdf8' : 'rgba(0,0,0,0.2)'}
                          stroke-width={isSelected || isHovered ? 2.5 : 0.8}
                        >
                          <title>{feat.name} ({feat.type}): {feat.start}–{feat.end} bp</title>
                        </path>
                      </g>
                    );
                  })}

                  {/* SnapGene-Style ORFs on Circular Map */}
                  {s.showOrfsOnMap && detectedOrfs.map((orf) => {
                    // Forward ORFs on outer ring, Reverse ORFs on inner ring
                    const isFwd = orf.strand === 1;
                    const trackOffset = (Math.abs(orf.frame) - 1) * 7;
                    const rIn = isFwd ? radius + 46 + trackOffset : radius - 30 - trackOffset;
                    const rOut = rIn + 6;
                    const path = describeArcArrow(orf.start, orf.end, orf.strand, rIn, rOut);
                    const frameColor = FRAME_COLORS[orf.frame] || '#6366f1';
                    const isSelected = s.selectedRange?.name === `ORF (${orf.frame > 0 ? `+${orf.frame}` : orf.frame})`;

                    return (
                      <g
                        key={orf.id}
                        class="cursor-pointer"
                        onClick={() => handleSelectFeatureRange(orf.start, orf.end, `ORF (${orf.frame > 0 ? `+${orf.frame}` : orf.frame})`)}
                        onMouseEnter={() => setHoveredItem({
                          name: `ORF Frame ${orf.frame > 0 ? `+${orf.frame}` : orf.frame}`,
                          type: 'OPEN READING FRAME',
                          coords: `${orf.start}–${orf.end} bp (${orf.lengthAa} aa / ${orf.lengthBp} bp)`,
                          details: orf.protein,
                        })}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        <path
                          d={path}
                          fill={frameColor}
                          opacity={isSelected ? 1 : 0.75}
                          stroke={isSelected ? '#ffffff' : 'none'}
                          stroke-width={isSelected ? 1.5 : 0}
                        >
                          <title>ORF Frame {orf.frame}: {orf.start}–{orf.end} bp ({orf.lengthAa} aa)</title>
                        </path>
                      </g>
                    );
                  })}

                  {/* Restriction Sites (Radial Callouts) */}
                  {filteredRestrictionSites.map(site => {
                    const ang = bpToAngleRad(site.cutPosition);
                    const p0 = polarToCartesian(cx, cy, radius, ang);
                    const p1 = polarToCartesian(cx, cy, radius + 75, ang);
                    const isUnique = site.cutCount === 1;

                    return (
                      <g
                        key={site.id}
                        class="cursor-pointer"
                        onClick={() => handleSelectFeatureRange(site.cutPosition, site.cutPosition, `${site.enzyme} Site`)}
                        onMouseEnter={() => setHoveredItem({
                          name: site.enzyme,
                          type: `${site.cutCount}× Cutter`,
                          coords: `Position: ${site.cutPosition} bp`,
                          details: `Recognition: ${site.recognitionSeq} (${site.overhang || 'cut'})`,
                        })}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={isUnique ? '#2563eb' : '#94a3b8'} stroke-width={isUnique ? 1.2 : 0.8} />
                        <text
                          x={p1.x + Math.cos(ang) * 5}
                          y={p1.y + Math.sin(ang) * 5}
                          font-size="9"
                          font-weight={isUnique ? 'bold' : 'normal'}
                          font-family="sans-serif"
                          fill={isUnique ? '#2563eb' : '#64748b'}
                          text-anchor={Math.cos(ang) >= 0 ? 'start' : 'end'}
                          dominant-baseline="central"
                        >
                          {site.enzyme} ({site.cutPosition})
                        </text>
                      </g>
                    );
                  })}

                  {/* Center Information Display */}
                  <g class="pointer-events-none">
                    <text x={cx} y={cy - 24} font-size="16" font-weight="bold" fill="#0f172a" text-anchor="middle">
                      {hoveredItem ? hoveredItem.name : plasmid.name}
                    </text>
                    <text x={cx} y={cy - 6} font-size="11" font-family="monospace" fill="#64748b" text-anchor="middle">
                      {hoveredItem ? hoveredItem.coords : `${plasmid.length.toLocaleString()} bp · ${gcContent.toFixed(1)}% GC`}
                    </text>
                    <text x={cx} y={cy + 12} font-size="10" font-family="sans-serif" font-weight="bold" fill="#0284c7" text-anchor="middle">
                      {hoveredItem ? hoveredItem.type : (plasmid.isCircular ? 'CIRCULAR' : 'LINEAR')}
                    </text>
                    {hoveredItem?.details && (
                      <text x={cx} y={cy + 30} font-size="9" font-family="sans-serif" fill="#64748b" text-anchor="middle">
                        {hoveredItem.details.slice(0, 36)}…
                      </text>
                    )}
                  </g>
                </svg>
              </div>
            </div>
          )}

          {/* VIEW 2: Linear Feature Map */}
          {s.viewMode === 'linear' && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                Linear Plasmid Track & Features
              </h3>

              <div class="overflow-x-auto py-2">
                <svg viewBox="0 0 800 240" class="w-full min-w-[700px] h-auto select-none">
                  {/* Base track */}
                  <line x1="30" x2="770" y1="80" y2="80" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" />

                  {/* Base-pair scale markers */}
                  {ticks.map(t => {
                    const x = 30 + ((t.bp - 1) / plasmid.length) * 740;
                    return (
                      <g key={t.bp}>
                        <line x1={x} x2={x} y1="75" y2="85" stroke="#94a3b8" stroke-width="1" />
                        <text x={x} y="98" font-size="8" font-family="monospace" fill="#94a3b8" text-anchor="middle">
                          {t.bp}
                        </text>
                      </g>
                    );
                  })}

                  {/* Features */}
                  {plasmid.features.map((feat, idx) => {
                    const x1 = 30 + ((feat.start - 1) / plasmid.length) * 740;
                    const x2 = 30 + ((feat.end - 1) / plasmid.length) * 740;
                    const w = Math.max(8, x2 - x1);
                    const y = (idx % 2 === 0) ? 45 : 105;

                    return (
                      <g
                        key={feat.id}
                        class="cursor-pointer"
                        onClick={() => handleSelectFeatureRange(feat.start, feat.end, feat.name, feat.id)}
                      >
                        <rect
                          x={x1}
                          y={y}
                          width={w}
                          height="18"
                          rx="4"
                          fill={feat.color || FEATURE_COLORS[feat.type] || '#3b82f6'}
                          stroke="#ffffff"
                          stroke-width="1"
                        />
                        {w > 25 && (
                          <text x={x1 + w / 2} y={y + 12} font-size="9" font-weight="bold" text-anchor="middle" fill="#ffffff">
                            {feat.name}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* ORFs on Linear Track */}
                  {s.showOrfsOnMap && detectedOrfs.map((orf) => {
                    const x1 = 30 + ((orf.start - 1) / plasmid.length) * 740;
                    const x2 = 30 + ((orf.end - 1) / plasmid.length) * 740;
                    const w = Math.max(6, Math.abs(x2 - x1));
                    const y = orf.strand === 1 ? 25 : 135;
                    const frameColor = FRAME_COLORS[orf.frame] || '#6366f1';

                    return (
                      <g
                        key={orf.id}
                        class="cursor-pointer"
                        onClick={() => handleSelectFeatureRange(orf.start, orf.end, `ORF (${orf.frame > 0 ? `+${orf.frame}` : orf.frame})`)}
                      >
                        <rect
                          x={Math.min(x1, x2)}
                          y={y}
                          width={w}
                          height="12"
                          rx="3"
                          fill={frameColor}
                          opacity={0.8}
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* VIEW 3: Sequence & 6-Frame Translation Viewer */}
          {s.viewMode === 'sequence' && (
            <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Sequence & Translation Viewer
                  </h3>
                  <p class="text-xs text-slate-500">
                    Detailed base-pair sequence with highlighted features and open reading frame coordinates.
                  </p>
                </div>
                <div class="flex items-center gap-1.5 text-xs">
                  <span class="text-slate-400">Zoom:</span>
                  {[20, 40, 60].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set({ seqZoomBp: n })}
                      class={`px-2 py-0.5 rounded font-mono font-semibold transition ${s.seqZoomBp === n ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}
                    >
                      {n} bp
                    </button>
                  ))}
                </div>
              </div>

              {/* Detected Open Reading Frames */}
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <h4 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Detected Open Reading Frames (ORFs ≥ {s.minOrfAa} aa)
                  </h4>
                  <span class="text-xs text-slate-400">{detectedOrfs.length} detected</span>
                </div>
                <div class="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {detectedOrfs.map((orf, i) => (
                    <div key={orf.id} class="p-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <div class="space-y-0.5">
                        <div class="flex items-center gap-2">
                          <span class={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${orf.strand === 1 ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                            Frame {orf.frame > 0 ? `+${orf.frame}` : orf.frame}
                          </span>
                          <strong class="text-slate-900 dark:text-slate-100">ORF #{i + 1}</strong>
                          <span class="mono text-slate-500">
                            {orf.start}..{orf.end} ({orf.lengthBp} bp · {orf.lengthAa} aa)
                          </span>
                        </div>
                        <p class="mono text-[11px] text-slate-400 truncate max-w-lg">
                          {orf.protein}
                        </p>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleZoomToSequence(orf.start, orf.end, `ORF #${i + 1}`)}
                          class="px-2 py-0.5 text-xs font-semibold bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300 hover:bg-accent-100 rounded transition"
                        >
                          Focus
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddOrfAsFeature(orf)}
                          class="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 rounded transition"
                        >
                          + Add to Map
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nucleotide Sequence Viewer */}
              <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Nucleotide Sequence
                </h4>
              </div>

              {/* Sequence Blocks */}
              <div
                ref={seqContainerRef}
                class="max-h-[380px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 mono text-xs leading-relaxed space-y-2"
              >
                {Array.from({ length: Math.ceil(plasmid.seq.length / s.seqZoomBp) }, (_, idx) => {
                  const start = idx * s.seqZoomBp;
                  const end = Math.min(plasmid.seq.length, start + s.seqZoomBp);
                  const chunk = plasmid.seq.slice(start, end);

                  const isHighlighted = s.selectedRange && (
                    (start + 1 <= s.selectedRange.end && end >= s.selectedRange.start)
                  );

                  return (
                    <div
                      key={idx}
                      id={`seq-line-${idx}`}
                      class={`p-1.5 rounded transition flex items-start gap-4 ${isHighlighted ? 'bg-amber-100/70 dark:bg-amber-950/60 ring-1 ring-amber-400' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                    >
                      <span class="text-slate-400 select-none w-16 text-right shrink-0">
                        {(start + 1).toString().padStart(5, '0')}
                      </span>
                      <span class="font-mono tracking-wider font-semibold text-slate-800 dark:text-slate-200 break-all">
                        {chunk}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 4: Features Table */}
          {s.viewMode === 'table' && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                Feature Annotations ({plasmid.features.length})
              </h3>
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th class="pb-2 font-semibold">Name</th>
                      <th class="pb-2 font-semibold">Type</th>
                      <th class="pb-2 font-semibold">Start</th>
                      <th class="pb-2 font-semibold">End</th>
                      <th class="pb-2 font-semibold">Strand</th>
                      <th class="pb-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    {plasmid.features.map(f => (
                      <tr key={f.id} class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td class="py-2 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span class="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.color || FEATURE_COLORS[f.type] }} />
                          <span>{f.name}</span>
                        </td>
                        <td class="py-2 text-slate-500 uppercase text-[10px] font-bold">{f.type}</td>
                        <td class="py-2 mono">{f.start}</td>
                        <td class="py-2 mono">{f.end}</td>
                        <td class="py-2 mono font-bold">{f.strand === 1 ? '5′→3′ (+)' : '3′←5′ (-)'}</td>
                        <td class="py-2">
                          <button
                            type="button"
                            onClick={() => handleZoomToSequence(f.start, f.end, f.name)}
                            class="px-2 py-0.5 text-[11px] font-semibold bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300 rounded hover:bg-accent-100"
                          >
                            Zoom
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
