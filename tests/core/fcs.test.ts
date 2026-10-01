import { describe, it, expect } from 'vitest';
import { parseFcs, parseTextSegment, invertMatrix, FcsError } from '@/core/flow';
import { buildFcs, type BuildParam } from './fcs-builder';

const events = [[10, 200, 3000], [11, 201, 3001], [12, 202, 3002], [65535, 0, 7]];
const params = [{ name: 'FSC-A', label: 'size' }, { name: 'SSC-A' }, { name: 'FL1-A', label: 'CD4' }];
const cols = (d: ReturnType<typeof parseFcs>) => d.columns.map(c => Array.from(c));
const expected = (ev: number[][]) => params.map((_, p) => ev.map(e => e[p]!));

describe('FCS parser round trips', () => {
  for (const le of [true, false]) {
    it(`16-bit integers, ${le ? 'little' : 'big'} endian`, () => {
      const d = parseFcs(buildFcs({ datatype: 'I', littleEndian: le, params, events }));
      expect(d.eventCount).toBe(4);
      expect(d.parameters.map(p => p.name)).toEqual(['FSC-A', 'SSC-A', 'FL1-A']);
      expect(d.parameters[0]!.label).toBe('size');
      expect(cols(d)).toEqual(expected(events));
      expect(d.columns[0]).toBeInstanceOf(Float32Array);
    });
    it(`float32 and float64, ${le ? 'little' : 'big'} endian`, () => {
      const ev = [[0.5, -1.25, 1024.75], [3, 4, 5.5]];
      for (const datatype of ['F', 'D'] as const) {
        const d = parseFcs(buildFcs({ datatype, littleEndian: le, params, events: ev }));
        expect(cols(d)).toEqual(expected(ev));
      }
    });
  }

  it('reads mixed 8/16/32/64-bit integer parameters', () => {
    const ps = [{ name: 'a', bits: 8, range: 256 }, { name: 'b', bits: 16 }, { name: 'c', bits: 32, range: 4294967296 }, { name: 'd', bits: 64, range: 1e12 }];
    const ev = [[1, 2, 3, 4], [255, 65535, 4000000000, 123456]];
    const d = parseFcs(buildFcs({ datatype: 'I', params: ps, events: ev }));
    expect(d.columns.map(c => c[1])).toEqual([255, 65535, 4000000000, 123456]);
  });

  it('masks integers to the $PnR range', () => {
    const d = parseFcs(buildFcs({ datatype: 'I', params: [{ name: 'x', range: 1024 }], events: [[1500], [1023]] }));
    expect(Array.from(d.columns[0]!)).toEqual([1500 & 1023, 1023]);
  });

  it('reads ASCII data', () => {
    const ev = [[1, 22, 333], [4, 55, 666]];
    const d = parseFcs(buildFcs({ datatype: 'A', params, events: ev, asciiWidth: 6 }));
    expect(cols(d)).toEqual(expected(ev));
  });

  it('reads FCS 2.0 and 3.0 headers', () => {
    for (const version of ['FCS2.0', 'FCS3.0']) {
      expect(parseFcs(buildFcs({ datatype: 'I', params, events, version })).version).toBe(version);
    }
  });

  it('reads DATA offsets from $BEGINDATA/$ENDDATA when the header holds 0', () => {
    const d = parseFcs(buildFcs({ datatype: 'F', params, events: [[1, 2, 3]], zeroHeaderData: true }));
    expect(cols(d)).toEqual([[1], [2], [3]]);
  });

  it('honours escaped (doubled) delimiters and other delimiter characters', () => {
    const a = parseFcs(buildFcs({ datatype: 'I', params, events, extra: { $FIL: 'a/b/c.fcs', $CYT: 'Cytek|X' } }));
    expect(a.meta.fileName).toBe('a/b/c.fcs');
    const b = parseFcs(buildFcs({ datatype: 'I', params, events, delimiter: '|', extra: { $FIL: 'x|y.fcs', $CYT: 'Aurora', $DATE: '30-SEP-2026', $BTIM: '10:00:00', $ETIM: '10:05:00' } }));
    expect(b.meta).toMatchObject({ fileName: 'x|y.fcs', cytometer: 'Aurora', date: '30-SEP-2026', beginTime: '10:00:00', endTime: '10:05:00' });
    expect(parseTextSegment('/$A/1//2/$B/z/')).toEqual({ $A: '1/2', $B: 'z' });
  });

  it('applies $PnE log amplification and $PnG gain', () => {
    const ps: BuildParam[] = [
      { name: 'L', range: 1024, extra: { E: '4,1' } },
      { name: 'G', range: 1024, extra: { G: '2' } },
      { name: 'Time', range: 1024, extra: { G: '2' } },
    ];
    // buildFcs writes $PnE as 0,0 first; the later keyword wins in the parser
    const d = parseFcs(buildFcs({ datatype: 'I', params: ps, events: [[512, 100, 100]] }));
    expect(d.columns[0]![0]).toBeCloseTo(10 ** ((4 * 512) / 1024), 3);
    expect(d.columns[1]![0]).toBe(50);
    expect(d.columns[2]![0]).toBe(100); // Time is never divided by gain
    const raw = parseFcs(buildFcs({ datatype: 'I', params: ps, events: [[512, 100, 100]] }), { scaleValues: false });
    expect(raw.columns[0]![0]).toBe(512);
  });
});

describe('FCS compensation', () => {
  const ps = [{ name: 'FL1-A' }, { name: 'FL2-A' }, { name: 'FSC-A' }];
  const S = [[1, 0.1], [0.2, 1]];
  const truth = [[1000, 2000], [500, 100], [0, 4000]];
  // observed = true x S
  const observed = truth.map(([t1, t2]) => [t1! * S[0]![0]! + t2! * S[1]![0]!, t1! * S[0]![1]! + t2! * S[1]![1]!]);
  const ev = observed.map((o, i) => [Math.round(o[0]!), Math.round(o[1]!), 10 + i]);
  const spill = `2,FL1-A,FL2-A,${S[0]!.join(',')},${S[1]!.join(',')}`;

  it('parses and applies event vector x inverse(spillover)', () => {
    const d = parseFcs(buildFcs({ datatype: 'F', params: ps, events: ev, extra: { $SPILLOVER: spill } }));
    expect(d.compensation).toMatchObject({ source: '$SPILLOVER', names: ['FL1-A', 'FL2-A'], matrix: S });
    expect(d.compensationApplied).toBe(true);
    truth.forEach((t, i) => {
      expect(d.columns[0]![i]).toBeCloseTo(t[0]!, 0);
      expect(d.columns[1]![i]).toBeCloseTo(t[1]!, 0);
      expect(d.columns[2]![i]).toBe(10 + i);
    });
  });

  it('leaves values alone when compensation is turned off but still exposes the matrix', () => {
    const d = parseFcs(buildFcs({ datatype: 'F', params: ps, events: ev, extra: { $SPILLOVER: spill } }), { compensate: false });
    expect(d.compensationApplied).toBe(false);
    expect(d.compensation).not.toBeNull();
    expect(Array.from(d.columns[0]!)).toEqual(ev.map(e => e[0]));
  });

  it('reads $SPILL and $COMP (first n parameters)', () => {
    const a = parseFcs(buildFcs({ datatype: 'F', params: ps, events: ev, extra: { $SPILL: spill } }));
    expect(a.compensation!.source).toBe('$SPILL');
    const b = parseFcs(buildFcs({ datatype: 'F', params: ps, events: ev, extra: { $COMP: '2,1,0.1,0.2,1' } }));
    expect(b.compensation).toMatchObject({ source: '$COMP', names: ['FL1-A', 'FL2-A'] });
    expect(b.columns[0]![0]).toBeCloseTo(1000, 0);
  });

  it('inverts matrices robustly and rejects singular ones', () => {
    expect(invertMatrix([[0, 1], [1, 0]])).toEqual([[0, 1], [1, 0]]); // needs pivoting
    const m = [[2, 1, 0], [1, 3, 1], [0, 1, 4]];
    const mi = invertMatrix(m);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const s = [0, 1, 2].reduce((a, k) => a + m[i]![k]! * mi[k]![j]!, 0);
      expect(s).toBeCloseTo(i === j ? 1 : 0, 10);
    }
    expect(() => invertMatrix([[1, 2], [2, 4]])).toThrow(FcsError);
  });

  it('errors clearly when the matrix names a missing parameter', () => {
    expect(() => parseFcs(buildFcs({ datatype: 'F', params: ps, events: ev, extra: { $SPILLOVER: '2,FL1-A,FL9-A,1,0,0,1' } }))).toThrow(/FL9-A/);
  });
});

describe('FCS errors', () => {
  it('rejects a truncated file', () => {
    const full = buildFcs({ datatype: 'I', params, events });
    expect(() => parseFcs(full.slice(0, full.length - 5))).toThrow(/truncated/);
    expect(() => parseFcs(full.slice(0, 80))).toThrow(/truncated/);
  });
  it('rejects a wrong $DATATYPE and unsupported modes', () => {
    expect(() => parseFcs(buildFcs({ datatype: 'I', params, events, extra: { $DATATYPE: 'X' } }))).toThrow(/DATATYPE/);
    expect(() => parseFcs(buildFcs({ datatype: 'I', params, events, extra: { $MODE: 'C' } }))).toThrow(/list-mode/);
    expect(() => parseFcs(buildFcs({ datatype: 'F', params: [{ name: 'a' }], events: [[1]], extra: { $P1B: '16' } }))).toThrow(/requires/);
    expect(() => parseFcs(buildFcs({ datatype: 'I', params, events, extra: { $BYTEORD: '3,4,1,2' } }))).toThrow(/BYTEORD/);
    expect(() => parseFcs(buildFcs({ datatype: 'I', params: [{ name: 'a', bits: 16 }], events: [[1]], extra: { $P1B: '12' } }))).toThrow(/8, 16, 32 or 64/);
  });
  it('rejects non-FCS input', () => {
    expect(() => parseFcs(new Uint8Array(100))).toThrow(/Not an FCS/);
    expect(() => parseFcs(new Uint8Array(10))).toThrow(/too small/);
  });
});
