/**
 * Deterministic sequence alignment for normalized instruction fingerprints.
 * Prefer matching identical instruction sequences over offset identity so
 * insertions/deletions do not inflate "replaced" counts via later offset shifts.
 */

export type SequenceOp =
  | { type: "equal"; aIndex: number; bIndex: number }
  | { type: "delete"; aIndex: number }
  | { type: "insert"; bIndex: number }
  | { type: "replace"; aIndex: number; bIndex: number };

const MIN_ANCHOR_RUN = 3;
/** Myers on gaps larger than this product falls back to bulk add/remove. */
const MYERS_PRODUCT_LIMIT = 80_000;

export function instructionFingerprint(opcode: string, operands: string[]): string {
  return `${opcode}\0${operands.join("\0")}`;
}

/**
 * Align two fingerprint sequences.
 * Strategy: greedily find non-crossing identical runs (anchors), then Myers-diff
 * the gaps when small enough; otherwise treat gap leftovers as insert/delete.
 */
export function alignSequences(a: string[], b: string[]): SequenceOp[] {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) {
    return b.map((_, i) => ({ type: "insert" as const, bIndex: i }));
  }
  if (b.length === 0) {
    return a.map((_, i) => ({ type: "delete" as const, aIndex: i }));
  }

  // Small enough for a direct Myers pass
  if (a.length * b.length <= MYERS_PRODUCT_LIMIT) {
    return myersToOps(a, b);
  }

  const anchors = findNonCrossingAnchors(a, b);
  const ops: SequenceOp[] = [];
  let aCursor = 0;
  let bCursor = 0;

  for (const anchor of anchors) {
    appendGapOps(ops, a, b, aCursor, anchor.a, bCursor, anchor.b);
    for (let k = 0; k < anchor.len; k++) {
      ops.push({
        type: "equal",
        aIndex: anchor.a + k,
        bIndex: anchor.b + k,
      });
    }
    aCursor = anchor.a + anchor.len;
    bCursor = anchor.b + anchor.len;
  }
  appendGapOps(ops, a, b, aCursor, a.length, bCursor, b.length);
  return ops;
}

function appendGapOps(
  ops: SequenceOp[],
  a: string[],
  b: string[],
  a0: number,
  a1: number,
  b0: number,
  b1: number
): void {
  const ga = a.slice(a0, a1);
  const gb = b.slice(b0, b1);
  if (ga.length === 0 && gb.length === 0) return;

  if (ga.length * gb.length <= MYERS_PRODUCT_LIMIT && (ga.length > 0 || gb.length > 0)) {
    if (ga.length > 0 && gb.length > 0) {
      const gapOps = myersToOps(ga, gb);
      for (const op of gapOps) {
        if (op.type === "equal") {
          ops.push({
            type: "equal",
            aIndex: a0 + op.aIndex,
            bIndex: b0 + op.bIndex,
          });
        } else if (op.type === "delete") {
          ops.push({ type: "delete", aIndex: a0 + op.aIndex });
        } else if (op.type === "insert") {
          ops.push({ type: "insert", bIndex: b0 + op.bIndex });
        } else {
          ops.push({
            type: "replace",
            aIndex: a0 + op.aIndex,
            bIndex: b0 + op.bIndex,
          });
        }
      }
      return;
    }
  }

  // Bulk fallback: no claim of 1:1 replacement across a large unmatched gap
  for (let i = a0; i < a1; i++) ops.push({ type: "delete", aIndex: i });
  for (let j = b0; j < b1; j++) ops.push({ type: "insert", bIndex: j });
}

type Anchor = { a: number; b: number; len: number };

function findNonCrossingAnchors(a: string[], b: string[]): Anchor[] {
  const indexB = new Map<string, number[]>();
  for (let i = 0; i < b.length; i++) {
    const list = indexB.get(b[i]);
    if (list) list.push(i);
    else indexB.set(b[i], [i]);
  }

  const usedB = new Uint8Array(b.length);
  const raw: Anchor[] = [];
  let i = 0;
  while (i < a.length) {
    let best: Anchor = { a: i, b: -1, len: 0 };
    const candidates = indexB.get(a[i]) ?? [];
    for (const bStart of candidates) {
      if (usedB[bStart]) continue;
      let len = 0;
      while (
        i + len < a.length &&
        bStart + len < b.length &&
        !usedB[bStart + len] &&
        a[i + len] === b[bStart + len]
      ) {
        len++;
      }
      if (len > best.len || (len === best.len && len > 0 && bStart < best.b)) {
        best = { a: i, b: bStart, len };
      }
    }
    if (best.len >= MIN_ANCHOR_RUN) {
      raw.push(best);
      for (let k = 0; k < best.len; k++) usedB[best.b + k] = 1;
      i += best.len;
    } else {
      i++;
    }
  }

  raw.sort((x, y) => x.a - y.a || x.b - y.b);
  const nonCrossing: Anchor[] = [];
  let lastBEnd = -1;
  for (const an of raw) {
    if (an.b > lastBEnd) {
      nonCrossing.push(an);
      lastBEnd = an.b + an.len - 1;
    }
  }
  return nonCrossing;
}

/** Myers edit script, then collapse adjacent delete+insert into replace. */
function myersToOps(a: string[], b: string[]): SequenceOp[] {
  const raw = myersRaw(a, b);
  const ops: SequenceOp[] = [];
  let i = 0;
  while (i < raw.length) {
    const cur = raw[i];
    if (cur.type === "context") {
      ops.push({ type: "equal", aIndex: cur.aIdx!, bIndex: cur.bIdx! });
      i++;
      continue;
    }
    if (cur.type === "removed") {
      const next = raw[i + 1];
      if (next && next.type === "added") {
        ops.push({
          type: "replace",
          aIndex: cur.aIdx!,
          bIndex: next.bIdx!,
        });
        i += 2;
        continue;
      }
      ops.push({ type: "delete", aIndex: cur.aIdx! });
      i++;
      continue;
    }
    if (cur.type === "added") {
      ops.push({ type: "insert", bIndex: cur.bIdx! });
      i++;
    }
  }
  return ops;
}

type MyersItem = {
  type: "added" | "removed" | "context";
  aIdx?: number;
  bIdx?: number;
  value: string;
};

function myersRaw(a: string[], b: string[]): MyersItem[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Map<number, number>[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        x = v.get(k + 1) ?? 0;
      } else {
        x = (v.get(k - 1) ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) {
        return myersBacktrack(a, b, trace, d);
      }
    }
  }
  return [];
}

function myersBacktrack(
  a: string[],
  b: string[],
  trace: Map<number, number>[],
  d: number
): MyersItem[] {
  const result: MyersItem[] = [];
  let x = a.length;
  let y = b.length;

  for (let depth = d; depth >= 0; depth--) {
    const v = trace[depth];
    const k = x - y;
    let prevK: number;
    if (k === -depth || (k !== depth && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      result.unshift({ type: "context", aIdx: x, bIdx: y, value: a[x] });
    }

    if (depth === 0) break;

    if (x > prevX) {
      x--;
      result.unshift({ type: "removed", aIdx: x, value: a[x] });
    } else if (y > prevY) {
      y--;
      result.unshift({ type: "added", bIdx: y, value: b[y] });
    }
  }

  return result;
}
