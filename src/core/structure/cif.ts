/**
 * Minimal CIF 1.1 / mmCIF tokenizer. Single pass over the string with index scanning;
 * loop values live in one flat array per category (stride = number of fields).
 * `?` and `.` (unquoted) come back as undefined. Category names keep their leading
 * underscore (`_atom_site`); field names do not (`Cartn_x`).
 */

export interface CifCategory {
  name: string;
  fields: string[];
  rowCount: number;
  get(field: string, row: number): string | undefined;
}

export interface CifBlock { name: string; categories: Map<string, CifCategory> }

type Value = string | undefined;

class Category implements CifCategory {
  fields: string[];
  rowCount: number;
  data: Value[];
  private index = new Map<string, number>();
  constructor(public name: string, fields: string[], data: Value[], rowCount: number) {
    this.fields = fields;
    this.data = data;
    this.rowCount = rowCount;
    fields.forEach((f, i) => { if (!this.index.has(f)) this.index.set(f, i); });
  }
  /** Key-value pairs of one category are a single row; append another field. */
  addField(field: string, value: Value): void {
    this.index.set(field, this.fields.length);
    this.fields.push(field);
    this.data.push(value);
  }
  get(field: string, row: number): string | undefined {
    const i = this.index.get(field);
    if (i === undefined || row < 0 || row >= this.rowCount) return undefined;
    return this.data[row * this.fields.length + i];
  }
}

const enum T { EOF, VALUE, TAG, DATA, LOOP, OTHER }

const isWs = (c: number) => c === 32 || c === 10 || c === 9 || c === 13;

export function parseCifBlocks(input: string): CifBlock[] {
  const text = input.indexOf('\r') >= 0 ? input.replace(/\r\n?/g, '\n') : input;
  const n = text.length;
  let pos = 0;
  let tokVal: Value = undefined; // value of the last VALUE token, text of the last TAG/DATA token
  let tokStr = '';
  let held: T | null = null;

  function scan(): T {
    // skip whitespace and comments
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (isWs(c)) pos++;
      else if (c === 35) { while (pos < n && text.charCodeAt(pos) !== 10) pos++; }
      else break;
    }
    if (pos >= n) return T.EOF;
    const c = text.charCodeAt(pos);

    if (c === 59 && (pos === 0 || text.charCodeAt(pos - 1) === 10)) { // ';' text field at line start
      const end = text.indexOf('\n;', pos);
      if (end < 0) { tokVal = text.slice(pos + 1); pos = n; }
      else { tokVal = text.slice(pos + 1, end); pos = end + 2; }
      return T.VALUE;
    }
    if (c === 39 || c === 34) { // quoted string; closes on quote followed by whitespace/EOF
      let i = pos + 1;
      while (i < n) {
        const d = text.charCodeAt(i);
        if (d === 10) break;
        if (d === c && (i + 1 >= n || isWs(text.charCodeAt(i + 1)))) break;
        i++;
      }
      tokVal = text.slice(pos + 1, i);
      pos = i < n && text.charCodeAt(i) === c ? i + 1 : i;
      return T.VALUE;
    }
    let i = pos + 1;
    while (i < n && !isWs(text.charCodeAt(i))) i++;
    const word = text.slice(pos, i);
    pos = i;
    if (c === 95) { tokStr = word; return T.TAG; } // '_'
    if (word.length === 1 && (c === 63 || c === 46)) { tokVal = undefined; return T.VALUE; } // ? .
    if (word.length >= 5) {
      const low = word.toLowerCase();
      if (low.startsWith('data_')) { tokStr = word.slice(5); return T.DATA; }
      if (low === 'loop_') return T.LOOP;
      if (low.startsWith('save_') || low === 'global_' || low === 'stop_') return T.OTHER;
    }
    tokVal = word;
    return T.VALUE;
  }

  const next = (): T => { if (held !== null) { const t = held; held = null; return t; } return scan(); };
  const hold = (t: T) => { held = t; };

  function split(tag: string): [string, string] {
    const dot = tag.indexOf('.');
    return dot < 0 ? [tag, ''] : [tag.slice(0, dot), tag.slice(dot + 1)];
  }

  const blocks: CifBlock[] = [];
  let block: CifBlock | null = null;

  for (let t = next(); t !== T.EOF; t = next()) {
    if (t === T.DATA) {
      block = { name: tokStr, categories: new Map() };
      blocks.push(block);
    } else if (t === T.TAG) {
      const [cat, field] = split(tokStr);
      const vt = next();
      if (vt !== T.VALUE) { hold(vt); continue; } // key without a value
      if (!block) continue;
      const existing = block.categories.get(cat) as Category | undefined;
      if (existing && existing.rowCount === 1) existing.addField(field, tokVal);
      else block.categories.set(cat, new Category(cat, [field], [tokVal], 1));
    } else if (t === T.LOOP) {
      const tags: string[] = [];
      let u = next();
      while (u === T.TAG) { tags.push(tokStr); u = next(); }
      const data: Value[] = [];
      while (u === T.VALUE) { data.push(tokVal); u = next(); }
      hold(u);
      if (!block || tags.length === 0) continue;
      const [cat] = split(tags[0]!);
      const rows = Math.floor(data.length / tags.length);
      if (rows * tags.length !== data.length) data.length = rows * tags.length;
      block.categories.set(cat, new Category(cat, tags.map((g) => split(g)[1]), data, rows));
    }
    // stray values and save_/global_/stop_ keywords are skipped
  }
  return blocks;
}
