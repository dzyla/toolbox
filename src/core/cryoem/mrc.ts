/**
 * MRC/MRCS file format parser and processor for Cryo-EM 2D class averages and 3D volumes.
 * Conforms to CCP4 / MRC2014 file format specifications (Cheng et al., J. Struct. Biol. 2015).
 */

export interface MrcHeader {
  nx: number;
  ny: number;
  nz: number;
  mode: number;
  nxstart: number;
  nystart: number;
  nzstart: number;
  mx: number;
  my: number;
  mz: number;
  cellA: [number, number, number];
  cellAngles: [number, number, number];
  mapc: number;
  mapr: number;
  maps: number;
  dmin: number;
  dmax: number;
  dmean: number;
  ispg: number;
  nsymbt: number;
  rms: number;
  pixelSize: number;
  is3DVolume: boolean;
}

export interface MrcData {
  header: MrcHeader;
  slices: Float32Array[];
  getOrthoslice(axis: 'xy' | 'xz' | 'yz', index: number): { width: number; height: number; data: Float32Array };
}

export function parseMrc(buffer: ArrayBuffer): MrcData {
  if (buffer.byteLength < 1024) {
    throw new Error('File too small to be a valid MRC file (< 1024 bytes).');
  }

  const view = new DataView(buffer);

  // Check endianness from machine stamp at byte 212
  const byte212 = view.getUint8(212);
  const isLittleEndian = byte212 !== 0x11 && byte212 !== 0x22;

  const nx = view.getInt32(0, isLittleEndian);
  const ny = view.getInt32(4, isLittleEndian);
  const nz = view.getInt32(8, isLittleEndian);
  const mode = view.getInt32(12, isLittleEndian);

  if (nx <= 0 || ny <= 0 || nz <= 0 || nx > 16384 || ny > 16384) {
    throw new Error(`Invalid MRC dimensions: ${nx} x ${ny} x ${nz}`);
  }

  const nxstart = view.getInt32(16, isLittleEndian);
  const nystart = view.getInt32(20, isLittleEndian);
  const nzstart = view.getInt32(24, isLittleEndian);

  const mx = view.getInt32(28, isLittleEndian);
  const my = view.getInt32(32, isLittleEndian);
  const mz = view.getInt32(36, isLittleEndian);

  const cellA: [number, number, number] = [
    view.getFloat32(40, isLittleEndian),
    view.getFloat32(44, isLittleEndian),
    view.getFloat32(48, isLittleEndian),
  ];

  const cellAngles: [number, number, number] = [
    view.getFloat32(52, isLittleEndian),
    view.getFloat32(56, isLittleEndian),
    view.getFloat32(60, isLittleEndian),
  ];

  const mapc = view.getInt32(64, isLittleEndian);
  const mapr = view.getInt32(68, isLittleEndian);
  const maps = view.getInt32(72, isLittleEndian);

  const dmin = view.getFloat32(76, isLittleEndian);
  const dmax = view.getFloat32(80, isLittleEndian);
  const dmean = view.getFloat32(84, isLittleEndian);
  const ispg = view.getInt32(88, isLittleEndian);
  const nsymbt = view.getInt32(92, isLittleEndian);
  const rms = view.getFloat32(216, isLittleEndian);

  let pixelSize = 1.0;
  if (mx > 0 && cellA[0] > 0) {
    pixelSize = cellA[0] / mx;
  }

  const headerOffset = 1024 + nsymbt;
  const sliceSize = nx * ny;

  // Read data into Float32Array slices
  const slices: Float32Array[] = [];

  let bytesPerVoxel = 4;
  if (mode === 0) bytesPerVoxel = 1;
  else if (mode === 1 || mode === 6) bytesPerVoxel = 2;
  else if (mode === 2) bytesPerVoxel = 4;

  const availableBytes = buffer.byteLength;
  const readableNz = Math.min(nz, Math.floor((availableBytes - headerOffset) / (sliceSize * bytesPerVoxel)));

  if (readableNz <= 0) {
    throw new Error('MRC file has insufficient data bytes for header specifications.');
  }

  for (let z = 0; z < readableNz; z++) {
    const slice = new Float32Array(sliceSize);
    const sliceByteOffset = headerOffset + z * sliceSize * bytesPerVoxel;

    if (mode === 2) {
      // Float32
      const floatView = new Float32Array(buffer, sliceByteOffset, sliceSize);
      slice.set(floatView);
    } else if (mode === 0) {
      // Signed / unsigned int8
      const int8View = new Int8Array(buffer, sliceByteOffset, sliceSize);
      for (let i = 0; i < sliceSize; i++) slice[i] = int8View[i]!;
    } else if (mode === 1) {
      // Int16
      const int16View = new Int16Array(buffer, sliceByteOffset, sliceSize);
      for (let i = 0; i < sliceSize; i++) slice[i] = int16View[i]!;
    } else if (mode === 6) {
      // Uint16
      const uint16View = new Uint16Array(buffer, sliceByteOffset, sliceSize);
      for (let i = 0; i < sliceSize; i++) slice[i] = uint16View[i]!;
    } else {
      throw new Error(`Unsupported MRC mode: ${mode}`);
    }

    slices.push(slice);
  }

  const is3DVolume = readableNz > 1 && (readableNz === nx || readableNz === ny || (readableNz >= 16 && nx >= 16 && ny >= 16 && Math.abs(nx - readableNz) < nx * 0.5));

  const header: MrcHeader = {
    nx,
    ny,
    nz: readableNz,
    mode,
    nxstart,
    nystart,
    nzstart,
    mx,
    my,
    mz,
    cellA,
    cellAngles,
    mapc,
    mapr,
    maps,
    dmin,
    dmax,
    dmean,
    ispg,
    nsymbt,
    rms,
    pixelSize,
    is3DVolume,
  };

  const getOrthoslice = (axis: 'xy' | 'xz' | 'yz', index: number): { width: number; height: number; data: Float32Array } => {
    if (axis === 'xy') {
      const z = Math.max(0, Math.min(readableNz - 1, Math.floor(index)));
      return { width: nx, height: ny, data: slices[z]! };
    }
    if (axis === 'xz') {
      // Y is fixed at index, X varies, Z varies
      const y = Math.max(0, Math.min(ny - 1, Math.floor(index)));
      const data = new Float32Array(nx * readableNz);
      for (let z = 0; z < readableNz; z++) {
        const slice = slices[z]!;
        const zOffset = z * nx;
        const sliceYOffset = y * nx;
        for (let x = 0; x < nx; x++) {
          data[zOffset + x] = slice[sliceYOffset + x]!;
        }
      }
      return { width: nx, height: readableNz, data };
    }
    // 'yz': X is fixed at index, Y varies, Z varies
    const x = Math.max(0, Math.min(nx - 1, Math.floor(index)));
    const data = new Float32Array(ny * readableNz);
    for (let z = 0; z < readableNz; z++) {
      const slice = slices[z]!;
      const zOffset = z * ny;
      for (let y = 0; y < ny; y++) {
        data[zOffset + y] = slice[y * nx + x]!;
      }
    }
    return { width: ny, height: readableNz, data };
  };

  return {
    header,
    slices,
    getOrthoslice,
  };
}

/**
 * Creates synthetic Cryo-EM 2D class averages for demo / immediate testing
 * representing characteristic macromolecular projections (e.g. ribosome / proteasome / GroEL).
 */
export function generateDemoClasses(count = 12, size = 64): MrcData {
  const slices: Float32Array[] = [];

  for (let c = 0; c < count; c++) {
    const data = new Float32Array(size * size);
    const center = size / 2;
    const angle = (c * Math.PI) / count;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        // Rotated coordinates
        const rx = dx * cosA + dy * sinA;
        const ry = -dx * sinA + dy * cosA;

        // Base multi-domain particle density
        let d = 0;
        // Large subunit
        const distL = Math.hypot(rx + 4, ry);
        if (distL < 18) {
          d += Math.cos((distL / 18) * (Math.PI / 2)) * 1.5;
        }
        // Small subunit
        const distS = Math.hypot(rx - 12, ry - 3);
        if (distS < 11) {
          d += Math.cos((distS / 11) * (Math.PI / 2)) * 1.2;
        }
        // Internal structural RNA/protein density variations
        const ripple = Math.sin(rx * 0.8) * Math.cos(ry * 0.8) * 0.25;
        if (d > 0.1) d += ripple;

        // Realistic high-frequency noise
        const noise = (Math.random() - 0.5) * 0.18;
        d += noise;

        data[y * size + x] = Math.max(0, d);
      }
    }
    slices.push(data);
  }

  const header: MrcHeader = {
    nx: size,
    ny: size,
    nz: count,
    mode: 2,
    nxstart: 0,
    nystart: 0,
    nzstart: 0,
    mx: size,
    my: size,
    mz: count,
    cellA: [size * 1.05, size * 1.05, count * 1.05],
    cellAngles: [90, 90, 90],
    mapc: 1,
    mapr: 2,
    maps: 3,
    dmin: 0,
    dmax: 2.0,
    dmean: 0.35,
    ispg: 1,
    nsymbt: 0,
    rms: 0.45,
    pixelSize: 1.05,
    is3DVolume: false,
  };

  return {
    header,
    slices,
    getOrthoslice: (axis, idx) => ({ width: size, height: size, data: slices[Math.min(count - 1, Math.max(0, idx))]! }),
  };
}

/**
 * Creates synthetic 3D density volume for demo orthoslice scrubbing.
 */
export function generateDemo3DVolume(size = 48): MrcData {
  const slices: Float32Array[] = [];
  const center = size / 2;

  for (let z = 0; z < size; z++) {
    const data = new Float32Array(size * size);
    const dz = z - center;

    for (let y = 0; y < size; y++) {
      const dy = y - center;
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        // 3D ellipsoid shell with internal core (e.g. viral capsid or ferritin)
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let density = 0;
        // Outer shell
        if (r >= 14 && r <= 21) {
          density = Math.sin(((r - 14) / 7) * Math.PI) * 1.8;
          // Subunit channels
          const mod = Math.cos(dx * 0.7) * Math.cos(dy * 0.7) * Math.cos(dz * 0.7);
          density += mod * 0.3;
        } else if (r < 7) {
          // Inner core
          density = (1 - r / 7) * 1.2;
        }

        const noise = (Math.random() - 0.5) * 0.12;
        data[y * size + x] = Math.max(0, density + noise);
      }
    }
    slices.push(data);
  }

  const header: MrcHeader = {
    nx: size,
    ny: size,
    nz: size,
    mode: 2,
    nxstart: 0,
    nystart: 0,
    nzstart: 0,
    mx: size,
    my: size,
    mz: size,
    cellA: [size * 1.2, size * 1.2, size * 1.2],
    cellAngles: [90, 90, 90],
    mapc: 1,
    mapr: 2,
    maps: 3,
    dmin: 0,
    dmax: 2.2,
    dmean: 0.25,
    ispg: 1,
    nsymbt: 0,
    rms: 0.5,
    pixelSize: 1.2,
    is3DVolume: true,
  };

  const getOrthoslice = (axis: 'xy' | 'xz' | 'yz', index: number): { width: number; height: number; data: Float32Array } => {
    if (axis === 'xy') {
      const z = Math.max(0, Math.min(size - 1, Math.floor(index)));
      return { width: size, height: size, data: slices[z]! };
    }
    if (axis === 'xz') {
      const y = Math.max(0, Math.min(size - 1, Math.floor(index)));
      const data = new Float32Array(size * size);
      for (let z = 0; z < size; z++) {
        const slice = slices[z]!;
        for (let x = 0; x < size; x++) {
          data[z * size + x] = slice[y * size + x]!;
        }
      }
      return { width: size, height: size, data };
    }
    const x = Math.max(0, Math.min(size - 1, Math.floor(index)));
    const data = new Float32Array(size * size);
    for (let z = 0; z < size; z++) {
      const slice = slices[z]!;
      for (let y = 0; y < size; y++) {
        data[z * size + y] = slice[y * size + x]!;
      }
    }
    return { width: size, height: size, data };
  };

  return {
    header,
    slices,
    getOrthoslice,
  };
}

/**
 * Normalizes and renders a Float32 slice into a Canvas 2D context
 * with contrast/brightness adjustments and optional contrast inversion.
 */
export function renderSliceToCanvas(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  width: number,
  height: number,
  options: {
    blackLevel?: number; // 0 to 1
    whiteLevel?: number; // 0 to 1
    invert?: boolean;
    gamma?: number;
  } = {}
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const {
    blackLevel = 0.05,
    whiteLevel = 0.95,
    invert = false,
    gamma = 1.0,
  } = options;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (min === max) {
    max = min + 1;
  }

  const range = max - min;
  const bVal = min + blackLevel * range;
  const wVal = min + whiteLevel * range;
  const effectiveRange = Math.max(1e-6, wVal - bVal);

  const imgData = ctx.createImageData(width, height);
  const buf = imgData.data;

  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    let norm = (v - bVal) / effectiveRange;
    norm = Math.max(0, Math.min(1, norm));

    if (gamma !== 1.0 && norm > 0) {
      norm = Math.pow(norm, 1 / gamma);
    }

    let gray = Math.round(norm * 255);
    if (invert) {
      gray = 255 - gray;
    }

    const idx = i * 4;
    buf[idx] = gray;
    buf[idx + 1] = gray;
    buf[idx + 2] = gray;
    buf[idx + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
}
