#!/usr/bin/env bun
/**
 * Deep-check deployment cycle for one upgrade signature.
 * Usage: bun run scripts/probe-cycle.ts <UPGRADE_SIGNATURE>
 */

import { PublicKey } from "@solana/web3.js";
import { createConnection } from "../lib/soldiff/rpc";
import { parseUpgradeTransaction } from "../lib/soldiff/upgrade-tx";
import {
  resetRpcSession,
  rpcGetSignaturesForAddress,
  rpcGetTransaction,
} from "../lib/soldiff/rpc-executor";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  LOADER_IX_CLOSE,
  LOADER_IX_INITIALIZE_BUFFER,
  LOADER_IX_UPGRADE,
  LOADER_IX_WRITE,
} from "../lib/soldiff/constants";
import { instructionDataToBuffer } from "../lib/soldiff/ix-data";
import { transactionAccountKeys, transactionTopInstructions } from "../lib/soldiff/tx-keys";
import { selectDeploymentCycleChunks } from "../lib/soldiff/buffer-reconstruct";
import type { OrderedWriteChunk } from "../lib/soldiff/types";
import { assembleFromOrderedWrites, assertCompleteElf } from "../lib/soldiff/assemble";
import { sha256Hex } from "../lib/soldiff/hash";

const upgradeSig = process.argv[2];
if (!upgradeSig) {
  console.error("Usage: bun run scripts/probe-cycle.ts <UPGRADE_SIGNATURE>");
  process.exit(1);
}

resetRpcSession();
const connection = createConnection();

type Classified = {
  signature: string;
  slot: number;
  transactionIndex: number | null;
  kinds: Array<"initialize_buffer" | "write" | "upgrade" | "close" | "other">;
  writeChunks: OrderedWriteChunk[];
};

async function main() {
  const parsed = await parseUpgradeTransaction(connection, upgradeSig);
  console.log(`program=${parsed.programId}`);
  console.log(`buffer=${parsed.bufferAddress} slot=${parsed.slot}`);

  const buf = new PublicKey(parsed.bufferAddress);
  const entries: { signature: string; slot: number }[] = [];
  let before: string | undefined;
  for (let page = 0; page < 20; page++) {
    const batch = await rpcGetSignaturesForAddress(buf, { limit: 1000, before });
    if (batch.length === 0) break;
    for (const e of batch) {
      if (e.err) continue;
      if (e.slot > parsed.slot) continue;
      entries.push({ signature: e.signature, slot: e.slot });
    }
    const oldest = batch[batch.length - 1];
    if (oldest.slot < parsed.slot - 250_000) break;
    before = oldest.signature;
    if (batch.length < 1000) break;
  }
  console.log(`history entries: ${entries.length}`);

  const classified: Classified[] = [];
  let initCount = 0;
  let writeTx = 0;
  let closeCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const { signature, slot } = entries[i];
    const tx = await rpcGetTransaction(signature);
    if (!tx) continue;
    const keys = transactionAccountKeys(tx);
    const loader = BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58();
    const kinds = new Set<Classified["kinds"][number]>();
    const writeChunks: OrderedWriteChunk[] = [];

    const visit = (
      ix: { programIdIndex: number; accounts: number[]; data: string | Uint8Array | Buffer },
      instructionIndex: number,
      innerInstructionIndex: number | null
    ) => {
      if (keys[ix.programIdIndex] !== loader) return;
      if (!ix.accounts.some((idx) => keys[idx] === parsed.bufferAddress)) return;
      const raw = instructionDataToBuffer(ix.data);
      if (raw.length < 4) return;
      const d = raw.readUInt32LE(0);
      if (d === LOADER_IX_INITIALIZE_BUFFER) kinds.add("initialize_buffer");
      else if (d === LOADER_IX_WRITE) {
        kinds.add("write");
        if (raw.length >= 12) {
          const offset = raw.readUInt32LE(4);
          const len = raw.readUInt32LE(8);
          if (len > 0 && 12 + len <= raw.length) {
            writeChunks.push({
              slot: tx.slot,
              transactionIndex: null,
              signature,
              instructionIndex,
              innerInstructionIndex,
              offset,
              bytes: Buffer.from(raw.subarray(12, 12 + len)),
            });
          }
        }
      } else if (d === LOADER_IX_UPGRADE) kinds.add("upgrade");
      else if (d === LOADER_IX_CLOSE) kinds.add("close");
      else kinds.add("other");
    };

    const top = transactionTopInstructions(tx);
    for (let ti = 0; ti < top.length; ti++) visit(top[ti], ti, null);
    for (const g of tx.meta?.innerInstructions ?? []) {
      for (let j = 0; j < g.instructions.length; j++) visit(g.instructions[j], g.index, j);
    }

    const kindArr = [...kinds];
    if (kindArr.includes("initialize_buffer")) initCount++;
    if (kindArr.includes("write")) writeTx++;
    if (kindArr.includes("close")) closeCount++;
    classified.push({
      signature,
      slot: tx.slot ?? slot,
      transactionIndex: null,
      kinds: kindArr,
      writeChunks,
    });

    if ((i + 1) % 25 === 0 || i + 1 === entries.length) {
      console.log(`fetched ${i + 1}/${entries.length} init=${initCount} writeTx=${writeTx} close=${closeCount}`);
    }
  }

  console.log(`totals: init=${initCount} writeTx=${writeTx} close=${closeCount}`);

  try {
    const cycle = selectDeploymentCycleChunks(classified, upgradeSig, parsed.slot);
    console.log(`CYCLE OK bounded=${cycle.bounded} startKind=${cycle.startKind} startSig=${cycle.startSignature}`);
    console.log(`cycle writeTxCount=${cycle.writeTransactionCount} chunks=${cycle.chunks.length}`);
    const assembled = assembleFromOrderedWrites(cycle.chunks);
    console.log(`coverageComplete=${assembled.coverageComplete} gaps=${assembled.coverageGaps.length} unexpectedOverlaps=${assembled.unexpectedOverlapCount}`);
    if (assembled.coverageGaps.length) {
      console.log(`first gaps:`, assembled.coverageGaps.slice(0, 5));
    }
    const elf = assertCompleteElf(assembled);
    console.log(`ELF ok size=${elf.length} sha256=${sha256Hex(elf)}`);
  } catch (err) {
    console.error(`CYCLE/ASSEMBLE FAIL:`, err instanceof Error ? err.message : err);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
