import { type Connection, PublicKey } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  BUFFER_HEADER_SIZE,
  LOADER_IX_WRITE,
} from "./constants";
import { instructionDataToBuffer } from "./ix-data";
import { transactionAccountKeys, transactionTopInstructions } from "./tx-keys";
import { parseUpgradeTransaction } from "./upgrade-tx";

type WriteChunk = {
  offset: number;
  bytes: Buffer;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWriteChunks(
  tx: NonNullable<Awaited<ReturnType<Connection["getTransaction"]>>>,
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

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

/** List successful Write txs for a buffer account strictly before the Upgrade tx slot. */
export async function collectBufferWriteSignatures(
  connection: Connection,
  bufferAddress: PublicKey,
  upgradeSlot: number,
  excludeSignature?: string
): Promise<string[]> {
  const signatures: string[] = [];
  let before: string | undefined;

  for (let page = 0; page < 50; page++) {
    const batch = await connection.getSignaturesForAddress(bufferAddress, {
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
    if (oldest.slot < upgradeSlot - 5_000_000) break;

    before = oldest.signature;
    if (batch.length < 1000) break;
  }

  return signatures;
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

/** Reconstruct BPF ELF uploaded into a buffer via Write instructions (Alchemy archival getTransaction). */
export async function reconstructElfFromBuffer(
  connection: Connection,
  bufferAddress: PublicKey,
  upgradeSlot: number,
  excludeSignature?: string
): Promise<{ elf: Buffer; writeTxCount: number; slot: number }> {
  const sigs = await collectBufferWriteSignatures(
    connection,
    bufferAddress,
    upgradeSlot,
    excludeSignature
  );

  if (sigs.length === 0) {
    throw new Error(
      `No Write transactions found for buffer ${bufferAddress.toBase58()} before slot ${upgradeSlot}`
    );
  }

  const allChunks: WriteChunk[] = [];

  await mapPool(sigs, 2, async (signature) => {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx) return;
    allChunks.push(...parseWriteChunks(tx, bufferAddress.toBase58()));
    await sleep(50);
  });

  const elf = assembleElf(allChunks);

  return {
    elf,
    writeTxCount: sigs.length,
    slot: upgradeSlot - 1,
  };
}

/** Reconstruct the new ELF deployed by an upgrade transaction. */
export async function reconstructElfFromUpgrade(
  connection: Connection,
  upgradeSignature: string,
  expectedProgramId: string
): Promise<{ elf: Buffer; slot: number; writeTxCount: number; bufferAddress: string }> {
  const parsed = await parseUpgradeTransaction(connection, upgradeSignature);
  if (parsed.programId !== expectedProgramId) {
    throw new Error(
      `Upgrade tx program ${parsed.programId} does not match ${expectedProgramId}`
    );
  }

  const buffer = new PublicKey(parsed.bufferAddress);
  const { elf, writeTxCount, slot } = await reconstructElfFromBuffer(
    connection,
    buffer,
    parsed.slot,
    upgradeSignature
  );

  return {
    elf,
    slot,
    writeTxCount,
    bufferAddress: parsed.bufferAddress,
  };
}
