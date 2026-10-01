/* Builds spec-compliant FCS byte buffers from known events, for round-trip tests. */

export interface BuildParam { name: string; bits?: number; range?: number; label?: string; extra?: Record<string, string> }
export interface BuildOptions {
  datatype: 'I' | 'F' | 'D' | 'A';
  littleEndian?: boolean;
  version?: string;
  delimiter?: string;
  params: BuildParam[];
  /** events[e][p] */
  events: number[][];
  extra?: Record<string, string>;
  /** Put 0 in the header's data offsets and give them in $BEGINDATA/$ENDDATA. */
  zeroHeaderData?: boolean;
  /** Fixed-width ASCII field width. */
  asciiWidth?: number;
}

const pad8 = (n: number) => String(n).padStart(8, ' ');

function dataBytes(o: BuildOptions): Uint8Array {
  const { datatype, events, params } = o;
  const le = o.littleEndian ?? true;
  if (datatype === 'A') {
    const w = o.asciiWidth ?? 8;
    const s = events.map(ev => ev.map(v => String(v).padStart(w, ' ')).join('')).join('');
    return new TextEncoder().encode(s);
  }
  const widths = params.map(p => (datatype === 'F' ? 4 : datatype === 'D' ? 8 : (p.bits ?? 16) / 8));
  const size = widths.reduce((a, b) => a + b, 0);
  const buf = new Uint8Array(size * events.length);
  const dv = new DataView(buf.buffer);
  events.forEach((ev, e) => {
    let off = e * size;
    ev.forEach((v, p) => {
      const bits = params[p]!.bits ?? 16;
      if (datatype === 'F') dv.setFloat32(off, v, le);
      else if (datatype === 'D') dv.setFloat64(off, v, le);
      else if (bits === 8) dv.setUint8(off, v);
      else if (bits === 16) dv.setUint16(off, v, le);
      else if (bits === 32) dv.setUint32(off, v, le);
      else dv.setBigUint64(off, BigInt(v), le);
      off += widths[p]!;
    });
  });
  return buf;
}

export function buildFcs(o: BuildOptions): Uint8Array {
  const d = o.delimiter ?? '/';
  const version = o.version ?? 'FCS3.1';
  const le = o.littleEndian ?? true;
  const bytesPerParam = (p: BuildParam) => (o.datatype === 'F' ? 32 : o.datatype === 'D' ? 64 : o.datatype === 'A' ? (o.asciiWidth ?? 8) : p.bits ?? 16);
  const kw: [string, string][] = [
    ['$BYTEORD', o.datatype === 'A' ? '1,2,3,4' : le ? '1,2,3,4' : '4,3,2,1'],
    ['$DATATYPE', o.datatype],
    ['$MODE', 'L'],
    ['$NEXTDATA', '0'],
    ['$PAR', String(o.params.length)],
    ['$TOT', String(o.events.length)],
  ];
  o.params.forEach((p, i) => {
    const n = i + 1;
    kw.push([`$P${n}B`, String(bytesPerParam(p))], [`$P${n}N`, p.name], [`$P${n}R`, String(p.range ?? 262144)], [`$P${n}E`, '0,0']);
    if (p.label) kw.push([`$P${n}S`, p.label]);
    for (const [k, v] of Object.entries(p.extra ?? {})) kw.push([`$P${n}${k}`, v]);
  });
  for (const [k, v] of Object.entries(o.extra ?? {})) kw.push([k, v]);
  const esc = (s: string) => s.split(d).join(d + d);
  const data = dataBytes(o);

  const textFor = (bd: number, ed: number) => {
    const all = o.zeroHeaderData ? [...kw, ['$BEGINDATA', String(bd).padStart(12, '0')], ['$ENDDATA', String(ed).padStart(12, '0')]] as [string, string][] : kw;
    return d + all.map(([k, v]) => `${esc(k)}${d}${esc(v)}`).join(d) + d;
  };
  const textStart = 58;
  let textLen = textFor(0, 0).length;
  const dataStart = textStart + textLen;
  const dataEnd = dataStart + data.length - 1;
  const text = textFor(dataStart, dataEnd);
  textLen = text.length;
  const header = `${version}    ${pad8(textStart)}${pad8(textStart + textLen - 1)}${o.zeroHeaderData ? pad8(0) + pad8(0) : pad8(dataStart) + pad8(dataEnd)}${pad8(0)}${pad8(0)}`;
  const out = new Uint8Array(textStart + textLen + data.length);
  out.set(new TextEncoder().encode(header.padEnd(58, ' ')), 0);
  out.set(new TextEncoder().encode(text), textStart);
  out.set(data, textStart + textLen);
  return out;
}
