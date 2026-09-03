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
  showOrfs: boolean;
  minOrfAa: number;
  showLabels: boolean;
  selectedFeatureId: string;
}

const DEFAULTS: State = {
  presetId: 'puc19',
  viewMode: 'circular',
  reFilter: 'unique',
  showOrfs: true,
  minOrfAa: 50,
  showLabels: true,
  selectedFeatureId: '',
};

export default function PlasmidView() {
  const [stateSig, shareUrl] = useUrlState<State>('plasmid', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [plasmid, setPlasmid] = useState<Plasmid>(() => PRESET_PLASMIDS[0]!);
  const [customFastaInput, setCustomFastaInput] = useState<string>('');
  const [hoveredItem, setHoveredItem] = useState<{
    name: string;
    type: string;
    coords: string;
    details?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Restriction sites
  const allRestrictionSites = useMemo(() => {
    return findRestrictionSites(plasmid.seq, plasmid.isCircular);
  }, [plasmid.seq, plasmid.isCircular]);

  const filteredRestrictionSites = useMemo(() => {
    if (s.reFilter === 'none') return [];
    if (s.reFilter === 'unique') return allRestrictionSites.filter(s => s.cutCount === 1);
    if (s.reFilter === 'dual') return allRestrictionSites.filter(s => s.cutCount === 2);
    return allRestrictionSites;
  }, [allRestrictionSites, s.reFilter]);

  // Detected ORFs
  const detectedOrfs = useMemo(() => {
    return findORFs(plasmid.seq, s.minOrfAa, plasmid.isCircular);
  }, [plasmid.seq, s.minOrfAa, plasmid.isCircular]);

  const gcContent = useMemo(() => calculateGC(plasmid.seq), [plasmid.seq]);

  function handleSelectPreset(id: string) {
    set({ presetId: id });
    const p = PRESET_PLASMIDS.find(item => item.id === id);
    if (p) {
      setPlasmid(p);
      set({ selectedFeatureId: '' });
    }
  }

  function handlePasteFasta() {
    if (!customFastaInput.trim()) return;
    const p = parseFastaPlasmid(customFastaInput);
    if (p.length > 0) {
      setPlasmid(p);
      set({ presetId: 'custom', selectedFeatureId: '' });
    }
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const p = parseFastaPlasmid(text);
        if (p.length > 0) {
          p.name = file.name.replace(/\.[^/.]+$/, '');
          setPlasmid(p);
          set({ presetId: 'custom', selectedFeatureId: '' });
        }
      }
    };
    reader.readAsText(file);
  }

  function handleAddOrfAsFeature(orf: ORF) {
    const newFeature: PlasmidFeature = {
      id: `feat-${orf.id}`,
      name: `ORF ${orf.frame > 0 ? '+' : ''}${orf.frame} (${orf.lengthAa} aa)`,
      type: 'cds',
      start: orf.start,
      end: orf.end,
      strand: orf.strand,
      color: FEATURE_COLORS.cds,
      notes: `Predicted Open Reading Frame (${orf.lengthBp} bp, ${orf.lengthAa} aa)`,
      translation: orf.protein,
    };
    setPlasmid(prev => ({
      ...prev,
      features: [...prev.features, newFeature],
    }));
  }

  function handleExportSvg() {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plasmid.name.toLowerCase().replace(/\s+/g, '_')}_plasmid_map.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    const rows = [
      ['Name', 'Type', 'Start', 'End', 'Length_bp', 'Strand', 'Notes'],
      ...plasmid.features.map(f => [
        f.name,
        f.type,
        f.start,
        f.end,
        f.end >= f.start ? f.end - f.start + 1 : plasmid.length - f.start + f.end + 1,
        f.strand === 1 ? 'Forward (+)' : 'Reverse (-)',
        f.notes || '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plasmid.name.toLowerCase().replace(/\s+/g, '_')}_features.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const copySummary = [
    `Plasmid: ${plasmid.name} (${plasmid.length.toLocaleString()} bp, ${gcContent.toFixed(1)}% GC, ${plasmid.isCircular ? 'Circular' : 'Linear'})`,
    `Features (${plasmid.features.length}):`,
    ...plasmid.features.map(f => `  - ${f.name} (${f.type}): ${f.start}..${f.end} [${f.strand === 1 ? '+' : '-'}]`),
    `Restriction Sites (${filteredRestrictionSites.length}):`,
    ...filteredRestrictionSites.map(s => `  - ${s.enzyme}: cut at ${s.cutPosition} bp (${s.cutCount}× cutter)`),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  // Math helpers for circular plasmid map
  const cx = 300;
  const cy = 300;
  const radius = 170;

  function bpToAngleRad(bp: number): number {
    return ((bp - 1) / Math.max(1, plasmid.length)) * 2 * Math.PI - Math.PI / 2;
  }

  function polarToCartesian(centerX: number, centerY: number, r: number, angleRad: number) {
    return {
      x: centerX + r * Math.cos(angleRad),
      y: centerY + r * Math.sin(angleRad),
    };
  }

  // Generate SVG arc path for a curved feature block arrow
  function describeArcArrow(
    startBp: number,
    endBp: number,
    strand: 1 | -1,
    rInner: number,
    rOuter: number,
  ): string {
    const totalLen = plasmid.length;
    let span = endBp >= startBp ? endBp - startBp : totalLen - startBp + endBp;
    if (span <= 0) span = 10;

    const startAng = bpToAngleRad(startBp);
    const endAng = bpToAngleRad(startBp + span);
    const midR = (rInner + rOuter) / 2;
    const arrowLenRad = Math.min((endAng - startAng) * 0.4, (12 / midR));

    const largeArcFlag = span / totalLen > 0.5 ? 1 : 0;

    if (strand === 1) {
      // Clockwise arrowhead
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
      // Counter-clockwise arrowhead
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

  return (
    <ToolLayout
      icon="⭕"
      title="Plasmid Viewer & Map"
      blurb="Interactive circular & linear plasmid maps, SnapGene-style feature annotation, ORF detection, and restriction site mapping."
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
                onClick={handlePasteFasta}
                class="px-3 py-1.5 bg-accent-600 hover:bg-accent-700 text-white font-medium rounded-lg transition"
              >
                Apply Sequence
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Upload FASTA
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".fa,.fasta,.dna,.gb,.gbk,.txt"
                class="hidden"
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
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
                ⭕ Circular Map
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
                🔠 Sequence & ORFs
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

          {/* ORF Detection Controls */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Open Reading Frames
              </span>
              <span class="text-[11px] text-slate-400 mono">
                {detectedOrfs.length} found
              </span>
            </div>
            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>Minimum Size:</span>
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

          {/* Quick Stats Banner */}
          <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60 text-xs space-y-1.5">
            <div class="flex justify-between">
              <span class="text-slate-500">Plasmid Size:</span>
              <strong class="mono">{plasmid.length.toLocaleString()} bp</strong>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">GC Content:</span>
              <strong class="mono">{gcContent.toFixed(1)}%</strong>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Annotated Features:</span>
              <strong class="mono">{plasmid.features.length}</strong>
            </div>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Top Bar: Title & Quick Actions */}
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{plasmid.name}</span>
                <span class="text-xs font-normal text-slate-500 mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {plasmid.length.toLocaleString()} bp · {gcContent.toFixed(1)}% GC
                </span>
              </h2>
              {plasmid.description && (
                <p class="text-xs text-slate-500 mt-0.5">{plasmid.description}</p>
              )}
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportSvg}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition flex items-center gap-1"
              >
                📥 Export SVG
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* VIEW 1: Circular Plasmid Map */}
          {s.viewMode === 'circular' && (
            <div class="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-50/50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 relative">
              <svg
                ref={svgRef}
                viewBox="0 0 600 600"
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
                  const isSelected = s.selectedFeatureId === feat.id;
                  const isHovered = hoveredItem?.name === feat.name;

                  return (
                    <g
                      key={feat.id}
                      class="cursor-pointer transition-all"
                      onClick={() => set({ selectedFeatureId: feat.id })}
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
                        stroke={isSelected || isHovered ? '#38bdf8' : 'rgba(0,0,0,0.15)'}
                        stroke-width={isSelected || isHovered ? 2.5 : 0.8}
                      >
                        <title>{feat.name} ({feat.type}): {feat.start}–{feat.end} bp</title>
                      </path>
                    </g>
                  );
                })}

                {/* Restriction Sites (Radial Callouts) */}
                {filteredRestrictionSites.map(site => {
                  const ang = bpToAngleRad(site.cutPosition);
                  const p0 = polarToCartesian(cx, cy, radius, ang);
                  const p1 = polarToCartesian(cx, cy, radius + 48, ang);
                  const isUnique = site.cutCount === 1;

                  return (
                    <g
                      key={site.id}
                      class="cursor-pointer"
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
                  <text x={cx} y={cy - 4} font-size="11" font-family="monospace" fill="#64748b" text-anchor="middle">
                    {hoveredItem ? hoveredItem.type : `${plasmid.length.toLocaleString()} bp · ${gcContent.toFixed(1)}% GC`}
                  </text>
                  <text x={cx} y={cy + 16} font-size="10" font-family="monospace" fill="#0284c7" font-weight="600" text-anchor="middle">
                    {hoveredItem ? hoveredItem.coords : (plasmid.isCircular ? 'Circular Double-Stranded' : 'Linear')}
                  </text>
                  {hoveredItem?.details && (
                    <text x={cx} y={cy + 34} font-size="9" fill="#94a3b8" text-anchor="middle">
                      {hoveredItem.details.length > 34 ? `${hoveredItem.details.slice(0, 32)}…` : hoveredItem.details}
                    </text>
                  )}
                </g>
              </svg>

              {/* Legend pills */}
              <div class="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
                {Object.entries(FEATURE_COLORS).map(([type, color]) => (
                  <span key={type} class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                    <span class="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                    <span class="capitalize text-slate-700 dark:text-slate-300">{type}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 2: Linear Map View */}
          {s.viewMode === 'linear' && (
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 overflow-x-auto">
              <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                Linear Plasmid Track
              </h3>
              <div class="min-w-[700px] py-4">
                <svg viewBox="0 0 800 160" class="w-full h-auto">
                  {/* Backbone line */}
                  <line x1="30" x2="770" y1="60" y2="60" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" />
                  <text x="30" y="50" font-size="10" font-family="monospace" fill="#64748b">1 bp</text>
                  <text x="770" y="50" text-anchor="end" font-size="10" font-family="monospace" fill="#64748b">{plasmid.length.toLocaleString()} bp</text>

                  {/* Features */}
                  {plasmid.features.map((feat, idx) => {
                    const x1 = 30 + ((feat.start - 1) / plasmid.length) * 740;
                    const w = Math.max(6, ((feat.end - feat.start + 1) / plasmid.length) * 740);
                    const y = 75 + (idx % 3) * 24;
                    return (
                      <g key={feat.id}>
                        <rect
                          x={x1}
                          y={y}
                          width={w}
                          height="16"
                          rx="3"
                          fill={feat.color || FEATURE_COLORS[feat.type] || '#3b82f6'}
                          stroke="#ffffff"
                          stroke-width="0.5"
                        >
                          <title>{feat.name}: {feat.start}–{feat.end} bp</title>
                        </rect>
                        {w > 30 && (
                          <text
                            x={x1 + w / 2}
                            y={y + 11}
                            font-size="9"
                            font-weight="bold"
                            text-anchor="middle"
                            fill="#ffffff"
                          >
                            {feat.name.length * 6 > w ? `${feat.name.slice(0, Math.floor(w / 6))}…` : feat.name}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Restriction Sites */}
                  {filteredRestrictionSites.map(site => {
                    const x = 30 + ((site.cutPosition - 1) / plasmid.length) * 740;
                    return (
                      <g key={site.id}>
                        <line x1={x} x2={x} y1="35" y2="60" stroke="#2563eb" stroke-width="1" />
                        <text
                          x={x}
                          y="30"
                          font-size="8"
                          text-anchor="middle"
                          fill="#2563eb"
                          font-weight="bold"
                        >
                          {site.enzyme}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* VIEW 3: Sequence & ORF Inspector */}
          {s.viewMode === 'sequence' && (
            <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Detected Open Reading Frames (ORFs ≥ {s.minOrfAa} aa)
                </h3>
                <span class="text-xs text-slate-400">{detectedOrfs.length} ORFs detected</span>
              </div>

              <div class="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {detectedOrfs.length === 0 ? (
                  <p class="py-4 text-center text-slate-500">No ORFs meet the minimum size threshold.</p>
                ) : (
                  detectedOrfs.map((orf, i) => (
                    <div key={orf.id} class="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60">
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
                        <p class="mono text-[11px] text-slate-400 truncate max-w-xl">
                          {orf.protein}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddOrfAsFeature(orf)}
                        class="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg transition shrink-0"
                      >
                        + Add to Map
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Raw Sequence viewer with 60-bp blocks */}
              <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 class="font-semibold text-xs text-slate-500 uppercase tracking-wider">
                  Nucleotide Sequence
                </h4>
                <div class="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 mono text-xs leading-relaxed">
                  {Array.from({ length: Math.ceil(plasmid.seq.length / 60) }, (_, idx) => {
                    const start = idx * 60;
                    const chunk = plasmid.seq.slice(start, start + 60);
                    return (
                      <div key={start} class="flex gap-4">
                        <span class="text-slate-400 select-none w-12 text-right">{(start + 1).toString().padStart(5, ' ')}</span>
                        <span class="text-slate-700 dark:text-slate-300 tracking-wider">
                          {chunk.match(/.{1,10}/g)?.join(' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: Features & Restriction Sites Table */}
          {s.viewMode === 'table' && (
            <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Feature Annotations ({plasmid.features.length})
                </h3>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider">
                      <th class="pb-2 font-semibold">Name</th>
                      <th class="pb-2 font-semibold">Type</th>
                      <th class="pb-2 font-semibold">Coordinates</th>
                      <th class="pb-2 font-semibold text-right">Length (bp)</th>
                      <th class="pb-2 font-semibold text-center">Strand</th>
                      <th class="pb-2 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    {plasmid.features.map(f => {
                      const len = f.end >= f.start ? f.end - f.start + 1 : plasmid.length - f.start + f.end + 1;
                      return (
                        <tr key={f.id} class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td class="py-2 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color || FEATURE_COLORS[f.type] }} />
                            {f.name}
                          </td>
                          <td class="py-2 text-slate-500 capitalize">{f.type}</td>
                          <td class="py-2 mono">{f.start}..{f.end}</td>
                          <td class="py-2 mono text-right">{len.toLocaleString()}</td>
                          <td class="py-2 text-center">
                            <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${f.strand === 1 ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                              {f.strand === 1 ? '5′→3′ (+)' : '3′←5′ (-)'}
                            </span>
                          </td>
                          <td class="py-2 text-slate-500">{f.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
