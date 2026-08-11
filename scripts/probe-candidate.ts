#!/usr/bin/env bun
/**
 * Probe a program for case-study suitability. No secrets printed.
 * Usage: bun run scripts/probe-candidate.ts <PROGRAM_ID> [maxUpgrades=8]
 */

import { PublicKey } from "@solana/web3.js";
import { createConnection, resolveProgramDataAddress } from "../lib/soldiff/rpc";
import { findUpgradeBoundaries } from "../lib/soldiff/upgrades";
import { parseUpgradeTransaction } from "../lib/soldiff/upgrade-tx";
import { resetRpcSession, rpcGetAccountInfo, rpcGetSignaturesForAddress, rpcGetTransaction } from "../lib/soldiff/rpc-executor";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  LOADER_IX_CLOSE,
  LOADER_IX_INITIALIZE_BUFFER,
  LOADER_IX_UPGRADE,
  LOADER_IX_WRITE,
} from "../lib/soldiff/constants";
import { instructionDataToBuffer } from "../lib/soldiff/ix-data";
import { transactionAccountKeys, transactionTopInstructions } from "../lib/soldiff/tx-keys";

const programId = process.argv[2];
const maxUpgrades = Number(process.argv[3] ?? 8);
if (!programId) {
  console.error("Usage: bun run scripts/probe-candidate.ts <PROGRAM_ID>");
  process.exit(1);
}

resetRpcSession();
const connection = createConnection();

async function classifyBufferTx(sig: string, buffer: string) {
  const tx = await rpcGetTransaction(sig);
  if (!tx) return { sig, missing: true as const };
  const keys = transactionAccountKeys(tx);
  const loader = BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58();
  const kinds = new Set<string>();
  let writeChunks = 0;
  const visit = (ix: { programIdIndex: number; accounts: number[]; data: string | Uint8Array | Buffer }) => {
    if (keys[ix.programIdIndex] !== loader) return;
    if (!ix.accounts.some((i) => keys[i] === buffer)) return;
    const raw = instructionDataToBuffer(ix.data);
    if (raw.length < 4) return;
    const d = raw.readUInt32LE(0);
    if (d === LOADER_IX_INITIALIZE_BUFFER) kinds.add("InitializeBuffer");
    else if (d === LOADER_IX_WRITE) {
      kinds.add("Write");
      writeChunks++;
    } else if (d === LOADER_IX_UPGRADE) kinds.add("Upgrade");
    else if (d === LOADER_IX_CLOSE) kinds.add("Close");
  };
  for (const ix of transactionTopInstructions(tx)) visit(ix);
  for (const g of tx.meta?.innerInstructions ?? []) for (const ix of g.instructions) visit(ix);
  return { sig, slot: tx.slot, kinds: [...kinds], writeChunks, missing: false as const };
}

async function probeUpgrade(label: string, signature: string) {
  const parsed = await parseUpgradeTransaction(connection, signature);
  console.log(`\n[${label}]`);
  console.log(`  signature: ${signature}`);
  console.log(`  slot: ${parsed.slot}`);
  console.log(`  program: ${parsed.programId}`);
  console.log(`  programData: ${parsed.programDataAddress}`);
  console.log(`  buffer: ${parsed.bufferAddress}`);

  const buf = new PublicKey(parsed.bufferAddress);
  const info = await rpcGetAccountInfo(buf);
  console.log(`  buffer account exists now: ${Boolean(info)}`);

  // Collect recent buffer history
  const entries: { signature: string; slot: number }[] = [];
  let before: string | undefined;
  for (let page = 0; page < 5; page++) {
    const batch = await rpcGetSignaturesForAddress(buf, { limit: 200, before });
    if (batch.length === 0) break;
    for (const e of batch) {
      if (e.err) continue;
      if (e.slot > parsed.slot) continue;
      entries.push({ signature: e.signature, slot: e.slot });
    }
    const oldest = batch[batch.length - 1];
    if (oldest.slot < parsed.slot - 250_000) break;
    before = oldest.signature;
    if (batch.length < 200) break;
  }
  console.log(`  buffer history entries (<= upgrade slot): ${entries.length}`);

  // Classify up to 40 most recent (newest-first from RPC; we want near upgrade)
  const near = entries.slice(0, 40);
  let init = 0, writes = 0, writeChunks = 0, upgrades = 0, closes = 0, missing = 0;
  const kindLog: string[] = [];
  for (const e of near) {
    const c = await classifyBufferTx(e.signature, parsed.bufferAddress);
    if (c.missing) {
      missing++;
      continue;
    }
    if (c.kinds.includes("InitializeBuffer")) init++;
    if (c.kinds.includes("Write")) {
      writes++;
      writeChunks += c.writeChunks;
    }
    if (c.kinds.includes("Upgrade")) upgrades++;
    if (c.kinds.includes("Close")) closes++;
    if (c.kinds.length) {
      kindLog.push(`slot ${c.slot} ${c.sig.slice(0, 8)}… [${c.kinds.join(",")}] writes=${c.writeChunks}`);
    }
  }
  console.log(`  classified (first ${near.length}): init=${init} writeTxs=${writes} writeChunks=${writeChunks} upgrades=${upgrades} closes=${closes} missingTx=${missing}`);
  for (const line of kindLog.slice(0, 15)) console.log(`    ${line}`);
  return parsed;
}

async function main() {
  console.log(`Probing program ${programId}`);
  const pk = new PublicKey(programId);
  const acct = await rpcGetAccountInfo(pk);
  if (!acct) throw new Error("Program account not found");
  console.log(`owner=${acct.owner.toBase58()}`);
  console.log(`upgradeableLoader=${acct.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)}`);
  console.log(`dataLen=${acct.data.length}`);

  const programData = await resolveProgramDataAddress(connection, pk);
  console.log(`programData=${programData.toBase58()}`);
  const pd = await rpcGetAccountInfo(programData);
  console.log(`programDataLen=${pd?.data.length ?? 0} (elfApprox=${Math.max(0, (pd?.data.length ?? 0) - 45)})`);

  const upgrades = await findUpgradeBoundaries(programData, connection);
  console.log(`\nVerified upgrades found: ${upgrades.length}`);
  for (const u of upgrades.slice(0, maxUpgrades)) {
    console.log(`  slot=${u.slot} sig=${u.signature}`);
  }

  if (upgrades.length < 2) {
    console.log("REJECT: fewer than 2 upgrades");
    return;
  }

  // upgrades returned newest-first typically
  const sorted = [...upgrades].sort((a, b) => a.slot - b.slot);
  // pick two most recent adjacent
  const a = sorted[sorted.length - 2];
  const b = sorted[sorted.length - 1];
  console.log(`\nAdjacent pair under test: A slot ${a.slot} → B slot ${b.slot}`);
  const pa = await probeUpgrade("A", a.signature);
  const pb = await probeUpgrade("B", b.signature);
  console.log(`\nslotA < slotB: ${pa.slot < pb.slot}`);
  console.log(`same program: ${pa.programId === pb.programId && pa.programId === programId}`);
  console.log(`same programData: ${pa.programDataAddress === pb.programDataAddress}`);
  console.log(`distinct buffers: ${pa.bufferAddress !== pb.bufferAddress}`);
  console.log(`\nSUGGESTED CLI:`);
  console.log(`bun run case-study --program ${programId} --from ${a.signature} --to ${b.signature} --out case-study/probe/ --label probe`);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
