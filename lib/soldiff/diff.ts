import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";
import type { DiffLine } from "@/app/data/demos";

/** Split buffer into fixed-size chunks for structural comparison. */
function chunkBuffer(buf: Buffer, size = 32): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < buf.length; i += size) {
    const slice = buf.subarray(i, Math.min(i + size, buf.length));
    chunks.push(slice.toString("hex"));
  }
  return chunks;
}

/** Myers diff on string arrays — adapted for equal-length chunk sequences. */
function myersDiff(a: string[], b: string[]): { type: "added" | "removed" | "context"; aIdx?: number; bIdx?: number; value: string }[] {
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
        return backtrack(a, b, trace, d);
      }
    }
  }
  return [];
}

function backtrack(
  a: string[],
  b: string[],
  trace: Map<number, number>[],
  d: number
): { type: "added" | "removed" | "context"; aIdx?: number; bIdx?: number; value: string }[] {
  const result: { type: "added" | "removed" | "context"; aIdx?: number; bIdx?: number; value: string }[] = [];
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

export function diffBytecode(oldBuf: Buffer, newBuf: Buffer): DiffLine[] {
  const oldChunks = chunkBuffer(oldBuf);
  const newChunks = chunkBuffer(newBuf);
  const raw = myersDiff(oldChunks, newChunks);

  const lines: DiffLine[] = [];
  let lineNo = 1;

  for (const item of raw) {
    if (item.type === "context") {
      lines.push({
        type: "context",
        lineA: (item.aIdx ?? 0) + 1,
        lineB: (item.bIdx ?? 0) + 1,
        content: `0x${item.value}`,
      });
    } else if (item.type === "removed") {
      lines.push({
        type: "removed",
        lineA: (item.aIdx ?? 0) + 1,
        content: `0x${item.value}`,
      });
    } else {
      lines.push({
        type: "added",
        lineB: (item.bIdx ?? 0) + 1,
        content: `0x${item.value}`,
      });
    }
    lineNo++;
  }

  // Cap output for UI — keep first changes + context around them
  const changed = lines.filter((l) => l.type !== "context");
  if (changed.length === 0) {
    return [{ type: "context", lineA: 1, lineB: 1, content: "// Bytecode identical" }];
  }

  if (lines.length <= 40) return lines;

  const head = lines.slice(0, 20);
  const tail = lines.slice(-10);
  return [
    ...head,
    { type: "context", content: `// … ${lines.length - 30} more chunks truncated …` },
    ...tail,
  ];
}

export function extractStrings(buf: Buffer, minLen = 4): string[] {
  const strings: string[] = [];
  let current = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c <= 126) {
      current += String.fromCharCode(c);
    } else {
      if (current.length >= minLen) strings.push(current);
      current = "";
    }
  }
  if (current.length >= minLen) strings.push(current);
  return strings;
}

export function extractPubkeys(buf: Buffer): string[] {
  const found = new Set<string>();
  for (let i = 0; i <= buf.length - 32; i++) {
    try {
      const key = new PublicKey(buf.subarray(i, i + 32));
      const b58 = key.toBase58();
      if (!b58.includes("1111111111") || b58.length > 10) {
        found.add(b58);
      }
    } catch {
      // not a valid pubkey at this offset
    }
  }
  return [...found];
}

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
