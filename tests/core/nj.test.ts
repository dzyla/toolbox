import { describe, it, expect } from 'vitest';
import {
  neighborJoining, midpointRoot, toNewick, newickLabel, pathLengthMatrix, layoutPhylogram,
  type UnrootedTree, type TreeNode,
} from '@/core/msa/nj';

/** Minimal Newick parser (quoted labels, branch lengths) used to round-trip the writer. */
function parseNewick(s: string): TreeNode {
  let i = 0;
  const label = (): string | undefined => {
    if (s[i] === "'") {
      let out = ''; i++;
      for (;;) {
        if (s[i] === "'" && s[i + 1] === "'") { out += "'"; i += 2; } else if (s[i] === "'") { i++; break; } else out += s[i++];
      }
      return out;
    }
    let out = '';
    while (i < s.length && !'(),:;'.includes(s[i]!)) out += s[i++];
    return out === '' ? undefined : out;
  };
  const node = (): TreeNode => {
    const children: TreeNode[] = [];
    if (s[i] === '(') {
      i++;
      children.push(node());
      while (s[i] === ',') { i++; children.push(node()); }
      expect(s[i]).toBe(')'); i++;
    }
    const name = label();
    let length = 0;
    if (s[i] === ':') { i++; let t = ''; while (/[0-9.eE+-]/.test(s[i] ?? '')) t += s[i++]; length = Number(t); }
    return { name, length, children };
  };
  const r = node();
  expect(s[i]).toBe(';');
  return r;
}

function leafDistances(root: TreeNode): Map<string, Map<string, number>> {
  const leaves: { name: string; path: TreeNode[] }[] = [];
  const rec = (n: TreeNode, path: TreeNode[]) => {
    const p = [...path, n];
    if (!n.children.length) leaves.push({ name: n.name!, path: p }); else n.children.forEach(c => rec(c, p));
  };
  rec(root, []);
  const out = new Map<string, Map<string, number>>();
  for (const a of leaves) {
    const m = new Map<string, number>();
    for (const b of leaves) {
      let k = 0;
      while (k < a.path.length && k < b.path.length && a.path[k] === b.path[k]) k++;
      const sum = (p: TreeNode[]) => p.slice(k).reduce((t, x) => t + x.length, 0);
      m.set(b.name, sum(a.path) + sum(b.path));
    }
    out.set(a.name, m);
  }
  return out;
}

const WIKI = [[0, 5, 9, 9, 8], [5, 0, 10, 10, 9], [9, 10, 0, 8, 7], [9, 10, 8, 0, 3], [8, 9, 7, 3, 0]];
const WIKI_NAMES = ['a', 'b', 'c', 'd', 'e'];

describe('neighbour joining', () => {
  it('reproduces the Saitou & Nei / Wikipedia 5-taxon example exactly', () => {
    const { tree, clipped } = neighborJoining(WIKI_NAMES, WIKI);
    expect(clipped).toBe(0);
    const leafLen = new Map<string, number>();
    const internal: number[] = [];
    for (const e of tree.edges) {
      const leaf = e.a < tree.leafCount ? e.a : e.b < tree.leafCount ? e.b : -1;
      if (leaf >= 0) leafLen.set(tree.names[leaf]!, e.length); else internal.push(e.length);
    }
    expect(Object.fromEntries(leafLen)).toEqual({ a: 2, b: 3, c: 4, d: 2, e: 1 });
    expect(tree.edges.length).toBe(7);
    expect(internal.sort()).toEqual([2, 3]);
    const pm = pathLengthMatrix(tree);
    WIKI.forEach((row, i) => row.forEach((v, j) => expect(pm[i]![j]).toBeCloseTo(v, 9)));
  });

  it('reconstructs an additive random tree exactly from its path-length matrix', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let trial = 0; trial < 20; trial++) {
      const n = 4 + Math.floor(rnd() * 8);
      const names: (string | undefined)[] = ['t0', 't1', 't2', undefined];
      const edges: { a: number; b: number; length: number }[] = [];
      for (let i = 0; i < 3; i++) edges.push({ a: i, b: 3, length: 0.5 + rnd() });
      let nextLeaf = 3;
      while (nextLeaf < n) {
        const ei = Math.floor(rnd() * edges.length);
        const e = edges[ei]!;
        const mid = names.length; names.push(undefined);
        const leaf = names.length; names.push(`t${nextLeaf++}`);
        const f = 0.2 + 0.6 * rnd();
        edges.splice(ei, 1,
          { a: e.a, b: mid, length: e.length * f },
          { a: mid, b: e.b, length: e.length * (1 - f) },
          { a: mid, b: leaf, length: 0.5 + rnd() });
      }
      // remap so that leaves are ids 0..n-1 in name order
      const ids = names.map((nm, id) => ({ nm, id }));
      const leafIds = ids.filter(x => x.nm !== undefined).sort((x, y) => Number(x.nm!.slice(1)) - Number(y.nm!.slice(1)));
      const innerIds = ids.filter(x => x.nm === undefined);
      const map = new Map<number, number>();
      [...leafIds, ...innerIds].forEach((x, k) => map.set(x.id, k));
      const truth: UnrootedTree = {
        names: [...leafIds, ...innerIds].map(x => x.nm), leafCount: n,
        edges: edges.map(e => ({ a: map.get(e.a)!, b: map.get(e.b)!, length: e.length })),
      };
      const D = pathLengthMatrix(truth);
      const { tree, clipped } = neighborJoining(truth.names.slice(0, n) as string[], D);
      expect(clipped).toBe(0);
      const R = pathLengthMatrix(tree);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expect(R[i]![j]).toBeCloseTo(D[i]![j]!, 8);
      const total = (t: UnrootedTree) => t.edges.reduce((s, e) => s + e.length, 0);
      expect(total(tree)).toBeCloseTo(total(truth), 8);
    }
  });

  it('handles n=2 and n=3', () => {
    const two = neighborJoining(['x', 'y'], [[0, 0.4], [0.4, 0]]);
    expect(two.tree.edges).toEqual([{ a: 0, b: 1, length: 0.4 }]);
    expect(toNewick(midpointRoot(two.tree))).toBe('(x:0.2,y:0.2);');
    const three = neighborJoining(['x', 'y', 'z'], [[0, 3, 4], [3, 0, 5], [4, 5, 0]]);
    const byLeaf = Object.fromEntries(three.tree.edges.map(e => [three.tree.names[e.a], e.length]));
    expect(byLeaf).toEqual({ x: 1, y: 2, z: 3 });
    const root = midpointRoot(three.tree);
    const parsed = leafDistances(parseNewick(toNewick(root)));
    expect(parsed.get('y')!.get('z')).toBeCloseTo(5, 9);
    expect(parsed.get('x')!.get('z')).toBeCloseTo(4, 9);
    // root is 2.5 from both y and z (the longest path)
    const { nodes } = layoutPhylogram(root);
    for (const nd of nodes) if (nd.node.name === 'y' || nd.node.name === 'z') expect(nd.x).toBeCloseTo(2.5, 9);
  });

  it('clips negative branch lengths to 0 and reports them', () => {
    const r = neighborJoining(['a', 'b', 'c'], [[0, 1, 5], [1, 0, 1], [5, 1, 0]]);
    expect(r.clipped).toBeGreaterThan(0);
    expect(r.notes[0]).toMatch(/negative/);
    expect(r.tree.edges.every(e => e.length >= 0)).toBe(true);
  });

  it('is deterministic on tied distances', () => {
    const D = [[0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0]];
    const a = toNewick(midpointRoot(neighborJoining(['a', 'b', 'c', 'd'], D).tree));
    const b = toNewick(midpointRoot(neighborJoining(['a', 'b', 'c', 'd'], D).tree));
    expect(a).toBe(b);
  });
});

describe('midpoint rooting and Newick', () => {
  it('midpoint root keeps all path lengths and sits halfway along the diameter', () => {
    const { tree } = neighborJoining(WIKI_NAMES, WIKI);
    const root = midpointRoot(tree);
    expect(root.children.length).toBe(2);
    const d = leafDistances(root);
    WIKI.forEach((row, i) => row.forEach((v, j) => expect(d.get(WIKI_NAMES[i]!)!.get(WIKI_NAMES[j]!)).toBeCloseTo(v, 9)));
    const { nodes } = layoutPhylogram(root);
    const depths = nodes.filter(n => !n.node.children.length).map(n => n.x);
    expect(Math.max(...depths)).toBeCloseTo(5, 9); // diameter 10 (b-c, b-d) -> farthest leaf 5 from root
  });

  it('quotes labels and round-trips through a parser', () => {
    expect(newickLabel('plain_name')).toBe('plain_name');
    expect(newickLabel('Homo sapiens')).toBe("'Homo sapiens'");
    expect(newickLabel("it's (odd)")).toBe("'it''s (odd)'");
    const names = ['Seq A (human)', 'B:2', "O'Neil", 'plain'];
    const D = [[0, .1, .3, .4], [.1, 0, .35, .45], [.3, .35, 0, .2], [.4, .45, .2, 0]];
    const nw = toNewick(midpointRoot(neighborJoining(names, D).tree));
    const parsed = leafDistances(parseNewick(nw));
    expect([...parsed.keys()].sort()).toEqual([...names].sort());
    names.forEach((a, i) => names.forEach((b, j) => expect(parsed.get(a)!.get(b)).toBeCloseTo(D[i]![j]!, 5)));
    expect(nw.endsWith(';')).toBe(true);
  });

  it('writes branch lengths without trailing zeros', () => {
    expect(toNewick({ length: 0, children: [{ name: 'a', length: 0.5, children: [] }, { name: 'b', length: 1 / 3, children: [] }] }))
      .toBe('(a:0.5,b:0.333333);');
  });
});
