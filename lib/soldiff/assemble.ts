/**
 * Pure buffer assembly from ordered Write chunks.
 * Coverage gaps and overlaps are first-class — never silently zero-fill as success.
 */

import type {
  CoverageGap,
  OrderedWriteChunk,
  OverlapRecord,
  WriteOrderKey,
} from "./types";
import { BUFFER_HEADER_SIZE } from "./constants";
import { validateElf } from "./elf";

export type AssembleResult = {
  /** Assembled bytes before ELF trim (coverage domain). */
  assembled: Buffer;
  /** ELF bytes extracted from assembled buffer when valid. */
  elf: Buffer | null;
  coverageComplete: boolean;
  coverageGaps: CoverageGap[];
  coveredBytes: number;
  totalSpanBytes: number;
  overlaps: OverlapRecord[];
  unexpectedOverlapCount: number;
  warnings: string[];
  elfValidationErrors: string[];
  elfValidationWarnings: string[];
};

export type CompareWriteOrderResult = number;

/**
 * Deterministic chronological order for applying writes (oldest first).
 *
 * Order keys:
 * 1. slot ascending
 * 2. transactionIndex ascending when both known
 * 3. instructionIndex ascending
 * 4. innerInstructionIndex (null outer before inners; then ascending)
 * 5. signature lexicographic (stable tiebreaker — documented limitation)
 */
export function compareWriteOrder(
  a: WriteOrderKey,
  b: WriteOrderKey
): CompareWriteOrderResult {
  if (a.slot !== b.slot) return a.slot - b.slot;

  if (a.transactionIndex !== null && b.transactionIndex !== null) {
    if (a.transactionIndex !== b.transactionIndex) {
      return a.transactionIndex - b.transactionIndex;
    }
  } else if (a.transactionIndex !== null || b.transactionIndex !== null) {
    // Prefer known index first only for stability; callers should warn.
  }

  if (a.signature !== b.signature) {
    // Same slot, unknown relative tx order: stable but may be wrong.
    // Prefer matching signature groups first so instruction order within a tx is preserved.
    if (a.signature < b.signature) return -1;
    if (a.signature > b.signature) return 1;
  }

  if (a.instructionIndex !== b.instructionIndex) {
    return a.instructionIndex - b.instructionIndex;
  }

  const aInner = a.innerInstructionIndex ?? -1;
  const bInner = b.innerInstructionIndex ?? -1;
  if (aInner !== bInner) return aInner - bInner;

  return 0;
}

export function sortWriteChunks(chunks: OrderedWriteChunk[]): OrderedWriteChunk[] {
  return [...chunks].sort(compareWriteOrder);
}

export function sameSlotOrderingAmbiguous(chunks: OrderedWriteChunk[]): boolean {
  const bySlot = new Map<number, Set<string>>();
  for (const c of chunks) {
    let set = bySlot.get(c.slot);
    if (!set) {
      set = new Set();
      bySlot.set(c.slot, set);
    }
    set.add(c.signature);
  }
  for (const [slot, sigs] of bySlot) {
    if (sigs.size <= 1) continue;
    const sample = chunks.filter((c) => c.slot === slot);
    const anyMissingIndex = sample.some((c) => c.transactionIndex === null);
    if (anyMissingIndex) return true;
  }
  return false;
}

/**
 * Apply writes oldest-first. Later writes may overwrite earlier ones;
 * identical overwrites are recorded; differing overwrites are unexpected.
 */
export function assembleFromOrderedWrites(
  chunks: OrderedWriteChunk[],
  options?: { requireValidElf?: boolean; allowUnexpectedOverlaps?: boolean }
): AssembleResult {
  const requireValidElf = options?.requireValidElf ?? true;
  const allowUnexpectedOverlaps = options?.allowUnexpectedOverlaps ?? false;
  const warnings: string[] = [];

  if (chunks.length === 0) {
    throw new Error("No Write instruction chunks to assemble");
  }

  const ordered = sortWriteChunks(chunks);

  if (sameSlotOrderingAmbiguous(ordered)) {
    warnings.push(
      "Same-slot writes from multiple transactions lack transactionIndex from RPC; " +
        "ordering falls back to signature lexicographic order and may be incorrect."
    );
  }

  let maxEnd = 0;
  for (const c of ordered) {
    maxEnd = Math.max(maxEnd, c.offset + c.bytes.length);
  }

  const assembled = Buffer.alloc(maxEnd);
  const covered = new Uint8Array(maxEnd); // 0 = uncovered, 1 = covered
  /** Index into `ordered` of the last writer for each byte; -1 = none. */
  const lastWriter = new Int32Array(maxEnd).fill(-1);
  const overlaps: OverlapRecord[] = [];
  let unexpectedOverlapCount = 0;

  for (let chunkIdx = 0; chunkIdx < ordered.length; chunkIdx++) {
    const chunk = ordered[chunkIdx];

    // Detect overlap regions for this chunk against already-covered bytes
    let overlapStart: number | null = null;
    let bytesDiffer = false;
    let earlierIdx = -1;
    for (let i = 0; i < chunk.bytes.length; i++) {
      const pos = chunk.offset + i;
      if (covered[pos] === 1) {
        if (overlapStart === null) {
          overlapStart = pos;
          earlierIdx = lastWriter[pos];
          bytesDiffer = false;
        }
        if (assembled[pos] !== chunk.bytes[i]) bytesDiffer = true;
      } else if (overlapStart !== null) {
        overlaps.push({
          offset: overlapStart,
          length: pos - overlapStart,
          earlierWrite: orderKeyOf(ordered[Math.max(0, earlierIdx)]),
          laterWrite: orderKeyOf(chunk),
          bytesDiffer,
        });
        if (bytesDiffer) unexpectedOverlapCount++;
        overlapStart = null;
      }
    }
    if (overlapStart !== null) {
      overlaps.push({
        offset: overlapStart,
        length: chunk.offset + chunk.bytes.length - overlapStart,
        earlierWrite: orderKeyOf(ordered[Math.max(0, earlierIdx)]),
        laterWrite: orderKeyOf(chunk),
        bytesDiffer,
      });
      if (bytesDiffer) unexpectedOverlapCount++;
    }

    chunk.bytes.copy(assembled, chunk.offset);
    covered.fill(1, chunk.offset, chunk.offset + chunk.bytes.length);
    lastWriter.fill(chunkIdx, chunk.offset, chunk.offset + chunk.bytes.length);
  }

  const coveredBytes = covered.reduce((n, v) => n + (v ? 1 : 0), 0);

  if (unexpectedOverlapCount > 0) {
    warnings.push(
      `${unexpectedOverlapCount} overlapping write region(s) with differing bytes ` +
        `(later write wins chronologically)`
    );
  }

  let elf: Buffer | null = null;
  let elfValidationErrors: string[] = [];
  let elfValidationWarnings: string[] = [];

  const elfOffset = assembled.indexOf("\x7fELF", 0, "ascii");
  let candidate: Buffer | null = null;
  let coverageDomainStart = 0;
  if (elfOffset >= 0) {
    candidate = assembled.subarray(elfOffset);
    coverageDomainStart = elfOffset;
  } else if (assembled.length > BUFFER_HEADER_SIZE) {
    candidate = assembled.subarray(BUFFER_HEADER_SIZE);
    coverageDomainStart = BUFFER_HEADER_SIZE;
    warnings.push("ELF magic not found at write offsets; tried BUFFER_HEADER_SIZE skip");
  }

  let coverageGaps = findGaps(covered);
  if (candidate) {
    coverageGaps = findGaps(
      covered.subarray(coverageDomainStart, coverageDomainStart + candidate.length)
    ).map((g) => ({
      offset: g.offset + coverageDomainStart,
      length: g.length,
    }));
  }

  const coverageComplete = coverageGaps.length === 0 && coveredBytes > 0;

  if (!coverageComplete) {
    warnings.push(
      `Coverage incomplete: ${coverageGaps.length} gap(s), ` +
        `${coveredBytes}/${maxEnd} bytes covered in write span`
    );
  }

  if (candidate) {
    const validation = validateElf(candidate);
    elfValidationErrors = validation.errors;
    elfValidationWarnings = validation.warnings;
    warnings.push(...validation.warnings.map((w) => `ELF: ${w}`));
    if (validation.ok) {
      elf = candidate;
    }
  }

  void allowUnexpectedOverlaps;
  void requireValidElf;

  return {
    assembled,
    elf,
    coverageComplete,
    coverageGaps,
    coveredBytes,
    totalSpanBytes: maxEnd,
    overlaps,
    unexpectedOverlapCount,
    warnings,
    elfValidationErrors,
    elfValidationWarnings,
  };
}

function orderKeyOf(c: OrderedWriteChunk): WriteOrderKey {
  return {
    slot: c.slot,
    transactionIndex: c.transactionIndex,
    signature: c.signature,
    instructionIndex: c.instructionIndex,
    innerInstructionIndex: c.innerInstructionIndex,
  };
}

function findGaps(covered: Uint8Array): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  let i = 0;
  while (i < covered.length) {
    if (covered[i] === 1) {
      i++;
      continue;
    }
    const start = i;
    while (i < covered.length && covered[i] === 0) i++;
    gaps.push({ offset: start, length: i - start });
  }
  return gaps;
}

/**
 * Extract a minimal valid-looking ELF for fixtures.
 * When assembling for tests that inject raw ELF bytes as a single write at 0.
 */
export function assertCompleteElf(result: AssembleResult): Buffer {
  if (!result.elf) {
    const detail =
      result.elfValidationErrors.length > 0
        ? result.elfValidationErrors.join("; ")
        : "no valid ELF produced";
    throw new ReconstructionError(`Reconstruction produced invalid ELF: ${detail}`, {
      coverageGaps: result.coverageGaps,
      warnings: result.warnings,
      unexpectedOverlapCount: result.unexpectedOverlapCount,
    });
  }
  if (!result.coverageComplete) {
    throw new ReconstructionError(
      `Reconstruction incomplete — missing ${result.coverageGaps.length} region(s)`,
      {
        coverageGaps: result.coverageGaps,
        warnings: result.warnings,
        unexpectedOverlapCount: result.unexpectedOverlapCount,
      }
    );
  }
  if (result.unexpectedOverlapCount > 0) {
    throw new ReconstructionError(
      `Reconstruction has ${result.unexpectedOverlapCount} conflicting overlapping write(s)`,
      {
        coverageGaps: result.coverageGaps,
        warnings: result.warnings,
        unexpectedOverlapCount: result.unexpectedOverlapCount,
      }
    );
  }
  return result.elf;
}

export class ReconstructionError extends Error {
  readonly coverageGaps: CoverageGap[];
  readonly warnings: string[];
  readonly unexpectedOverlapCount: number;

  constructor(
    message: string,
    meta: {
      coverageGaps: CoverageGap[];
      warnings: string[];
      unexpectedOverlapCount: number;
    }
  ) {
    super(message);
    this.name = "ReconstructionError";
    this.coverageGaps = meta.coverageGaps;
    this.warnings = meta.warnings;
    this.unexpectedOverlapCount = meta.unexpectedOverlapCount;
  }
}
