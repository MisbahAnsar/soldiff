import type { DemoProgram } from "@/app/data/demos";
import { PublicKey } from "@solana/web3.js";
import {
  fetchBytecodeAtSlot,
  resolveProgramDataAddress,
  createConnection,
  elfToFetchedBytecode,
  type FetchedBytecode,
} from "./rpc";
import { reconstructElfFromBuffer } from "./buffer-reconstruct";
import { diffBytecode } from "./diff";
import {
  buildRuleContext,
  computeRiskScore,
  runRules,
  summarizeFindings,
} from "./rules";
import { buildBlastRadius } from "./blast";
import { assertUpgradeInRange, findUpgradeBoundaries, formatSlot } from "./upgrades";
import { resetRpcSession } from "./rpc-executor";
import { parseUpgradeTransaction } from "./upgrade-tx";

export interface SlotDiffRequest {
  programId: string;
  fromSlot: number;
  toSlot: number;
  label?: string;
}

export interface UpgradeDiffRequest {
  programId: string;
  upgradeSignature: string;
  prevUpgradeSignature: string;
  upgradeSlot?: number;
  prevUpgradeSlot?: number;
  label?: string;
}

export type DiffRequest = SlotDiffRequest | UpgradeDiffRequest;

export function isUpgradeDiffRequest(
  req: DiffRequest
): req is UpgradeDiffRequest {
  return "upgradeSignature" in req;
}

export async function runDiffPipeline(req: DiffRequest): Promise<DemoProgram> {
  if (isUpgradeDiffRequest(req)) {
    return runUpgradeDiffPipeline(req);
  }
  return runSlotDiffPipeline(req);
}

async function runUpgradeDiffPipeline(req: UpgradeDiffRequest): Promise<DemoProgram> {
  resetRpcSession();

  const label = req.label?.trim() || shortenProgramId(req.programId);
  const programIdStr = req.programId.trim();
  const sig = req.upgradeSignature.trim();
  const prevSig = req.prevUpgradeSignature.trim();
  const connection = createConnection();

  const newUpgrade = await parseUpgradeTransaction(connection, sig);
  const oldUpgrade = await parseUpgradeTransaction(connection, prevSig);

  if (
    programIdStr === newUpgrade.programDataAddress ||
    programIdStr === oldUpgrade.programDataAddress
  ) {
    throw new Error(
      `programId "${programIdStr}" is a ProgramData account, not a Program ID. ` +
        `Use ${newUpgrade.programId} instead (the executable program address from Solscan).`
    );
  }

  if (newUpgrade.programId !== programIdStr) {
    throw new Error(
      `Version B upgrade targets program ${newUpgrade.programId}, but you entered ${programIdStr}.`
    );
  }
  if (oldUpgrade.programId !== programIdStr) {
    throw new Error(
      `Version A upgrade targets program ${oldUpgrade.programId}, but you entered ${programIdStr}.`
    );
  }
  if (newUpgrade.programDataAddress !== oldUpgrade.programDataAddress) {
    throw new Error("The two upgrades reference different ProgramData accounts.");
  }

  const programDataAddress = newUpgrade.programDataAddress;
  const toSlot = req.upgradeSlot ?? newUpgrade.slot;
  const fromSlot = req.prevUpgradeSlot ?? oldUpgrade.slot;

  console.info(
    `[soldiff] Upgrade A: buffer=${oldUpgrade.bufferAddress} slot=${oldUpgrade.slot} sig=${prevSig.slice(0, 16)}…`
  );
  console.info(
    `[soldiff] Upgrade B: buffer=${newUpgrade.bufferAddress} slot=${newUpgrade.slot} sig=${sig.slice(0, 16)}…`
  );

  if (oldUpgrade.bufferAddress === newUpgrade.bufferAddress) {
    console.warn(
      `[soldiff] Warning: both upgrades reference the same buffer account ${oldUpgrade.bufferAddress}. ` +
        `ELF cache keys still differ by upgrade signature + slot.`
    );
  }

  const oldElf = await reconstructElfFromBuffer(
    connection,
    new PublicKey(oldUpgrade.bufferAddress),
    oldUpgrade.slot,
    prevSig,
    "Version A"
  );

  const newElf = await reconstructElfFromBuffer(
    connection,
    new PublicKey(newUpgrade.bufferAddress),
    newUpgrade.slot,
    sig,
    "Version B"
  );

  console.info(
    `[soldiff] Pre-diff verification: ` +
      `A hash=${oldElf.elfHash} (${oldElf.writeTxCount} writes, cached=${oldElf.cached}) ` +
      `B hash=${newElf.elfHash} (${newElf.writeTxCount} writes, cached=${newElf.cached})`
  );

  if (oldElf.elfHash === newElf.elfHash) {
    throw new Error(
      `Reconstructed bytecode is identical (elfHash=${oldElf.elfHash}). ` +
        `Version A cacheKey=${oldElf.cacheKey} · Version B cacheKey=${newElf.cacheKey}. ` +
        `If these upgrades should differ, verify the upgrade signatures on Solscan.`
    );
  }

  const newBin = elfToFetchedBytecode({
    elf: newElf.elf,
    programId: programIdStr,
    programDataAddress,
    slot: toSlot,
    anchorSignature: sig,
  });

  const oldBin = elfToFetchedBytecode({
    elf: oldElf.elf,
    programId: programIdStr,
    programDataAddress,
    slot: fromSlot,
    anchorSignature: prevSig,
  });

  if (oldBin.textHash === newBin.textHash) {
    throw new Error(
      `Reconstructed bytecode is identical between the selected upgrade and the previous one ` +
        `(elfHash A=${oldElf.elfHash} B=${newElf.elfHash}).`
    );
  }

  return buildReport({
    programId: programIdStr,
    label,
    fromSlot,
    toSlot,
    oldBin,
    newBin,
    upgradeSignature: sig,
    reconstructionNote: buildReconstructionNote(oldElf, newElf),
  });
}

async function runSlotDiffPipeline(req: SlotDiffRequest): Promise<DemoProgram> {
  resetRpcSession();

  if (req.fromSlot >= req.toSlot) {
    throw new Error("fromSlot must be less than toSlot");
  }

  const label = req.label?.trim() || shortenProgramId(req.programId);
  const connection = createConnection();
  const programData = await resolveProgramDataAddress(
    connection,
    new PublicKey(req.programId)
  );

  await assertUpgradeInRange(programData, req.fromSlot, req.toSlot);

  const oldBin = await fetchBytecodeAtSlot(req.programId, req.fromSlot);
  const newBin = await fetchBytecodeAtSlot(req.programId, req.toSlot);

  return buildReport({
    programId: req.programId,
    label,
    fromSlot: req.fromSlot,
    toSlot: req.toSlot,
    oldBin,
    newBin,
  });
}

function buildReport(params: {
  programId: string;
  label: string;
  fromSlot: number;
  toSlot: number;
  oldBin: FetchedBytecode;
  newBin: FetchedBytecode;
  upgradeSignature?: string;
  reconstructionNote?: string;
}): DemoProgram {
  const {
    programId,
    label,
    fromSlot,
    toSlot,
    oldBin,
    newBin,
    upgradeSignature,
    reconstructionNote,
  } = params;

  const instructionDiff = diffBytecode(oldBin.textSection, newBin.textSection);
  const accountDiff = diffBytecode(oldBin.rodataSection, newBin.rodataSection);

  const changedChunks = instructionDiff.filter(
    (l) => l.type === "added" || l.type === "removed"
  ).length;

  const ruleCtx = buildRuleContext(oldBin, newBin, changedChunks);
  const findings = runRules(ruleCtx);

  const newExternal = findings
    .filter((f) => f.code === "NEW_EXTERNAL_PROGRAM")
    .map((f) => f.after ?? "")
    .filter(Boolean);

  const { nodes, edges } = buildBlastRadius(oldBin, newBin, newExternal);

  const summary = summarizeFindings(findings);
  const riskScore = computeRiskScore(findings);

  const sigNote = upgradeSignature
    ? ` · upgrade ${upgradeSignature.slice(0, 8)}…`
    : "";
  const reconNote = reconstructionNote ? ` (${reconstructionNote})` : "";

  return {
    id: `live-${programId.slice(0, 8)}`,
    name: label,
    programId,
    fromSlot,
    toSlot,
    fromDate: `slot ${formatSlot(oldBin.slot)}`,
    toDate: `slot ${formatSlot(newBin.slot)}`,
    description: `Live diff — ${changedChunks} bytecode chunk(s) changed${sigNote}${reconNote}`,
    riskScore,
    findings,
    instructionDiff,
    accountDiff,
    blastNodes: nodes,
    blastEdges: edges,
    summary,
  };
}

function shortenProgramId(id: string): string {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function buildReconstructionNote(
  oldElf: { writeTxCount: number; cached: boolean },
  newElf: { writeTxCount: number; cached: boolean }
): string {
  if (oldElf.cached && newElf.cached) {
    return "ELF from cache (0 RPC fetches)";
  }
  const parts: string[] = [];
  if (!oldElf.cached && oldElf.writeTxCount > 0) {
    parts.push(`${oldElf.writeTxCount} Write txs (before)`);
  }
  if (!newElf.cached && newElf.writeTxCount > 0) {
    parts.push(`${newElf.writeTxCount} Write txs (after)`);
  }
  const cachedParts: string[] = [];
  if (oldElf.cached) cachedParts.push("before cached");
  if (newElf.cached) cachedParts.push("after cached");
  if (cachedParts.length > 0) parts.push(cachedParts.join(" + "));
  return parts.length > 0
    ? `${parts.join(", ")} via Alchemy`
    : "ELF reconstructed via Alchemy";
}
