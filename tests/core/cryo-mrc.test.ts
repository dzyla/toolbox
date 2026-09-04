import { describe, it, expect } from 'vitest';
import {
  parseMrc,
  generateDemoClasses,
  generateDemo3DVolume,
} from '@/core/cryoem';

describe('Cryo-EM MRC / MRCS Parser and Processor', () => {
  it('generates demo 2D classes with expected dimensions and metadata', () => {
    const mrc = generateDemoClasses(8, 32);
    expect(mrc.header.nx).toBe(32);
    expect(mrc.header.ny).toBe(32);
    expect(mrc.header.nz).toBe(8);
    expect(mrc.header.is3DVolume).toBe(false);
    expect(mrc.slices.length).toBe(8);
    expect(mrc.slices[0]!.length).toBe(32 * 32);

    const ortho = mrc.getOrthoslice('xy', 0);
    expect(ortho.width).toBe(32);
    expect(ortho.height).toBe(32);
    expect(ortho.data.length).toBe(32 * 32);
  });

  it('generates demo 3D volume and extracts valid orthoslices across all 3 planes', () => {
    const volume = generateDemo3DVolume(24);
    expect(volume.header.nx).toBe(24);
    expect(volume.header.ny).toBe(24);
    expect(volume.header.nz).toBe(24);
    expect(volume.header.is3DVolume).toBe(true);

    const xy = volume.getOrthoslice('xy', 12);
    expect(xy.width).toBe(24);
    expect(xy.height).toBe(24);

    const xz = volume.getOrthoslice('xz', 12);
    expect(xz.width).toBe(24);
    expect(xz.height).toBe(24);

    const yz = volume.getOrthoslice('yz', 12);
    expect(yz.width).toBe(24);
    expect(yz.height).toBe(24);
  });

  it('computes maximum intensity projection (MIP) across all planes for 3D volumes', () => {
    const volume = generateDemo3DVolume(20);
    const mipXy = volume.getMaxProjection('xy');
    expect(mipXy.width).toBe(20);
    expect(mipXy.height).toBe(20);
    expect(mipXy.data.length).toBe(20 * 20);

    const mipXz = volume.getMaxProjection('xz');
    expect(mipXz.width).toBe(20);
    expect(mipXz.height).toBe(20);
    expect(mipXz.data.length).toBe(20 * 20);

    const mipYz = volume.getMaxProjection('yz');
    expect(mipYz.width).toBe(20);
    expect(mipYz.height).toBe(20);
    expect(mipYz.data.length).toBe(20 * 20);

    // MIP value at each pixel must be >= any individual slice value at that pixel
    for (let z = 0; z < 20; z++) {
      const slice = volume.slices[z]!;
      for (let i = 0; i < 20 * 20; i++) {
        expect(mipXy.data[i]).toBeGreaterThanOrEqual(slice[i]!);
      }
    }

    // Slab range MIP test
    const slabMIP = volume.getMaxProjection('xy', 5, 10);
    expect(slabMIP.width).toBe(20);
    expect(slabMIP.height).toBe(20);
    for (let i = 0; i < 20 * 20; i++) {
      expect(mipXy.data[i]).toBeGreaterThanOrEqual(slabMIP.data[i]!);
    }
  });

  it('rejects corrupt or undersized buffers', () => {
    const tinyBuffer = new ArrayBuffer(500);
    expect(() => parseMrc(tinyBuffer)).toThrow('File too small');
  });

  it('parses valid binary MRC buffer with float32 density data', () => {
    const nx = 16;
    const ny = 16;
    const nz = 2;
    const totalBytes = 1024 + nx * ny * nz * 4;
    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);

    view.setInt32(0, nx, true);
    view.setInt32(4, ny, true);
    view.setInt32(8, nz, true);
    view.setInt32(12, 2, true); // float32 mode
    view.setInt32(28, nx, true);
    view.setInt32(32, ny, true);
    view.setInt32(36, nz, true);
    view.setFloat32(40, nx * 1.5, true); // cellA X -> pixelSize = 1.5
    view.setFloat32(76, -0.5, true); // dmin
    view.setFloat32(80, 2.5, true);  // dmax
    view.setFloat32(84, 0.4, true);  // dmean

    // Write some density data
    const floatView = new Float32Array(buffer, 1024, nx * ny * nz);
    floatView[0] = 1.23;
    floatView[nx * ny + 5] = 2.45;

    const parsed = parseMrc(buffer);
    expect(parsed.header.nx).toBe(16);
    expect(parsed.header.ny).toBe(16);
    expect(parsed.header.nz).toBe(2);
    expect(parsed.header.pixelSize).toBeCloseTo(1.5, 4);
    expect(parsed.slices.length).toBe(2);
    expect(parsed.slices[0]![0]).toBeCloseTo(1.23, 4);
    expect(parsed.slices[1]![5]).toBeCloseTo(2.45, 4);
  });
});
