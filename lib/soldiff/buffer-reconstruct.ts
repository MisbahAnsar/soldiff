import { type Connection, PublicKey } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  BUFFER_HEADER_SIZE,
  LOADER_IX_WRITE,
} from "./constants";
import {
  elfContentHash,
  getCachedElf,
  makeElfCacheKey,
  setCachedElf,
} from "./elf-cache";
import { instructionDataToBuffer } from "./ix-data";
import { getRpcStats, rpcGetSignaturesForAddress, rpcGetTransaction } from "./rpc-executor";
import { transactionAccountKeys, transactionTopInstructions } from "./tx-keys";
import { parseUpgradeTransaction } from "./upgrade-tx";

type WriteChunk = {
  offset: number;
  bytes: Buffer;
};

const MAX_SIG_PAGES = 15;

export interface ReconstructProgress {
  fetched: number;
  total: number;
}

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

function parseWriteChunks(
  tx: NonNullable<Awaited<ReturnType<typeof rpcGetTransaction>>>,
  bufferAddress: string
): WriteChunk[] {
  const keys = transactionAccountKeys(tx);
  const loader = BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58();
  const chunks: WriteChunk[] = [];

  const tryIx = (ix: {
    programIdIndex: number;
    accounts: number[];
    data: string | Uint8Array | Buffer;
  }) => {
    if (keys[ix.programIdIndex] !== loader) return;
    if (!ix.accounts.some((i) => keys[i] === bufferAddress)) return;

    const raw = instructionDataToBuffer(ix.data);
    if (raw.length < 12 || raw.readUInt32LE(0) !== LOADER_IX_WRITE) return;

    const offset = raw.readUInt32LE(4);
    const len = raw.readUInt32LE(8);
    if (len <= 0 || 12 + len > raw.length) return;

    chunks.push({ offset, bytes: raw.subarray(12, 12 + len) });
  };

  const top = transactionTopInstructions(tx);
  for (const ix of top) tryIx(ix);
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) tryIx(ix);
  }

  return chunks;
}

/** List successful Write txs for a buffer account strictly before the Upgrade tx slot. */
export async function collectBufferWriteSignatures(
  bufferAddress: PublicKey,
  upgradeSlot: number,
  excludeSignature?: string
): Promise<string[]> {
  const signatures: string[] = [];
  let before: string | undefined;

  for (let page = 0; page < MAX_SIG_PAGES; page++) {
    const batch = await rpcGetSignaturesForAddress(bufferAddress, {
      limit: 1000,
      before,
    });
    if (batch.length === 0) break;

    for (const entry of batch) {
      if (entry.err) continue;
      if (entry.slot >= upgradeSlot) continue;
      if (excludeSignature && entry.signature === excludeSignature) continue;
      signatures.push(entry.signature);
    }

    const oldest = batch[batch.length - 1];
    if (oldest.slot < upgradeSlot - 250_000) break;

    before = oldest.signature;
    if (batch.length < 1000) break;
  }

  return signatures;
}

async function fetchWriteChunksSequential(
  signatures: string[],
  bufferAddress: string,
  versionLabel: string,
  onProgress?: (p: ReconstructProgress) => void
): Promise<WriteChunk[]> {
  const allChunks: WriteChunk[] = [];
  const total = signatures.length;

  console.info(`[soldiff] ${versionLabel}: ${total} write txs to fetch`);

  for (let i = 0; i < signatures.length; i++) {
    const tx = await rpcGetTransaction(signatures[i]);
    if (tx) {
      allChunks.push(...parseWriteChunks(tx, bufferAddress));
    }

    const completed = i + 1;
    if (completed === 1 || completed % 10 === 0 || completed === total) {
      const stats = getRpcStats();
      console.info(
        `[soldiff] Fetching write tx ${completed}/${total} ` +
          `(elapsed ${stats.elapsedSec}s, retries ${stats.retryCount}, active ${stats.activeCount})`
      );
    }

    onProgress?.({ fetched: completed, total });
  }

  return allChunks;
}

function assembleElf(chunks: WriteChunk[]): Buffer {
  if (chunks.length === 0) {
    throw new Error("No Write instruction chunks found for buffer account");
  }

  let maxEnd = 0;
  for (const c of chunks) {
    maxEnd = Math.max(maxEnd, c.offset + c.bytes.length);
  }

  const buf = Buffer.alloc(maxEnd);
  for (const c of chunks) {
    c.bytes.copy(buf, c.offset);
  }

  const elfOffset = buf.indexOf("\x7fELF", 0, "ascii");
  if (elfOffset >= 0) {
    return buf.subarray(elfOffset);
  }

  if (buf.length > BUFFER_HEADER_SIZE) {
    return buf.subarray(BUFFER_HEADER_SIZE);
  }

  throw new Error("Reconstructed buffer does not contain a valid ELF header");
}

async function reconstructElfFromBufferUncached(
  bufferAddress: PublicKey,
  upgradeSlot: number,
  upgradeSignature: string,
  versionLabel: string,
  onProgress?: (p: ReconstructProgress) => void
): Promise<{ elf: Buffer; writeTxCount: number; slot: number }> {
  const bufferKey = bufferAddress.toBase58();
  console.info(
    `[soldiff] ${versionLabel}: collecting Write sigs for buffer ${bufferKey} ` +
      `(upgrade slot ${upgradeSlot}, sig ${upgradeSignature.slice(0, 16)}…)`
  );

  const sigs = await collectBufferWriteSignatures(
    bufferAddress,
    upgradeSlot,
    upgradeSignature
  );

  if (sigs.length === 0) {
    throw new Error(
      `No Write transactions found for buffer ${bufferKey} before slot ${upgradeSlot}`
    );
  }

  console.info(`[soldiff] ${versionLabel}: ${sigs.length} Write txs found`);

  const allChunks = await fetchWriteChunksSequential(
    sigs,
    bufferKey,
    versionLabel,
    onProgress
  );

  const elf = assembleElf(allChunks);

  return {
    elf,
    writeTxCount: sigs.length,
    slot: upgradeSlot - 1,
  };
}

/** Reconstruct BPF ELF uploaded into a buffer via Write instructions. */
export async function reconstructElfFromBuffer(
  _connection: Connection,
  bufferAddress: PublicKey,
  upgradeSlot: number,
  upgradeSignature: string,
  versionLabel = "ELF",
  onProgress?: (p: ReconstructProgress) => void
): Promise<{
  elf: Buffer;
  writeTxCount: number;
  slot: number;
  cached: boolean;
  cacheKey: string;
  elfHash: string;
}> {
  const bufferKey = bufferAddress.toBase58();
  const cacheKey = makeElfCacheKey(bufferKey, upgradeSlot, upgradeSignature);
  const hit = getCachedElf(cacheKey);

  if (hit) {
    logElfSummary(versionLabel, cacheKey, upgradeSignature, 0, hit, true);
    return {
      elf: hit,
      writeTxCount: 0,
      slot: upgradeSlot - 1,
      cached: true,
      cacheKey,
      elfHash: elfContentHash(hit),
    };
  }

  const result = await reconstructElfFromBufferUncached(
    bufferAddress,
    upgradeSlot,
    upgradeSignature,
    versionLabel,
    onProgress
  );

  setCachedElf(cacheKey, result.elf);
  logElfSummary(
    versionLabel,
    cacheKey,
    upgradeSignature,
    result.writeTxCount,
    result.elf,
    false
  );

  return {
    ...result,
    cached: false,
    cacheKey,
    elfHash: elfContentHash(result.elf),
  };
}

/** Reconstruct the new ELF deployed by an upgrade transaction. */
export async function reconstructElfFromUpgrade(
  connection: Connection,
  upgradeSignature: string,
  expectedProgramId: string,
  versionLabel = "ELF"
): Promise<{
  elf: Buffer;
  slot: number;
  writeTxCount: number;
  bufferAddress: string;
  cached: boolean;
  cacheKey: string;
  elfHash: string;
}> {
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
    versionLabel
  );

  return {
    elf: result.elf,
    slot: result.slot,
    writeTxCount: result.writeTxCount,
    bufferAddress: parsed.bufferAddress,
    cached: result.cached,
    cacheKey: result.cacheKey,
    elfHash: result.elfHash,
  };
}
