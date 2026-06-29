import type { DemoProgram } from "@/app/data/demos";
import { PublicKey } from "@solana/web3.js";
import {
  fetchBytecodeAtSlot,
  resolveProgramDataAddress,
  createConnection,
  elfToFetchedBytecode,
  type FetchedBytecode,
} from "./rpc";
import { reconstructElfFromUpgrade } from "./buffer-reconstruct";
import { diffBytecode } from "./diff";
import {
  buildRuleContext,
  computeRiskScore,
  runRules,
  summarizeFindings,
} from "./rules";
import { buildBlastRadius } from "./blast";
import { assertUpgradeInRange, findUpgradeBoundaries, formatSlot } from "./upgrades";

export interface SlotDiffRequest {
  programId: string;
  fromSlot: number;
  toSlot: number;
  label?: string;
}

export interface UpgradeDiffRequest {
  programId: string;
  upgradeSignature: string;
  upgradeSlot?: number;
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
  const label = req.label?.trim() || shortenProgramId(req.programId);
  const sig = req.upgradeSignature.trim();
  const connection = createConnection();
  const programData = await resolveProgramDataAddress(
    connection,
    new PublicKey(req.programId)
  );
  const programDataAddress = programData.toBase58();

  const upgrades = await findUpgradeBoundaries(programData, connection);
  const idx = upgrades.findIndex((u) => u.signature === sig);
  if (idx < 0) {
    throw new Error("Upgrade signature not found in ProgramData transaction history.");
  }
  const previous = upgrades[idx + 1];

  if (!previous) {
    throw new Error(
      "This is the earliest indexed upgrade for this program — there is no prior on-chain version to diff against."
    );
  }

  const newElf = await reconstructElfFromUpgrade(connection, sig, req.programId);
  const oldElf = await reconstructElfFromUpgrade(
    connection,
    previous.signature,
    req.programId
  );

  const newBin = elfToFetchedBytecode({
    elf: newElf.elf,
    programId: req.programId,
    programDataAddress,
    slot: upgrades[idx]?.slot ?? newElf.slot,
    anchorSignature: sig,
  });

  const oldBin = elfToFetchedBytecode({
    elf: oldElf.elf,
    programId: req.programId,
    programDataAddress,
    slot: previous.slot,
    anchorSignature: previous.signature,
  });

  if (oldBin.textHash === newBin.textHash) {
    throw new Error(
      "Reconstructed bytecode is identical between the selected upgrade and the previous one."
    );
  }

  return buildReport({
    programId: req.programId,
    label,
    fromSlot: previous.slot,
    toSlot: upgrades[idx]?.slot ?? req.upgradeSlot ?? newElf.slot,
    oldBin,
    newBin,
    upgradeSignature: sig,
    reconstructionNote: `${oldElf.writeTxCount + newElf.writeTxCount} Write txs reconstructed via Alchemy`,
  });
}

async function runSlotDiffPipeline(req: SlotDiffRequest): Promise<DemoProgram> {
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

  const [oldBin, newBin] = await Promise.all([
    fetchBytecodeAtSlot(req.programId, req.fromSlot),
    fetchBytecodeAtSlot(req.programId, req.toSlot),
  ]);

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
