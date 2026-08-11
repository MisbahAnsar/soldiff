#!/usr/bin/env bun
/**
 * Scan recent BPF Upgradeable Loader activity for case-study candidates.
 * Avoids getProgramAccounts (often 429). No secrets printed.
 */

import { PublicKey } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  PROGRAM_DATA_HEADER_SIZE,
} from "../lib/soldiff/constants";
import {
  resetRpcSession,
  rpcGetAccountInfo,
  rpcGetSignaturesForAddress,
  rpcGetSlot,
} from "../lib/soldiff/rpc-executor";
import { parseUpgradeTransaction } from "../lib/soldiff/upgrade-tx";
import { createConnection } from "../lib/soldiff/rpc";

const MAX_SIGS = Number(process.argv[2] ?? 400);
const MAX_SIZE = Number(process.argv[3] ?? 200_000);

resetRpcSession();
const connection = createConnection();

async function main() {
  const currentSlot = await rpcGetSlot();
  console.log(`currentSlot=${currentSlot} scanning=${MAX_SIGS} maxElf=${MAX_SIZE}`);

  const sigs: { signature: string; slot: number }[] = [];
  let before: string | undefined;
  while (sigs.length < MAX_SIGS) {
    const page = await rpcGetSignaturesForAddress(BPF_LOADER_UPGRADEABLE_PROGRAM_ID, {
      limit: Math.min(1000, MAX_SIGS - sigs.length),
      before,
    });
    if (page.length === 0) break;
    for (const row of page) {
      if (row.err) continue;
      sigs.push({ signature: row.signature, slot: row.slot });
    }
    before = page[page.length - 1]?.signature;
    if (!before) break;
  }
  console.log(`loader signatures collected: ${sigs.length}`);

  const byProgram = new Map<
    string,
    { programData: string; upgrades: { sig: string; slot: number; buffer: string }[] }
  >();

  for (let i = 0; i < sigs.length; i++) {
    try {
      const p = await parseUpgradeTransaction(connection, sigs[i].signature);
      let entry = byProgram.get(p.programId);
      if (!entry) {
        entry = { programData: p.programDataAddress, upgrades: [] };
        byProgram.set(p.programId, entry);
      }
      if (!entry.upgrades.some((u) => u.sig === p.signature)) {
        entry.upgrades.push({
          sig: p.signature,
          slot: p.slot,
          buffer: p.bufferAddress,
        });
      }
    } catch {
      // not an Upgrade
    }
    if ((i + 1) % 50 === 0) console.log(`parsed ${i + 1}/${sigs.length} programs=${byProgram.size}`);
  }

  const candidates: Array<{
    programId: string;
    size: number;
    a: { sig: string; slot: number; buffer: string };
    b: { sig: string; slot: number; buffer: string };
    distinctBuffers: boolean;
  }> = [];

  for (const [programId, entry] of byProgram) {
    if (entry.upgrades.length < 2) continue;
    const sorted = [...entry.upgrades].sort((a, b) => a.slot - b.slot);
    // take two most recent in this scan window
    const a = sorted[sorted.length - 2];
    const b = sorted[sorted.length - 1];
    if (a.slot >= b.slot) continue;

    let size = -1;
    try {
      const pd = await rpcGetAccountInfo(new PublicKey(entry.programData));
      if (pd?.data) size = Math.max(0, pd.data.length - PROGRAM_DATA_HEADER_SIZE);
    } catch {
      continue;
    }
    if (size <= 0 || size > MAX_SIZE) continue;

    // confirm program account exists / upgradeable
    try {
      const prog = await rpcGetAccountInfo(new PublicKey(programId));
      if (!prog || !prog.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) continue;
    } catch {
      continue;
    }

    candidates.push({
      programId,
      size,
      a,
      b,
      distinctBuffers: a.buffer !== b.buffer,
    });
  }

  candidates.sort((x, y) => x.size - y.size);
  console.log(`\nCandidates with >=2 upgrades and elf<=${MAX_SIZE}: ${candidates.length}`);
  for (const c of candidates.slice(0, 15)) {
    console.log(
      JSON.stringify({
        programId: c.programId,
        size: c.size,
        slotA: c.a.slot,
        slotB: c.b.slot,
        distinctBuffers: c.distinctBuffers,
        bufferA: c.a.buffer,
        bufferB: c.b.buffer,
        from: c.a.sig,
        to: c.b.sig,
      })
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
