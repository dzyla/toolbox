import { useEffect, useRef, useState } from 'preact/hooks';
import type { ParsedStructure, Residue, Vec3 } from '@/core/protein/structure';

export type ColorScheme = 'rainbow' | 'secondary' | 'chain' | 'rmsd' | 'solidA' | 'solidB';

interface StructureCanvasProps {
  structureA?: ParsedStructure | null;
  structureB?: ParsedStructure | null;
  colorSchemeA?: ColorScheme;
  colorSchemeB?: ColorScheme;
  perResidueDeviations?: number[];
  showDistanceVectors?: boolean;
  width?: number;
  height?: number;
}

interface RenderItem {
  type: 'sphere' | 'cylinder' | 'line';
  z: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export function StructureCanvas({
  structureA,
  structureB,
  colorSchemeA = 'secondary',
  colorSchemeB = 'solidB',
  perResidueDeviations,
  showDistanceVectors = false,
  width = 600,
  height = 450,
}: StructureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera orientation angles in radians
  const [rotX, setRotX] = useState(0.3);
  const [rotY, setRotY] = useState(-0.4);
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);

  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number; button: number }>({ x: 0, y: 0, button: 0 });
  const touchDistRef = useRef<number | null>(null);

  // Compute common center of mass for all displayed structures
  const combinedCenter = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const maxSpan = useRef<number>(30);

  useEffect(() => {
    const allCa = [
      ...(structureA?.caAtoms || []),
      ...(structureB?.caAtoms || []),
    ];
    if (allCa.length === 0) return;

    let sx = 0, sy = 0, sz = 0;
    for (const a of allCa) {
      sx += a.coord.x; sy += a.coord.y; sz += a.coord.z;
    }
    const cx = sx / allCa.length;
    const cy = sy / allCa.length;
    const cz = sz / allCa.length;
    combinedCenter.current = { x: cx, y: cy, z: cz };

    let maxDistSq = 1;
    for (const a of allCa) {
      const dx = a.coord.x - cx;
      const dy = a.coord.y - cy;
      const dz = a.coord.z - cz;
      maxDistSq = Math.max(maxDistSq, dx * dx + dy * dy + dz * dz);
    }
    maxSpan.current = Math.max(15, Math.sqrt(maxDistSq));
  }, [structureA, structureB]);

  // Color helper functions
  function getResidueColor(res: Residue, idx: number, total: number, scheme: ColorScheme): string {
    if (scheme === 'solidA') return '#06b6d4'; // Cyan
    if (scheme === 'solidB') return '#f97316'; // Orange / Amber
    if (scheme === 'secondary') {
      if (res.secondary === 'H') return '#ec4899'; // Helix: Pink/Magenta
      if (res.secondary === 'E') return '#eab308'; // Sheet: Yellow/Gold
      return '#94a3b8'; // Coil: Slate Gray
    }
    if (scheme === 'rainbow') {
      const hue = Math.round(240 - (idx / Math.max(1, total - 1)) * 240); // Blue (240) to Red (0)
      return `hsl(${hue}, 85%, 55%)`;
    }
    if (scheme === 'rmsd') {
      const dev = perResidueDeviations?.[idx] ?? 0;
      if (dev < 0.5) return '#3b82f6'; // Blue: close
      if (dev < 1.2) return '#10b981'; // Green: moderate
      if (dev < 2.5) return '#f59e0b'; // Amber: divergent
      return '#ef4444'; // Red: large deviation
    }
    // Chain color
    return res.chain === 'A' ? '#3b82f6' : '#8b5cf6';
  }

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI retina display
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.clearRect(0, 0, width, height);

    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    const fov = 400 * zoom;
    const cameraDist = maxSpan.current * 2.8;
    const cx = combinedCenter.current.x;
    const cy = combinedCenter.current.y;
    const cz = combinedCenter.current.z;

    // 3D to 2D projection function
    function project(p: Vec3): { px: number; py: number; pz: number; depth: number } {
      // 1. Center at origin
      const ox = p.x - cx;
      const oy = p.y - cy;
      const oz = p.z - cz;

      // 2. Rotate around Y axis
      const x1 = cosY * ox + sinY * oz;
      const y1 = oy;
      const z1 = -sinY * ox + cosY * oz;

      // 3. Rotate around X axis
      const x2 = x1;
      const y2 = cosX * y1 - sinX * z1;
      const z2 = sinX * y1 + cosX * z1;

      // 4. Perspective projection
      const depth = cameraDist + z2;
      const scale = depth > 0.1 ? fov / depth : 1;
      const px = width / 2 + panX + x2 * scale;
      const py = height / 2 + panY - y2 * scale; // Invert Y for canvas coordinate system

      return { px, py, pz: z2, depth };
    }

    const items: RenderItem[] = [];

    // Helper to add protein structure to render items
    function addStructureItems(struct: ParsedStructure, scheme: ColorScheme, sphereRadius = 4, bondWidth = 3) {
      for (const chain of struct.chains) {
        const residues = chain.residues.filter(r => !!r.caAtom);
        const total = residues.length;

        // Render Ca atoms
        residues.forEach((res, i) => {
          const ca = res.caAtom!;
          const { px, py, pz, depth } = project(ca.coord);
          if (depth <= 0.1) return;

          const color = getResidueColor(res, i, total, scheme);
          const r = Math.max(1.5, (sphereRadius * fov) / depth);

          items.push({
            type: 'sphere',
            z: pz,
            draw: c => {
              c.beginPath();
              c.arc(px, py, r, 0, Math.PI * 2);
              c.fillStyle = color;
              c.fill();
              c.strokeStyle = 'rgba(0,0,0,0.25)';
              c.lineWidth = 1;
              c.stroke();
            },
          });
        });

        // Render backbone bonds connecting adjacent Ca atoms
        for (let i = 0; i < residues.length - 1; i++) {
          const r1 = residues[i]!;
          const r2 = residues[i + 1]!;
          // Skip if gap in residue numbers > 1
          if (Math.abs(r2.resSeq - r1.resSeq) > 2) continue;

          const p1 = project(r1.caAtom!.coord);
          const p2 = project(r2.caAtom!.coord);
          if (p1.depth <= 0.1 || p2.depth <= 0.1) continue;

          const midZ = (p1.pz + p2.pz) / 2;
          const color1 = getResidueColor(r1, i, total, scheme);
          const w = Math.max(1, (bondWidth * fov) / ((p1.depth + p2.depth) / 2));

          items.push({
            type: 'cylinder',
            z: midZ,
            draw: c => {
              c.beginPath();
              c.moveTo(p1.px, p1.py);
              c.lineTo(p2.px, p2.py);
              c.strokeStyle = color1;
              c.lineWidth = w;
              c.lineCap = 'round';
              c.stroke();
            },
          });
        }
      }
    }

    if (structureA) {
      addStructureItems(structureA, colorSchemeA, 4.5, 3.5);
    }
    if (structureB) {
      addStructureItems(structureB, colorSchemeB, 4.0, 3.0);
    }

    // Distance vector lines connecting corresponding Ca atoms
    if (showDistanceVectors && structureA && structureB) {
      const caA = structureA.chains.flatMap(c => c.residues).filter(r => !!r.caAtom);
      const caB = structureB.chains.flatMap(c => c.residues).filter(r => !!r.caAtom);
      const count = Math.min(caA.length, caB.length);

      for (let i = 0; i < count; i++) {
        const p1 = project(caA[i]!.caAtom!.coord);
        const p2 = project(caB[i]!.caAtom!.coord);
        const midZ = (p1.pz + p2.pz) / 2;
        const dev = perResidueDeviations?.[i] || 0;

        items.push({
          type: 'line',
          z: midZ + 0.1, // slightly in front
          draw: c => {
            c.beginPath();
            c.setLineDash([3, 3]);
            c.moveTo(p1.px, p1.py);
            c.lineTo(p2.px, p2.py);
            c.strokeStyle = dev > 2.0 ? '#ef4444' : dev > 1.0 ? '#f59e0b' : '#10b981';
            c.lineWidth = 1.2;
            c.stroke();
            c.setLineDash([]);
          },
        });
      }
    }

    // Sort items by z ascending (Painter's algorithm: farthest back drawn first)
    items.sort((a, b) => a.z - b.z);
    for (const item of items) {
      item.draw(ctx);
    }
  }, [structureA, structureB, colorSchemeA, colorSchemeB, perResidueDeviations, showDistanceVectors, rotX, rotY, zoom, panX, panY, width, height]);

  // Mouse interaction handlers
  function handleMouseDown(e: MouseEvent) {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY, button: e.button };
  }

  function handleMouseMove(e: MouseEvent) {
    if (isDraggingRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY, button: e.button };

      if (e.shiftKey || lastMouseRef.current.button === 2) {
        // Pan
        setPanX(prev => prev + dx);
        setPanY(prev => prev + dy);
      } else {
        // Orbit rotate
        setRotY(prev => prev + dx * 0.012);
        setRotX(prev => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev + dy * 0.012)));
      }
    }
  }

  function handleMouseUp() {
    isDraggingRef.current = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => Math.max(0.2, Math.min(6.0, prev * factor)));
  }

  function handleResetView() {
    setRotX(0.3);
    setRotY(-0.4);
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }

  return (
    <div class="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 select-none">
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px`, touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        class="cursor-grab active:cursor-grabbing block w-full"
      />

      {/* Control Overlay Buttons */}
      <div class="absolute top-3 right-3 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-xs p-1 rounded-xl border border-slate-700">
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(6.0, z * 1.25))}
          title="Zoom In"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-bold"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}
          title="Zoom Out"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-bold"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleResetView}
          title="Reset Orientation"
          class="px-2 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold"
        >
          Reset
        </button>
      </div>

      {/* Gesture / Navigation Hints */}
      <div class="absolute bottom-2.5 left-3 text-[11px] text-slate-400/80 pointer-events-none flex items-center gap-2 font-mono">
        <span>🖱️ Drag to rotate</span>
        <span>·</span>
        <span>Shift+Drag to pan</span>
        <span>·</span>
        <span>Scroll to zoom</span>
      </div>
    </div>
  );
}
