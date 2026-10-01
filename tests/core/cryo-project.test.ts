import { describe, expect, it } from 'vitest';
import { generateDemo3DVolume, projectVolume, type MrcData } from '@/core/cryoem';

/** Straightforward reference: rotate each voxel centre by R^-1 and sample trilinearly (zero outside the map). */
function referenceProject(m: MrcData, a: { x: number; y: number; z: number }) {
  const { nx, ny, nz } = m.header;
  const r = Math.PI / 180;
  const [cX, sX, cY, sY, cZ, sZ] = [Math.cos(-a.x * r), Math.sin(-a.x * r), Math.cos(-a.y * r), Math.sin(-a.y * r), Math.cos(-a.z * r), Math.sin(-a.z * r)];
  const at = (x: number, y: number, z: number) => m.slices[z]![y * nx + x]!;
  const sample = (x: number, y: number, z: number) => {
    if (x < 0 || x > nx - 1 || y < 0 || y > ny - 1 || z < 0 || z > nz - 1) return 0;
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1), z1 = Math.min(z0 + 1, nz - 1);
    const tx = x - x0, ty = y - y0, tz = z - z0;
    const c00 = at(x0, y0, z0) * (1 - tx) + at(x1, y0, z0) * tx;
    const c10 = at(x0, y1, z0) * (1 - tx) + at(x1, y1, z0) * tx;
    const c01 = at(x0, y0, z1) * (1 - tx) + at(x1, y0, z1) * tx;
    const c11 = at(x0, y1, z1) * (1 - tx) + at(x1, y1, z1) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };
  const out = new Float32Array(nx * ny);
  const cx = (nx - 1) / 2, cy = (ny - 1) / 2, cz = (nz - 1) / 2;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let d = 0;
    for (let z = 0; z < nz; z++) {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const zx = dx * cZ - dy * sZ, zy = dx * sZ + dy * cZ;
      const yx = zx * cY + dz * sY, yz = -zx * sY + dz * cY;
      d += sample(yx + cx, zy * cX - yz * sX + cy, zy * sX + yz * cX + cz);
    }
    out[y * nx + x] = d;
  }
  return out;
}

describe('projectVolume', () => {
  const vol = generateDemo3DVolume(24);
  it.each([
    [0, 0, 0], [90, 0, 0], [0, 45, 0], [0, 0, 30], [37, 122, -64], [170, 85, 260],
  ])('matches the reference at Euler (%d, %d, %d)', (x, y, z) => {
    const got = projectVolume(vol, { x, y, z }).data;
    const want = referenceProject(vol, { x, y, z });
    let maxErr = 0, maxVal = 0;
    for (let i = 0; i < want.length; i++) { maxErr = Math.max(maxErr, Math.abs(got[i]! - want[i]!)); maxVal = Math.max(maxVal, Math.abs(want[i]!)); }
    expect(maxErr).toBeLessThan(1e-4 * Math.max(1, maxVal));
  });
});

describe('template series limit', () => {
  it('flags maps too large for the requested number of views', async () => {
    const { templateSeriesLimit } = await import('@/tools/cryoem/template-pool');
    const h = (n: number) => ({ nx: n, ny: n, nz: n }) as never;
    expect(templateSeriesLimit(h(128), 256)).toBeNull();
    expect(templateSeriesLimit(h(512), 256)).toMatch(/Bin the map/);
  });
});
