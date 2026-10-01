/**
 * Neighbour-joining (Saitou & Nei 1987, Mol Biol Evol 4:406-425), midpoint rooting and Newick output.
 * Pure functions, no DOM. Input is a symmetric distance matrix (here: 1 - identity, a
 * substitutions-per-site-like fraction in 0..1 with no multiple-hit correction).
 */

export interface UnrootedTree {
  /** Node labels; internal nodes have name undefined. Leaves are nodes 0..n-1 in input order. */
  names: (string | undefined)[];
  edges: { a: number; b: number; length: number }[];
  leafCount: number;
}

export interface NjResult {
  tree: UnrootedTree;
  /** Human-readable notes (e.g. clipped negative branch lengths). */
  notes: string[];
  /** Number of branches whose negative estimate was clipped to 0. */
  clipped: number;
}

export interface TreeNode {
  name?: string;
  /** Length of the branch leading to this node from its parent (0 for the root). */
  length: number;
  children: TreeNode[];
}

const NEG_TOL = 1e-9;

/**
 * Neighbour-joining. Ties in Q are broken by the lowest (i, j) in the current active-node order,
 * so the result is deterministic. Negative branch lengths are clipped to 0 and counted.
 */
export function neighborJoining(names: string[], dist: number[][]): NjResult {
  const n = names.length;
  if (n < 2) throw new Error('Neighbour-joining needs at least 2 taxa');
  if (dist.length !== n || dist.some(r => r.length !== n)) throw new Error('Distance matrix must be n x n');
  const nodeNames: (string | undefined)[] = names.slice();
  const edges: UnrootedTree['edges'] = [];
  const notes: string[] = [];
  let clipped = 0;
  const addEdge = (a: number, b: number, raw: number) => {
    let length = raw;
    if (raw < -NEG_TOL) clipped++;
    if (raw < 0) length = 0;
    edges.push({ a, b, length });
  };

  // active node ids and working distance map keyed by id pair
  let active = names.map((_, i) => i);
  const d = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d.set(key(i, j), (dist[i]![j]! + dist[j]![i]!) / 2);
  const D = (a: number, b: number) => d.get(key(a, b))!;

  if (n === 2) {
    // Unrooted two-taxon tree: one edge.
    addEdge(0, 1, D(0, 1));
  }
  while (n > 2 && active.length > 3) {
    const r = active.length;
    const sums = new Map<number, number>();
    for (const i of active) {
      let s = 0;
      for (const k of active) if (k !== i) s += D(i, k);
      sums.set(i, s);
    }
    let best = Infinity, bi = -1, bj = -1;
    for (let x = 0; x < r; x++) for (let y = x + 1; y < r; y++) {
      const i = active[x]!, j = active[y]!;
      const q = (r - 2) * D(i, j) - sums.get(i)! - sums.get(j)!;
      if (q < best - 1e-12) { best = q; bi = i; bj = j; }
    }
    const dij = D(bi, bj);
    const li = dij / 2 + (sums.get(bi)! - sums.get(bj)!) / (2 * (r - 2));
    const lj = dij - li;
    const u = nodeNames.length;
    nodeNames.push(undefined);
    addEdge(bi, u, li);
    addEdge(bj, u, lj);
    for (const k of active) {
      if (k === bi || k === bj) continue;
      d.set(key(u, k), (D(bi, k) + D(bj, k) - dij) / 2);
    }
    active = active.filter(k => k !== bi && k !== bj);
    active.push(u);
  }
  if (n >= 3) {
    const [i, j, k] = active as [number, number, number];
    const c = nodeNames.length;
    nodeNames.push(undefined);
    addEdge(i, c, (D(i, j) + D(i, k) - D(j, k)) / 2);
    addEdge(j, c, (D(i, j) + D(j, k) - D(i, k)) / 2);
    addEdge(k, c, (D(i, k) + D(j, k) - D(i, j)) / 2);
  }
  if (clipped > 0) {
    notes.push(`${clipped} negative branch length${clipped > 1 ? 's were' : ' was'} set to 0 (the distances are not perfectly additive).`);
  }
  return { tree: { names: nodeNames, edges, leafCount: n }, notes, clipped };
}

function adjacency(tree: UnrootedTree): { to: number; len: number; edge: number }[][] {
  const adj: { to: number; len: number; edge: number }[][] = tree.names.map(() => []);
  tree.edges.forEach((e, idx) => {
    adj[e.a]!.push({ to: e.b, len: e.length, edge: idx });
    adj[e.b]!.push({ to: e.a, len: e.length, edge: idx });
  });
  return adj;
}

/** Leaf-to-leaf path-length matrix of an unrooted tree (for verification). */
export function pathLengthMatrix(tree: UnrootedTree): number[][] {
  const adj = adjacency(tree);
  const n = tree.leafCount;
  return Array.from({ length: n }, (_, s) => {
    const dist = new Array<number>(adj.length).fill(NaN);
    dist[s] = 0;
    const stack = [s];
    while (stack.length) {
      const v = stack.pop()!;
      for (const { to, len } of adj[v]!) if (Number.isNaN(dist[to]!)) { dist[to] = dist[v]! + len; stack.push(to); }
    }
    return dist.slice(0, n);
  });
}

/** Rooted representation of the tree with the root placed on edge `edgeIdx` at `t` from endpoint `a`. */
function rootOnEdge(tree: UnrootedTree, edgeIdx: number, t: number): TreeNode {
  const adj = adjacency(tree);
  const e = tree.edges[edgeIdx]!;
  const build = (v: number, from: number, len: number): TreeNode => ({
    name: tree.names[v],
    length: len,
    children: adj[v]!.filter(x => x.to !== from).map(x => build(x.to, v, x.len)),
  });
  const left = build(e.a, e.b, Math.max(0, t));
  const right = build(e.b, e.a, Math.max(0, e.length - t));
  return { length: 0, children: [left, right] };
}

/** Roots the tree at the midpoint of its longest leaf-to-leaf path (first such path in leaf order on ties). */
export function midpointRoot(tree: UnrootedTree): TreeNode {
  if (tree.edges.length === 1) return rootOnEdge(tree, 0, tree.edges[0]!.length / 2);
  const adj = adjacency(tree);
  const n = tree.leafCount;
  // Diameter over leaves via explicit search from each leaf (n is small).
  const search = (s: number) => {
    const dist = new Array<number>(adj.length).fill(NaN);
    const prev = new Array<number>(adj.length).fill(-1);
    const prevEdge = new Array<number>(adj.length).fill(-1);
    dist[s] = 0;
    const stack = [s];
    while (stack.length) {
      const v = stack.pop()!;
      for (const { to, len, edge } of adj[v]!) if (Number.isNaN(dist[to]!)) { dist[to] = dist[v]! + len; prev[to] = v; prevEdge[to] = edge; stack.push(to); }
    }
    return { dist, prev, prevEdge };
  };
  let bestD = -1, bs = 0, bt = 1;
  for (let s = 0; s < n; s++) {
    const { dist } = search(s);
    for (let t = s + 1; t < n; t++) if (dist[t]! > bestD + 1e-12) { bestD = dist[t]!; bs = s; bt = t; }
  }
  const { dist, prev, prevEdge } = search(bs);
  // Walk back from bt until we cross the midpoint.
  const half = bestD / 2;
  let v = bt;
  while (prev[v]! !== -1 && dist[prev[v]!]! > half) v = prev[v]!;
  const p = prev[v]!;
  const edgeIdx = prevEdge[v]!;
  const e = tree.edges[edgeIdx]!;
  // Offset of the root from endpoint e.a along the edge.
  const fromP = half - dist[p]!; // distance from p (nearer bs) towards v
  const t = e.a === p ? fromP : e.length - fromP;
  return rootOnEdge(tree, edgeIdx, Math.min(e.length, Math.max(0, t)));
}

const NEWICK_SPECIAL = /[\s()[\]':;,]/;

/** Quotes a Newick label when it contains whitespace or structural characters (Newick convention: '' escapes '). */
export function newickLabel(name: string): string {
  return NEWICK_SPECIAL.test(name) || name === '' ? `'${name.replace(/'/g, "''")}'` : name;
}

export function formatBranchLength(x: number): string {
  const v = Math.max(0, x);
  const s = v.toFixed(6).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

export function toNewick(root: TreeNode): string {
  const rec = (n: TreeNode, isRoot: boolean): string => {
    const inner = n.children.length ? `(${n.children.map(c => rec(c, false)).join(',')})` : '';
    const label = n.name !== undefined ? newickLabel(n.name) : '';
    return `${inner}${label}${isRoot ? '' : `:${formatBranchLength(n.length)}`}`;
  };
  return `${rec(root, true)};`;
}

export interface PhyloLayoutNode {
  node: TreeNode;
  x: number;       // cumulative branch length from root
  y: number;       // 0..leafCount-1
  parent: number;  // index into nodes, -1 for root
}

/** Rectangular phylogram layout: x = root distance, y = leaf slot (internal = mean of children). */
export function layoutPhylogram(root: TreeNode): { nodes: PhyloLayoutNode[]; maxX: number; leafCount: number } {
  const nodes: PhyloLayoutNode[] = [];
  let leaf = 0, maxX = 0;
  const rec = (n: TreeNode, x: number, parent: number): number => {
    const idx = nodes.length;
    nodes.push({ node: n, x, y: 0, parent });
    maxX = Math.max(maxX, x);
    if (!n.children.length) nodes[idx]!.y = leaf++;
    else {
      const ys = n.children.map(c => nodes[rec(c, x + c.length, idx)]!.y);
      nodes[idx]!.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    return idx;
  };
  rec(root, 0, -1);
  return { nodes, maxX, leafCount: leaf };
}

/** Convenience: distance matrix in percent (0..100) to fractions (0..1). */
export function percentToFraction(m: number[][]): number[][] {
  return m.map(r => r.map(v => v / 100));
}
