/* Download helpers. Everything stays on the device. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename);
}
export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(x => { const s = String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}
/** Serialise an inline <svg> (with computed styles for fill/stroke/font) to a standalone SVG string. */
export function svgToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const src = svg.querySelectorAll<SVGElement>('*'), dst = clone.querySelectorAll<SVGElement>('*');
  const PROPS = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'opacity', 'text-anchor', 'dominant-baseline'];
  src.forEach((el, i) => { const cs = getComputedStyle(el); for (const p of PROPS) { const v = cs.getPropertyValue(p); if (v) dst[i]!.style.setProperty(p, v); } });
  return new XMLSerializer().serializeToString(clone);
}
export function downloadSvg(svg: SVGSVGElement, filename: string) {
  downloadText(svgToString(svg), filename, 'image/svg+xml;charset=utf-8');
}
/** Rasterise an SVG element to PNG at a given scale (device pixels per CSS pixel). */
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const str = svgToString(svg);
  const { width, height } = svg.getBoundingClientRect();
  const img = new Image();
  const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('SVG render failed')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('PNG encode failed')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
