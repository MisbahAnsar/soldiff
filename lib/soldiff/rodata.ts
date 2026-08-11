/**
 * .rodata analysis helpers. Byte-region changes are primary evidence;
 * extracted strings are supplementary and often noisy (concatenated / fragmented).
 */

export type RodataStringKind =
  | "product"
  | "build_path"
  | "compiler_runtime"
  | "anchor_constraint"
  | "uncertain_fragment";

export type ExtractedRodataString = {
  text: string;
  offset: number;
  length: number;
  kind: RodataStringKind;
  confidence: "high" | "medium" | "low";
};

export type RodataRegionChange = {
  offset: number;
  length: number;
  kind: "modified" | "added" | "removed";
};

const BUILD_PATH_RE =
  /(?:\/Users\/|\/home\/|\/tmp\/|\\\\|\\Users\\|platform-tools|rustc-|cargo-target)/i;
const RUNTIME_RE =
  /(?:memory allocation failed|panicked at|Option::unwrap|Result::unwrap|overflow|BorrowMutError|alloc\/src|library\/core|library\/alloc)/i;
const ANCHOR_RE =
  /(?:constraint was violated|Instruction:|AnchorError|ProgramError|discriminator|require_keys|associated token)/i;

export function classifyRodataString(text: string): {
  kind: RodataStringKind;
  confidence: "high" | "medium" | "low";
} {
  if (BUILD_PATH_RE.test(text)) {
    return { kind: "build_path", confidence: "high" };
  }
  if (RUNTIME_RE.test(text)) {
    return { kind: "compiler_runtime", confidence: "high" };
  }
  // Concatenated blobs / missing separators → uncertain
  const looksFragmented =
    text.length > 80 &&
    (/[a-z][A-Z]/.test(text) || /violated[A-Z]/.test(text) || text.includes("Instruction:"));
  if (ANCHOR_RE.test(text)) {
    return {
      kind: looksFragmented ? "uncertain_fragment" : "anchor_constraint",
      confidence: looksFragmented ? "low" : "medium",
    };
  }
  if (looksFragmented || text.length > 120) {
    return { kind: "uncertain_fragment", confidence: "low" };
  }
  return { kind: "product", confidence: "medium" };
}

/** Extract null/non-printable terminated ASCII runs with offsets. */
export function extractRodataStringsDetailed(
  buf: Buffer,
  minLen = 4,
  maxStrings = 400
): ExtractedRodataString[] {
  const out: ExtractedRodataString[] = [];
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const c = i < buf.length ? buf[i] : 0;
    const printable = c >= 32 && c <= 126;
    if (printable) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const length = i - start;
      if (length >= minLen) {
        const text = buf.toString("utf8", start, i);
        const { kind, confidence } = classifyRodataString(text);
        out.push({ text, offset: start, length, kind, confidence });
        if (out.length >= maxStrings) return out;
      }
      start = -1;
    }
  }
  return out;
}

/** Find coarse changed byte regions (merged runs). */
export function findRodataRegionChanges(
  a: Buffer,
  b: Buffer,
  mergeGap = 16
): RodataRegionChange[] {
  const max = Math.max(a.length, b.length);
  const raw: RodataRegionChange[] = [];
  let runStart = -1;
  let runKind: RodataRegionChange["kind"] | null = null;

  const flush = (end: number) => {
    if (runStart < 0 || !runKind) return;
    raw.push({ offset: runStart, length: end - runStart, kind: runKind });
    runStart = -1;
    runKind = null;
  };

  for (let i = 0; i < max; i++) {
    const inA = i < a.length;
    const inB = i < b.length;
    let kind: RodataRegionChange["kind"] | null = null;
    if (inA && inB) {
      if (a[i] !== b[i]) kind = "modified";
    } else if (inB) kind = "added";
    else kind = "removed";

    if (!kind) {
      flush(i);
      continue;
    }
    if (runStart < 0) {
      runStart = i;
      runKind = kind;
    } else if (runKind !== kind) {
      flush(i);
      runStart = i;
      runKind = kind;
    }
  }
  flush(max);

  // Merge nearby runs of the same kind
  const merged: RodataRegionChange[] = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.kind === r.kind &&
      r.offset <= prev.offset + prev.length + mergeGap
    ) {
      prev.length = r.offset + r.length - prev.offset;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

export function stringsOverlappingRegions(
  strings: ExtractedRodataString[],
  regions: RodataRegionChange[]
): ExtractedRodataString[] {
  return strings.filter((s) =>
    regions.some((r) => s.offset < r.offset + r.length && s.offset + s.length > r.offset)
  );
}

export type RodataAnalysis = {
  unchanged: boolean;
  sizeA: number;
  sizeB: number;
  regionChanges: RodataRegionChange[];
  changedRegionBytes: number;
  stringsA: ExtractedRodataString[];
  stringsB: ExtractedRodataString[];
  /** Strings overlapping changed regions in B (supplementary). */
  stringsInChangedRegionsB: ExtractedRodataString[];
  addedProductLike: ExtractedRodataString[];
  removedProductLike: ExtractedRodataString[];
  notes: string[];
};

export function analyzeRodata(a: Buffer, b: Buffer): RodataAnalysis {
  const unchanged = a.equals(b);
  const regionChanges = unchanged ? [] : findRodataRegionChanges(a, b);
  const changedRegionBytes = regionChanges.reduce((s, r) => s + r.length, 0);
  const stringsA = extractRodataStringsDetailed(a);
  const stringsB = extractRodataStringsDetailed(b);
  const setA = new Set(stringsA.map((s) => s.text));
  const setB = new Set(stringsB.map((s) => s.text));

  const added = stringsB.filter((s) => !setA.has(s.text));
  const removed = stringsA.filter((s) => !setB.has(s.text));

  const productLike = (s: ExtractedRodataString) =>
    s.kind === "product" || s.kind === "anchor_constraint";

  const notes = [
    "Primary evidence is .rodata byte-region change, not string-set membership.",
    "Extracted strings may be concatenated or fragmented; uncertain fragments are not product features.",
    "Build-path and compiler/runtime strings are toolchain noise, not application features.",
  ];

  return {
    unchanged,
    sizeA: a.length,
    sizeB: b.length,
    regionChanges: regionChanges.slice(0, 64),
    changedRegionBytes,
    stringsA,
    stringsB,
    stringsInChangedRegionsB: stringsOverlappingRegions(stringsB, regionChanges).slice(0, 40),
    addedProductLike: added.filter(productLike).slice(0, 20),
    removedProductLike: removed.filter(productLike).slice(0, 20),
    notes,
  };
}
