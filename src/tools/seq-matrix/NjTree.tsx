import { useMemo, useRef, useState } from 'preact/hooks';
import { downloadBlob, downloadSvg, downloadText, svgToPngBlob } from '@/lib/export';
import { layoutPhylogram, midpointRoot, neighborJoining, percentToFraction, toNewick } from '@/core/msa/nj';

const BTN = 'px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition';

/** Neighbour-joining phylogram from the pairwise distance matrix (percent, 0..100). */
export function NjTree({ names, distancePct }: { names: string[]; distancePct: number[][] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [msg, setMsg] = useState('');

  const model = useMemo(() => {
    if (names.length < 2) return null;
    const nj = neighborJoining(names, percentToFraction(distancePct));
    const root = midpointRoot(nj.tree);
    return { nj, root, newick: toNewick(root), layout: layoutPhylogram(root) };
  }, [names, distancePct]);

  if (!model) return null;
  const { layout, newick, nj } = model;
  const rowH = 22, padL = 16, padR = 16, padT = 14, labelW = Math.min(260, 8 + 7 * Math.max(...names.map(n => n.length)));
  const plotW = 420;
  const width = padL + plotW + labelW + padR;
  const height = padT + layout.leafCount * rowH + 46;
  const scale = layout.maxX > 0 ? plotW / layout.maxX : 1;
  const px = (x: number) => padL + x * scale;
  const py = (y: number) => padT + y * rowH + rowH / 2;

  // scale bar: a round length (1, 2, 5 x 10^k) near a fifth of the plot width
  const target = layout.maxX / 5 || 0.1;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const barLen = [1, 2, 5, 10].map(m => m * mag).reduce((best, c) => Math.abs(c - target) < Math.abs(best - target) ? c : best);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2000); };
  const copy = async () => { try { await navigator.clipboard.writeText(newick); flash('Newick copied'); } catch { flash('Copy failed'); } };

  return (
    <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">Neighbour-joining tree</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
            Saitou &amp; Nei (1987) NJ on pairwise distances (1 − identity, as a fraction 0–1, no multiple-hit correction), midpoint-rooted for display.
            Guide-tree-quality NJ on pairwise identity, not a maximum-likelihood phylogeny.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class={BTN} onClick={copy}>Copy Newick</button>
          <button type="button" class={BTN} onClick={() => downloadText(newick + '\n', 'tree.nwk')}>Download .nwk</button>
          <button type="button" class={BTN} onClick={() => svgRef.current && downloadSvg(svgRef.current, 'tree.svg')}>SVG</button>
          <button type="button" class={BTN} onClick={async () => { if (svgRef.current) downloadBlob(await svgToPngBlob(svgRef.current, 3), 'tree.png'); }}>PNG</button>
          <span role="status" aria-live="polite" class="text-xs text-slate-500 dark:text-slate-400">{msg}</span>
        </div>
      </div>
      {nj.notes.map(n => <p key={n} class="text-xs text-amber-700 dark:text-amber-400">{n}</p>)}
      <div class="overflow-x-auto rounded-lg bg-white">
        <svg ref={svgRef} role="img" aria-label={`Neighbour-joining tree of ${names.length} sequences`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} class="text-slate-700" fontFamily="system-ui, sans-serif">
          {layout.nodes.map((nd, i) => {
            if (nd.parent < 0) {
              // root: vertical connector spanning its children
              const kids = layout.nodes.filter(k => k.parent === i);
              return <line key={i} x1={px(nd.x)} x2={px(nd.x)} y1={py(Math.min(...kids.map(k => k.y)))} y2={py(Math.max(...kids.map(k => k.y)))} stroke="currentColor" stroke-width={1.5} />;
            }
            const p = layout.nodes[nd.parent]!;
            const kids = layout.nodes.filter(k => k.parent === i);
            return (
              <g key={i}>
                <line x1={px(p.x)} x2={px(nd.x)} y1={py(nd.y)} y2={py(nd.y)} stroke="currentColor" stroke-width={1.5} />
                {kids.length > 0 && <line x1={px(nd.x)} x2={px(nd.x)} y1={py(Math.min(...kids.map(k => k.y)))} y2={py(Math.max(...kids.map(k => k.y)))} stroke="currentColor" stroke-width={1.5} />}
              </g>
            );
          })}
          {layout.nodes.filter(nd => !nd.node.children.length).map((nd, i) => (
            <text key={i} x={px(nd.x) + 6} y={py(nd.y)} dominant-baseline="middle" font-size={12} fill="currentColor">{nd.node.name}</text>
          ))}
          <g transform={`translate(${padL}, ${height - 26})`}>
            <line x1={0} x2={barLen * scale} y1={0} y2={0} stroke="currentColor" stroke-width={2} />
            <line x1={0} x2={0} y1={-4} y2={4} stroke="currentColor" />
            <line x1={barLen * scale} x2={barLen * scale} y1={-4} y2={4} stroke="currentColor" />
            <text x={barLen * scale + 8} y={0} dominant-baseline="middle" font-size={11} fill="currentColor">{Number(barLen.toPrecision(2))} substitutions/site (1 − identity)</text>
          </g>
        </svg>
      </div>
      <details class="text-xs text-slate-500 dark:text-slate-400">
        <summary class="cursor-pointer">Newick string</summary>
        <pre class="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">{newick}</pre>
      </details>
    </div>
  );
}
