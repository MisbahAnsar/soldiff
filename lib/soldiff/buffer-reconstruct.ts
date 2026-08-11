/**
 * Reconstruct an uploaded BPF ELF from Upgradeable Loader Write transactions.
 *
 * Correctness priorities:
 * - Deterministic write ordering (not RPC return order)
 * - Deployment-cycle isolation (do not mix reused-buffer history)
 * - Same-slot inclusion when ordered relative to the Upgrade
 * - Coverage and overlap detection (no silent zero-fill success)
 * - Strong ELF validation after assembly
 */

import { type Connection, PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  LOADER_IX_CLOSE,
  LOADER_IX_INITIALIZE_BUFFER,
  LOADER_IX_UPGRADE,
  LOADER_IX_WRITE,
} from "./constants";
import {
  assembleFromOrderedWrites,
  assertCompleteElf,
  ReconstructionError,
  sortWriteChunks,
} from "./assemble";
import {
  elfContentHash,
  getCachedElf,
  makeElfCacheKey,
  setCachedElf,
} from "./elf-cache";
import { parseElfSections } from "./elf";
import { sha256Hex } from "./hash";
import { instructionDataToBuffer } from "./ix-data";
import { getRpcStats, rpcGetSignaturesForAddress, rpcGetTransaction } from "./rpc-executor";
import { transactionAccountKeys, transactionTopInstructions } from "./tx-keys";
import { parseUpgradeTransaction } from "./upgrade-tx";
import type { ArtifactProvenance, OrderedWriteChunk, WriteOrderKey } from "./types";

export interface ReconstructProgress {
  fetched: number;
  total: number;
}

export type BufferSignatureEntry = {
  signature: string;
  slot: number;
};

export type ReconstructionSuccess = {
  elf: Buffer;
  writeTxCount: number;
  writeChunkCount: number;
  slot: number;
  cached: boolean;
  cacheKey: string;
  elfHash: string;
  provenance: ArtifactProvenance;
};

const MAX_SIG_PAGES = 20;
const MAX_SLOT_LOOKBACK = 250_000;

type LoaderIxKind = "initialize_buffer" | "write" | "upgrade" | "close" | "other";

type ClassifiedTx = {
  signature: string;
  slot: number;
  transactionIndex: number | null;
  kinds: LoaderIxKind[];
  writeChunks: OrderedWriteChunk[];
};

function logElfSummary(
  versionLabel: string,
  cacheKey: string,
  upgradeSignature: string,
  writeTxCount: number,
  elf: Buffer,
  cached: boolean
): void {
  console.info(
    `[soldiff] ${versionLabel} summary: ` +
      `cacheKey=${cacheKey} ` +
      `upgradeSig=${upgradeSignature.slice(0, 16)}… ` +
      `writeTxs=${writeTxCount} ` +
      `elfHash=${elfContentHash(elf)} ` +
      `source=${cached ? "cache" : "reconstructed"}`
  );
}

function orderKey(
  slot: number,
  signature: string,
  instructionIndex: number,
  innerInstructionIndex: number | null,
  transactionIndex: number | null = null
): WriteOrderKey {
  return { slot, transactionIndex, signature, instructionIndex, innerInstructionIndex };
}

/** Parse Write chunks from a transaction with full order metadata. */
export function parseOrderedWriteChunks(
  tx: VersionedTransactionResponse,
  bufferAddress: string,
  signature: string,
  transactionIndex: number | null = null
): OrderedWriteChunk[] {
  const keys = transactionAccountKeys(tx);
  const loader = BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58();
  const chunks: OrderedWriteChunk[] = [];
  const slot = tx.slot;

  const tryIx = (
    ix: {
      programIdIndex: number;
      accounts: number[];
      data: string | Uint8Array | Buffer;
    },
    instructionIndex: number,
    innerInstructionIndex: number | null
  ) => {
    if (keys[ix.programIdIndex] !== loader) return;
    if (!ix.accounts.some((i) => keys[i] === bufferAddress)) return;

    const raw = instructionDataToBuffer(ix.data);
    if (raw.length < 12 || raw.readUInt32LE(0) !== LOADER_IX_WRITE) return;

    const offset = raw.readUInt32LE(4);
    const len = raw.readUInt32LE(8);
    if (len <= 0 || 12 + len > raw.length) return;

    chunks.push({
      ...orderKey(slot, signature, instructionIndex, innerInstructionIndex, transactionIndex),
      offset,
      bytes: Buffer.from(raw.subarray(12, 12 + len)),
    });
  };

  const top = transactionTopInstructions(tx);
  for (let i = 0; i < top.length; i++) tryIx(top[i], i, null);

  for (const group of tx.meta?.innerInstructions ?? []) {
    const parentIndex = group.index;
    for (let j = 0; j < group.instructions.length; j++) {
      tryIx(group.instructions[j], parentIndex, j);
    }
  }

  return chunks;
}

function classifyLoaderKinds(
  tx: VersionedTransactionResponse,
  bufferAddress: string
): LoaderIxKind[] {
  const keys = transactionAccountKeys(tx);
  const loader = BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58();
  const kinds = new Set<LoaderIxKind>();

  const visit = (ix: {
    programIdIndex: number;
    accounts: number[];
    data: string | Uint8Array | Buffer;
  }) => {
    if (keys[ix.programIdIndex] !== loader) return;
    if (!ix.accounts.some((i) => keys[i] === bufferAddress)) return;
    const raw = instructionDataToBuffer(ix.data);
    if (raw.length < 4) return;
    const disc = raw.readUInt32LE(0);
    if (disc === LOADER_IX_INITIALIZE_BUFFER) kinds.add("initialize_buffer");
    else if (disc === LOADER_IX_WRITE) kinds.add("write");
    else if (disc === LOADER_IX_UPGRADE) kinds.add("upgrade");
    else if (disc === LOADER_IX_CLOSE) kinds.add("close");
    else kinds.add("other");
  };

  for (const ix of transactionTopInstructions(tx)) visit(ix);
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) visit(ix);
  }
  return [...kinds];
}

/**
 * Collect buffer address signatures that may belong to the deployment.
 * Includes same-slot entries (filtered later relative to the Upgrade).
 */
export async function collectBufferHistorySignatures(
  bufferAddress: PublicKey,
  upgradeSlot: number,
  upgradeSignature: string
): Promise<BufferSignatureEntry[]> {
  const entries: BufferSignatureEntry[] = [];
  let before: string | undefined;
  let sawUpgrade = false;

  for (let page = 0; page < MAX_SIG_PAGES; page++) {
    const batch = await rpcGetSignaturesForAddress(bufferAddress, {
      limit: 1000,
      before,
    });
    if (batch.length === 0) break;

    for (const entry of batch) {
      if (entry.err) continue;
      // Include same-slot; exclude strictly after the upgrade slot.
      if (entry.slot > upgradeSlot) continue;
      entries.push({ signature: entry.signature, slot: entry.slot });
      if (entry.signature === upgradeSignature) sawUpgrade = true;
    }

    const oldest = batch[batch.length - 1];
    if (oldest.slot < upgradeSlot - MAX_SLOT_LOOKBACK) break;

    before = oldest.signature;
    if (batch.length < 1000) break;
  }

  if (!sawUpgrade) {
    // Upgrade tx always references the buffer — ensure it is present.
    entries.push({ signature: upgradeSignature, slot: upgradeSlot });
  }

  return entries;
}

/**
 * Isolate the deployment cycle for a target Upgrade:
 * InitializeBuffer → Writes → target Upgrade
 * Stops at Close or a prior Upgrade of the same buffer (reuse boundary).
 */
export function selectDeploymentCycleChunks(
  classified: ClassifiedTx[],
  upgradeSignature: string,
  upgradeSlot: number
): {
  chunks: OrderedWriteChunk[];
  writeTransactionCount: number;
  bounded: boolean;
  startSignature?: string;
  startKind?: "initialize_buffer" | "first_write" | "unknown";
  warnings: string[];
} {
  const warnings: string[] = [];

  // Chronological ascending for cycle walk
  const chronological = [...classified].sort((a, b) => {
    if (a.slot !== b.slot) return a.slot - b.slot;
    if (a.transactionIndex !== null && b.transactionIndex !== null) {
      return a.transactionIndex - b.transactionIndex;
    }
    return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
  });

  const upgradeIdx = chronological.findIndex((t) => t.signature === upgradeSignature);
  if (upgradeIdx < 0) {
    throw new ReconstructionError(
      `Target Upgrade signature ${upgradeSignature.slice(0, 12)}… not found in buffer history`,
      { coverageGaps: [], warnings: [], unexpectedOverlapCount: 0 }
    );
  }

  const upgradeTx = chronological[upgradeIdx];
  if (upgradeTx.slot !== upgradeSlot) {
    warnings.push(
      `Upgrade slot mismatch: parsed ${upgradeSlot} vs history ${upgradeTx.slot}`
    );
  }

  // Same-slot: only include txs that sort at-or-before the Upgrade
  const cycleChunks: OrderedWriteChunk[] = [];
  const writeSigs = new Set<string>();
  let startSignature: string | undefined;
  let startKind: "initialize_buffer" | "first_write" | "unknown" | undefined;
  let bounded = false;

  for (let i = upgradeIdx; i >= 0; i--) {
    const tx = chronological[i];

    // Same slot: skip transactions that order after the Upgrade
    if (tx.slot === upgradeSlot && tx.signature !== upgradeSignature) {
      const cmp = compareTxBeforeUpgrade(tx, upgradeTx);
      if (cmp > 0) continue;
    }
    if (tx.slot > upgradeSlot) continue;

    if (i < upgradeIdx) {
      if (tx.kinds.includes("close")) {
        // Previous cycle ended; do not include close or anything before it.
        bounded = true;
        warnings.push(
          `Stopped at Close boundary ${tx.signature.slice(0, 12)}… (buffer reuse isolation)`
        );
        break;
      }
      if (tx.kinds.includes("upgrade") && tx.signature !== upgradeSignature) {
        bounded = true;
        warnings.push(
          `Stopped at prior Upgrade ${tx.signature.slice(0, 12)}… (buffer reuse isolation)`
        );
        break;
      }
    }

    if (tx.writeChunks.length > 0) {
      cycleChunks.push(...tx.writeChunks);
      writeSigs.add(tx.signature);
      if (!startKind) {
        startKind = "first_write";
        startSignature = tx.signature;
      }
    }

    if (tx.kinds.includes("initialize_buffer")) {
      startKind = "initialize_buffer";
      startSignature = tx.signature;
      bounded = true;
      break;
    }
  }

  if (!bounded) {
    throw new ReconstructionError(
      "Cannot confidently establish deployment-cycle boundary for this buffer. " +
        "Missing InitializeBuffer (or Close/prior-Upgrade) within scanned history — " +
        "refusing to mix potentially reused buffer writes.",
      { coverageGaps: [], warnings, unexpectedOverlapCount: 0 }
    );
  }

  if (cycleChunks.length === 0) {
    throw new ReconstructionError(
      `No Write chunks found in deployment cycle ending at ${upgradeSignature.slice(0, 12)}…`,
      { coverageGaps: [], warnings, unexpectedOverlapCount: 0 }
    );
  }

  return {
    chunks: sortWriteChunks(cycleChunks),
    writeTransactionCount: writeSigs.size,
    bounded,
    startSignature,
    startKind: startKind ?? "unknown",
    warnings,
  };
}

function compareTxBeforeUpgrade(tx: ClassifiedTx, upgradeTx: ClassifiedTx): number {
  if (tx.transactionIndex !== null && upgradeTx.transactionIndex !== null) {
    return tx.transactionIndex - upgradeTx.transactionIndex;
  }
  // Documented fallback
  return tx.signature < upgradeTx.signature
    ? -1
    : tx.signature > upgradeTx.signature
      ? 1
      : 0;
}

async function fetchAndClassify(
  entries: BufferSignatureEntry[],
  bufferAddress: string,
  versionLabel: string,
  onProgress?: (p: ReconstructProgress) => void
): Promise<ClassifiedTx[]> {
  const total = entries.length;
  console.info(`[soldiff] ${versionLabel}: ${total} buffer txs to fetch`);
  const out: ClassifiedTx[] = [];

  for (let i = 0; i < entries.length; i++) {
    const { signature, slot } = entries[i];
    const tx = await rpcGetTransaction(signature);
    if (tx) {
      out.push({
        signature,
        slot: tx.slot ?? slot,
        transactionIndex: null, // RPC getTransaction does not expose block index
        kinds: classifyLoaderKinds(tx, bufferAddress),
        writeChunks: parseOrderedWriteChunks(tx, bufferAddress, signature, null),
      });
    }

    const completed = i + 1;
    if (completed === 1 || completed % 10 === 0 || completed === total) {
      const stats = getRpcStats();
      console.info(
        `[soldiff] Fetching buffer tx ${completed}/${total} ` +
          `(elapsed ${stats.elapsedSec}s, retries ${stats.retryCount}, active ${stats.activeCount})`
      );
    }
    onProgress?.({ fetched: completed, total });
  }

  return out;
}

function buildProvenance(params: {
  programId: string;
  programDataAddress: string;
  bufferAddress: string;
  upgradeSignature: string;
  upgradeSlot: number;
  elf: Buffer;
  writeTransactionCount: number;
  writeChunkCount: number;
  coverageComplete: boolean;
  coverageGaps: ArtifactProvenance["coverageGaps"];
  overlapCount: number;
  unexpectedOverlapCount: number;
  warnings: string[];
  startSignature?: string;
  startKind?: "initialize_buffer" | "first_write" | "unknown";
  bounded: boolean;
}): ArtifactProvenance {
  const { text, rodata } = parseElfSections(params.elf);
  return {
    programId: params.programId,
    programDataAddress: params.programDataAddress,
    bufferAddress: params.bufferAddress,
    upgradeSignature: params.upgradeSignature,
    upgradeSlot: params.upgradeSlot,
    reconstructionMethod: "buffer-write-replay",
    writeTransactionCount: params.writeTransactionCount,
    writeChunkCount: params.writeChunkCount,
    byteLength: params.elf.length,
    sha256: sha256Hex(params.elf),
    textSha256: sha256Hex(text),
    rodataSha256: sha256Hex(rodata),
    coverageComplete: params.coverageComplete,
    coverageGaps: params.coverageGaps,
    overlapCount: params.overlapCount,
    unexpectedOverlapCount: params.unexpectedOverlapCount,
    reconstructionWarnings: params.warnings,
    deploymentCycle: {
      startSignature: params.startSignature,
      startKind: params.startKind,
      endSignature: params.upgradeSignature,
      bounded: params.bounded,
    },
    rpcProviderMetadata: {
      sameSlotOrdering: "signature-lexicographic-fallback-when-tx-index-unavailable",
      note: "getTransaction does not return block transaction index; same-slot multi-tx order may be ambiguous",
    },
  };
}

async function reconstructElfFromBufferUncached(params: {
  bufferAddress: PublicKey;
  upgradeSlot: number;
  upgradeSignature: string;
  programId: string;
  programDataAddress: string;
  versionLabel: string;
  onProgress?: (p: ReconstructProgress) => void;
}): Promise<ReconstructionSuccess> {
  const {
    bufferAddress,
    upgradeSlot,
    upgradeSignature,
    programId,
    programDataAddress,
    versionLabel,
    onProgress,
  } = params;
  const bufferKey = bufferAddress.toBase58();

  console.info(
    `[soldiff] ${versionLabel}: collecting buffer history for ${bufferKey} ` +
      `(upgrade slot ${upgradeSlot}, sig ${upgradeSignature.slice(0, 16)}…)`
  );

  const history = await collectBufferHistorySignatures(
    bufferAddress,
    upgradeSlot,
    upgradeSignature
  );

  if (history.length === 0) {
    throw new ReconstructionError(
      `No buffer history found for ${bufferKey} at/before slot ${upgradeSlot}`,
      { coverageGaps: [], warnings: [], unexpectedOverlapCount: 0 }
    );
  }

  const classified = await fetchAndClassify(history, bufferKey, versionLabel, onProgress);
  const cycle = selectDeploymentCycleChunks(classified, upgradeSignature, upgradeSlot);

  const assembled = assembleFromOrderedWrites(cycle.chunks);
  const allWarnings = [...cycle.warnings, ...assembled.warnings];

  let elf: Buffer;
  try {
    elf = assertCompleteElf(assembled);
  } catch (err) {
    if (err instanceof ReconstructionError) {
      err.warnings.push(...allWarnings);
      throw err;
    }
    throw err;
  }

  const provenance = buildProvenance({
    programId,
    programDataAddress,
    bufferAddress: bufferKey,
    upgradeSignature,
    upgradeSlot,
    elf,
    writeTransactionCount: cycle.writeTransactionCount,
    writeChunkCount: cycle.chunks.length,
    coverageComplete: assembled.coverageComplete,
    coverageGaps: assembled.coverageGaps,
    overlapCount: assembled.overlaps.length,
    unexpectedOverlapCount: assembled.unexpectedOverlapCount,
    warnings: allWarnings,
    startSignature: cycle.startSignature,
    startKind: cycle.startKind,
    bounded: cycle.bounded,
  });

  return {
    elf,
    writeTxCount: cycle.writeTransactionCount,
    writeChunkCount: cycle.chunks.length,
    slot: upgradeSlot,
    cached: false,
    cacheKey: makeElfCacheKey(bufferKey, upgradeSlot, upgradeSignature),
    elfHash: elfContentHash(elf),
    provenance,
  };
}

/** Reconstruct BPF ELF uploaded into a buffer via Write instructions. */
export async function reconstructElfFromBuffer(
  _connection: Connection,
  bufferAddress: PublicKey,
  upgradeSlot: number,
  upgradeSignature: string,
  versionLabel = "ELF",
  onProgress?: (p: ReconstructProgress) => void,
  identity?: { programId: string; programDataAddress: string }
): Promise<ReconstructionSuccess> {
  const bufferKey = bufferAddress.toBase58();
  const cacheKey = makeElfCacheKey(bufferKey, upgradeSlot, upgradeSignature);
  const hit = getCachedElf(cacheKey);
  const programId = identity?.programId ?? "";
  const programDataAddress = identity?.programDataAddress ?? "";

  if (hit) {
    logElfSummary(versionLabel, cacheKey, upgradeSignature, 0, hit, true);
    const { text, rodata } = parseElfSections(hit);
    return {
      elf: hit,
      writeTxCount: 0,
      writeChunkCount: 0,
      slot: upgradeSlot,
      cached: true,
      cacheKey,
      elfHash: elfContentHash(hit),
      provenance: {
        programId,
        programDataAddress,
        bufferAddress: bufferKey,
        upgradeSignature,
        upgradeSlot,
        reconstructionMethod: "buffer-write-replay",
        writeTransactionCount: 0,
        writeChunkCount: 0,
        byteLength: hit.length,
        sha256: sha256Hex(hit),
        textSha256: sha256Hex(text),
        rodataSha256: sha256Hex(rodata),
        coverageComplete: true,
        coverageGaps: [],
        overlapCount: 0,
        unexpectedOverlapCount: 0,
        reconstructionWarnings: ["Served from in-process ELF cache; write stats unavailable"],
      },
    };
  }

  const result = await reconstructElfFromBufferUncached({
    bufferAddress,
    upgradeSlot,
    upgradeSignature,
    programId,
    programDataAddress,
    versionLabel,
    onProgress,
  });

  setCachedElf(cacheKey, result.elf);
  logElfSummary(
    versionLabel,
    cacheKey,
    upgradeSignature,
    result.writeTxCount,
    result.elf,
    false
  );

  return { ...result, cacheKey };
}

/** Reconstruct the new ELF deployed by an upgrade transaction. */
export async function reconstructElfFromUpgrade(
  connection: Connection,
  upgradeSignature: string,
  expectedProgramId: string,
  versionLabel = "ELF"
): Promise<ReconstructionSuccess & { bufferAddress: string }> {
  const parsed = await parseUpgradeTransaction(connection, upgradeSignature);
  if (parsed.programId !== expectedProgramId) {
    throw new Error(
      `Upgrade tx program ${parsed.programId} does not match ${expectedProgramId}`
    );
  }

  const buffer = new PublicKey(parsed.bufferAddress);
  const result = await reconstructElfFromBuffer(
    connection,
    buffer,
    parsed.slot,
    upgradeSignature,
    versionLabel,
    undefined,
    {
      programId: parsed.programId,
      programDataAddress: parsed.programDataAddress,
    }
  );

  return {
    ...result,
    bufferAddress: parsed.bufferAddress,
  };
}

/** Pure helper exported for fixtures: assemble + validate from pre-parsed chunks. */
export function reconstructFromWriteChunks(
  chunks: OrderedWriteChunk[],
  meta: {
    programId: string;
    programDataAddress: string;
    bufferAddress: string;
    upgradeSignature: string;
    upgradeSlot: number;
  }
): ReconstructionSuccess {
  const assembled = assembleFromOrderedWrites(chunks);
  const elf = assertCompleteElf(assembled);
  const provenance = buildProvenance({
    programId: meta.programId,
    programDataAddress: meta.programDataAddress,
    bufferAddress: meta.bufferAddress,
    upgradeSignature: meta.upgradeSignature,
    upgradeSlot: meta.upgradeSlot,
    elf,
    writeTransactionCount: new Set(chunks.map((c) => c.signature)).size,
    writeChunkCount: chunks.length,
    coverageComplete: assembled.coverageComplete,
    coverageGaps: assembled.coverageGaps,
    overlapCount: assembled.overlaps.length,
    unexpectedOverlapCount: assembled.unexpectedOverlapCount,
    warnings: assembled.warnings,
    bounded: true,
    startKind: "first_write",
  });

  return {
    elf,
    writeTxCount: provenance.writeTransactionCount,
    writeChunkCount: chunks.length,
    slot: meta.upgradeSlot,
    cached: false,
    cacheKey: makeElfCacheKey(meta.bufferAddress, meta.upgradeSlot, meta.upgradeSignature),
    elfHash: elfContentHash(elf),
    provenance,
  };
}

export { ReconstructionError };
