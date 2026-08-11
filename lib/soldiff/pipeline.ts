import type { DemoProgram, DiffLine } from "@/app/data/demos";
import { PublicKey } from "@solana/web3.js";
import {
  fetchBytecodeAtSlot,
  resolveProgramDataAddress,
  createConnection,
  elfToFetchedBytecode,
  type FetchedBytecode,
} from "./rpc";
import { reconstructElfFromBuffer } from "./buffer-reconstruct";
import { countChangedChunks, diffBytecode } from "./diff";
import {
  applyInstructionDiffSummary,
  buildRuleContext,
  computeObservedChangeScore,
  runRules,
  summarizeFindings,
} from "./rules";
import { buildBlastRadius } from "./blast";
import { assertUpgradeInRange, formatSlot } from "./upgrades";
import { resetRpcSession } from "./rpc-executor";
import { parseUpgradeTransaction } from "./upgrade-tx";
import {
  detectProgramFramework,
  diffAnchorIdls,
  fetchCurrentAnchorIdl,
  resolveHistoricalIdl,
  type IdlFetchResult,
} from "./anchor-idl";
import {
  disassembleArtifact,
  diffNormalizedInstructions,
} from "./disassemble";
import type {
  AnalysisReport,
  Finding,
  VersionArtifact,
} from "./types";

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

/** Run pipeline and return UI-compatible DemoProgram (AnalysisReport ⊆ shape). */
export async function runDiffPipeline(req: DiffRequest): Promise<DemoProgram> {
  const report = await runAnalysisPipeline(req);
  return toDemoProgram(report);
}

export async function runAnalysisPipeline(req: DiffRequest): Promise<AnalysisReport> {
  if (isUpgradeDiffRequest(req)) {
    return runUpgradeAnalysis(req);
  }
  return runSlotAnalysis(req);
}

async function runUpgradeAnalysis(req: UpgradeDiffRequest): Promise<AnalysisReport> {
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

  const slotA = oldUpgrade.slot;
  const slotB = newUpgrade.slot;
  if (slotA >= slotB) {
    throw new Error(
      `Version ordering invalid: Version A slot (${slotA}) must be less than Version B slot (${slotB}). ` +
        `Swap the signatures so Version A is the older upgrade.`
    );
  }

  // Optional caller-supplied slots must not reverse or contradict parsed order
  if (req.prevUpgradeSlot !== undefined && req.prevUpgradeSlot !== slotA) {
    console.warn(
      `[soldiff] Ignoring prevUpgradeSlot=${req.prevUpgradeSlot}; using parsed slot ${slotA}`
    );
  }
  if (req.upgradeSlot !== undefined && req.upgradeSlot !== slotB) {
    console.warn(
      `[soldiff] Ignoring upgradeSlot=${req.upgradeSlot}; using parsed slot ${slotB}`
    );
  }

  const programDataAddress = newUpgrade.programDataAddress;

  console.info(
    `[soldiff] Upgrade A: buffer=${oldUpgrade.bufferAddress} slot=${slotA} sig=${prevSig.slice(0, 16)}…`
  );
  console.info(
    `[soldiff] Upgrade B: buffer=${newUpgrade.bufferAddress} slot=${slotB} sig=${sig.slice(0, 16)}…`
  );

  if (oldUpgrade.bufferAddress === newUpgrade.bufferAddress) {
    console.warn(
      `[soldiff] Warning: both upgrades reference the same buffer account ${oldUpgrade.bufferAddress}. ` +
        `Deployment-cycle isolation will attempt to separate write windows.`
    );
  }

  const oldElf = await reconstructElfFromBuffer(
    connection,
    new PublicKey(oldUpgrade.bufferAddress),
    oldUpgrade.slot,
    prevSig,
    "Version A",
    undefined,
    { programId: programIdStr, programDataAddress }
  );

  const newElf = await reconstructElfFromBuffer(
    connection,
    new PublicKey(newUpgrade.bufferAddress),
    newUpgrade.slot,
    sig,
    "Version B",
    undefined,
    { programId: programIdStr, programDataAddress }
  );

  console.info(
    `[soldiff] Pre-diff verification: ` +
      `A hash=${oldElf.provenance.sha256.slice(0, 16)}… (${oldElf.writeTxCount} writes) ` +
      `B hash=${newElf.provenance.sha256.slice(0, 16)}… (${newElf.writeTxCount} writes)`
  );

  const oldBin = elfToFetchedBytecode({
    elf: oldElf.elf,
    programId: programIdStr,
    programDataAddress,
    slot: slotA,
    anchorSignature: prevSig,
    provenance: oldElf.provenance,
  });

  const newBin = elfToFetchedBytecode({
    elf: newElf.elf,
    programId: programIdStr,
    programDataAddress,
    slot: slotB,
    anchorSignature: sig,
    provenance: newElf.provenance,
  });

  return buildAnalysisReport({
    programId: programIdStr,
    label,
    oldBin,
    newBin,
    cluster: "mainnet-beta",
  });
}

async function runSlotAnalysis(req: SlotDiffRequest): Promise<AnalysisReport> {
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

  return buildAnalysisReport({
    programId: req.programId,
    label,
    oldBin,
    newBin,
    cluster: "mainnet-beta",
  });
}

async function buildAnalysisReport(params: {
  programId: string;
  label: string;
  oldBin: FetchedBytecode;
  newBin: FetchedBytecode;
  cluster: string;
}): Promise<AnalysisReport> {
  const { programId, label, oldBin, newBin, cluster } = params;

  if (oldBin.slot >= newBin.slot) {
    throw new Error(
      `Version ordering invalid: slot A (${oldBin.slot}) must be < slot B (${newBin.slot})`
    );
  }
  if (oldBin.programDataAddress !== newBin.programDataAddress) {
    throw new Error("Versions reference different ProgramData accounts");
  }
  if (oldBin.programId !== newBin.programId) {
    throw new Error("Versions reference different program IDs");
  }

  const textUnchanged = oldBin.textSha256 === newBin.textSha256;
  const rodataUnchanged = oldBin.rodataSection.equals(newBin.rodataSection);
  const identicalDiffLine: DiffLine[] = [
    { type: "context", lineA: 1, lineB: 1, content: "// Bytecode identical" },
  ];

  let changedChunks = 0;
  let textDiff: DiffLine[] = identicalDiffLine;
  let rodataDiff: DiffLine[] = identicalDiffLine;

  if (!textUnchanged) {
    changedChunks = countChangedChunks(oldBin.textSection, newBin.textSection);
    textDiff = diffBytecode(oldBin.textSection, newBin.textSection);
  }
  if (!rodataUnchanged) {
    rodataDiff = diffBytecode(oldBin.rodataSection, newBin.rodataSection);
  }

  const ruleCtx = buildRuleContext(oldBin, newBin, changedChunks);
  const byteFindings = ensureUiFields(runRules(ruleCtx));

  // Anchor IDL: Version B may use current on-chain IDL; Version A is historical → unavailable unless proven
  let idlB: IdlFetchResult = await fetchCurrentAnchorIdl(programId);
  const idlA: IdlFetchResult = resolveHistoricalIdl({});
  // If current IDL fetch fails, mark B unavailable too
  if (idlB.status !== "available") {
    idlB = { status: "unavailable", reason: idlB.reason };
  }

  const idlDiff = diffAnchorIdls(idlA, idlB);
  const idlFindings = ensureUiFields(idlDiff.findings);

  const framework = detectProgramFramework({
    idl: idlB.status === "available" ? idlB : null,
    textSection: newBin.textSection,
    rodataSection: newBin.rodataSection,
  });

  const disasmA = await disassembleArtifact(oldBin.textSection, oldBin.elf);
  const disasmB = await disassembleArtifact(newBin.textSection, newBin.elf);
  const disassemblyDiff = textUnchanged
    ? {
        analyzer: "sbf-instruction" as const,
        methodology: "sequence-alignment" as const,
        available: true,
        added: 0,
        removed: 0,
        replaced: 0,
        unchanged: disasmA.normalized.length,
        repositioned: 0,
        entries: [],
        functionRegionsChanged: 0,
      }
    : diffNormalizedInstructions(disasmA.normalized, disasmB.normalized);

  const disasmFindings: Finding[] = [];
  if (disassemblyDiff.available && !textUnchanged) {
    if (disassemblyDiff.added + disassemblyDiff.removed + disassemblyDiff.replaced > 0) {
      disasmFindings.push({
        id: "sbf-diff-summary",
        analyzer: "sbf-instruction",
        code: "SBF_INSTRUCTION_DIFF",
        severity:
          disassemblyDiff.replaced + disassemblyDiff.added + disassemblyDiff.removed > 50
            ? "MEDIUM"
            : "INFO",
        confidence: "medium",
        description:
          `SBF sequence-aligned instruction diff: +${disassemblyDiff.added} / -${disassemblyDiff.removed} / ` +
          `${disassemblyDiff.replaced} replaced; ${disassemblyDiff.unchanged} unchanged` +
          (disassemblyDiff.repositioned > 0
            ? ` (${disassemblyDiff.repositioned} repositioned at different offsets)`
            : "") +
          `; ${disassemblyDiff.functionRegionsChanged} changed region(s). ` +
          `Not a proof of semantic behavior change.`,
        recommendation:
          "This is an instruction-sequence observation, not a semantic proof of behavior change.",
        evidence: {
          summary: "SBF sequence-aligned instruction diff summary",
          details: {
            methodology: disassemblyDiff.methodology,
            added: disassemblyDiff.added,
            removed: disassemblyDiff.removed,
            replaced: disassemblyDiff.replaced,
            unchanged: disassemblyDiff.unchanged,
            repositioned: disassemblyDiff.repositioned,
            functionRegionsChanged: disassemblyDiff.functionRegionsChanged,
          },
        },
        instruction: ".text",
      });
    }
  }

  const findings = [...byteFindings, ...idlFindings, ...ensureUiFields(disasmFindings)];

  const newExternal = findings
    .filter((f) => f.code === "NEW_32_BYTE_PUBLIC_KEY_CANDIDATE")
    .map((f) => f.after ?? "")
    .filter(Boolean);

  const { nodes, edges } = buildBlastRadius(
    oldBin,
    newBin,
    newExternal,
    ruleCtx.newPubkeys
  );

  const summary = applyInstructionDiffSummary(
    summarizeFindings(findings),
    disassemblyDiff
  );
  const riskScore = computeObservedChangeScore(findings);

  const versionA = toVersionArtifact("A", oldBin, framework, idlA, disasmA);
  const versionB = toVersionArtifact("B", newBin, framework, idlB, disasmB);

  const limitations = [
    "Raw byte and SBF instruction diffs do not prove semantic equivalence or behavioral change.",
    "Historical Anchor IDL for Version A is unavailable unless separately proven; current IDL is never attributed to past versions.",
    "Sampled 32-byte public-key candidates are not proven CPI targets.",
    "Buffer reconstruction depends on complete archival RPC history and a bounded deployment cycle.",
    "Same-slot multi-transaction write ordering may be ambiguous when transaction index is unavailable from RPC.",
    "Blast-radius graph is a synthetic display aid, not an on-chain dependency proof.",
  ];

  const description = buildDescription({
    textUnchanged,
    rodataUnchanged,
    changedChunks,
    oldBin,
    newBin,
  });

  return {
    id: `live-${programId.slice(0, 8)}`,
    label,
    name: label,
    cluster,
    programId,
    program: {
      programId,
      programDataAddress: oldBin.programDataAddress,
      framework,
    },
    versionA,
    versionB,
    comparisons: {
      rawByteDiff: {
        analyzer: "raw-byte",
        textUnchanged,
        rodataUnchanged,
        changedTextChunks: changedChunks,
        textDiff,
        rodataDiff,
      },
      disassemblyDiff,
      anchorIdlDiff: idlDiff,
    },
    findings,
    riskScore,
    observedChangeScore: riskScore,
    summary,
    limitations,
    instructionDiff: textDiff,
    accountDiff: rodataDiff,
    blastNodes: nodes,
    blastEdges: edges,
    fromSlot: oldBin.slot,
    toSlot: newBin.slot,
    fromDate: `slot ${formatSlot(oldBin.slot)}`,
    toDate: `slot ${formatSlot(newBin.slot)}`,
    description,
  };
}

function toVersionArtifact(
  label: "A" | "B",
  bin: FetchedBytecode,
  framework: AnalysisReport["program"]["framework"],
  idl: IdlFetchResult,
  disassembly: VersionArtifact["disassembly"]
): VersionArtifact {
  const provenance =
    bin.provenance ??
    ({
      programId: bin.programId,
      programDataAddress: bin.programDataAddress,
      upgradeSignature: bin.anchorSignature,
      upgradeSlot: bin.slot,
      reconstructionMethod: "rewind-slot" as const,
      writeTransactionCount: 0,
      writeChunkCount: 0,
      byteLength: bin.sizeBytes,
      sha256: bin.elfSha256,
      textSha256: bin.textSha256,
      rodataSha256: bin.rodataSha256,
      coverageComplete: true,
      coverageGaps: [],
      overlapCount: 0,
      unexpectedOverlapCount: 0,
      reconstructionWarnings: [],
    } satisfies VersionArtifact["provenance"]);

  return {
    label,
    slot: bin.slot,
    elf: bin.elf,
    textSection: bin.textSection,
    rodataSection: bin.rodataSection,
    provenance,
    framework,
    idl: {
      status: idl.status,
      source: idl.source,
      normalized: idl.normalized,
      rawJson: idl.rawJson,
    },
    disassembly,
  };
}

function ensureUiFields(findings: Finding[]): Finding[] {
  return findings.map((f) => ({
    ...f,
    instruction: f.instruction ?? f.code,
    recommendation:
      f.recommendation ??
      "Review the evidence attached to this finding. Do not treat hypotheses as proven.",
    evidence: f.evidence ?? { summary: f.description },
  }));
}

function buildDescription(params: {
  textUnchanged: boolean;
  rodataUnchanged: boolean;
  changedChunks: number;
  oldBin: FetchedBytecode;
  newBin: FetchedBytecode;
}): string {
  const { textUnchanged, rodataUnchanged, changedChunks, oldBin, newBin } = params;
  const recon =
    oldBin.provenance && newBin.provenance
      ? ` · A ${oldBin.provenance.writeTransactionCount} writes / B ${newBin.provenance.writeTransactionCount} writes`
      : "";

  if (textUnchanged && rodataUnchanged) {
    return `No .text or .rodata changes detected between versions${recon}`;
  }
  if (textUnchanged && !rodataUnchanged) {
    return `Code unchanged; .rodata changed between versions${recon}`;
  }
  return `Live diff — ${changedChunks} .text chunk(s) changed${recon}`;
}

function toDemoProgram(report: AnalysisReport): DemoProgram {
  return {
    id: report.id,
    name: report.name,
    programId: report.programId,
    fromSlot: report.fromSlot,
    toSlot: report.toSlot,
    fromDate: report.fromDate,
    toDate: report.toDate,
    description: report.description,
    riskScore: report.riskScore,
    findings: report.findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      code: f.code,
      instruction: f.instruction ?? f.code,
      description: f.description,
      recommendation: f.recommendation ?? "",
      before: f.before,
      after: f.after,
      analyzer: f.analyzer,
      confidence: f.confidence,
      evidence: f.evidence,
      affectedVersions: f.affectedVersions,
    })),
    instructionDiff: report.instructionDiff,
    accountDiff: report.accountDiff,
    blastNodes: report.blastNodes,
    blastEdges: report.blastEdges,
    summary: report.summary,
  };
}

function shortenProgramId(id: string): string {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export { toDemoProgram };
