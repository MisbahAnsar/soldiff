import type { Finding, Severity } from "@/app/data/demos";
import type { FetchedBytecode } from "./rpc";
import { KNOWN_PROGRAM_IDS } from "./constants";
import { extractPubkeys, extractStrings } from "./diff";

interface RuleContext {
  oldBin: FetchedBytecode;
  newBin: FetchedBytecode;
  changedChunks: number;
  oldPubkeys: Set<string>;
  newPubkeys: Set<string>;
  oldStrings: Set<string>;
  newStrings: Set<string>;
}

export function runRules(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];
  let id = 0;
  const nextId = () => `f${++id}`;

  const sizeDelta = ctx.newBin.textSection.length - ctx.oldBin.textSection.length;
  const sizePct =
    ctx.oldBin.textSection.length > 0
      ? Math.abs(sizeDelta) / ctx.oldBin.textSection.length
      : 1;

  if (ctx.oldBin.textHash === ctx.newBin.textHash) {
    findings.push({
      id: nextId(),
      severity: "INFO",
      code: "NO_CHANGE",
      instruction: "program",
      description: ".text section hash is identical between the two slots. No bytecode changes detected.",
      recommendation: "No upgrade occurred between these slots, or both snapshots point to the same deployment.",
    });
    return findings;
  }

  findings.push({
    id: nextId(),
    severity: "INFO",
    code: "BYTECODE_CHANGED",
    instruction: "program",
    description: `.text section changed between slot ${ctx.oldBin.slot} and ${ctx.newBin.slot}. ` +
      `Hash ${ctx.oldBin.textHash} → ${ctx.newBin.textHash}.`,
    recommendation: "Review the structural diff and all findings before approving any governance vote.",
    before: `sha256:${ctx.oldBin.textHash} (${ctx.oldBin.textSection.length} bytes)`,
    after: `sha256:${ctx.newBin.textHash} (${ctx.newBin.textSection.length} bytes)`,
  });

  if (sizePct > 0.15) {
    findings.push({
      id: nextId(),
      severity: sizePct > 0.4 ? "HIGH" : "MEDIUM",
      code: "TEXT_SECTION_SIZE_CHANGE",
      instruction: "program",
      description: `.text section size changed by ${sizeDelta > 0 ? "+" : ""}${sizeDelta} bytes (${(sizePct * 100).toFixed(1)}%). Large size swings often indicate new instruction handlers or removed checks.`,
      recommendation: "Inspect added/removed bytecode regions in the instruction diff tab.",
      before: `${ctx.oldBin.textSection.length} bytes`,
      after: `${ctx.newBin.textSection.length} bytes`,
    });
  }

  // New external program references embedded in bytecode
  const newExternal = [...ctx.newPubkeys].filter(
    (k) => !ctx.oldPubkeys.has(k) && !KNOWN_PROGRAM_IDS.has(k)
  );
  for (const pubkey of newExternal.slice(0, 3)) {
    findings.push({
      id: nextId(),
      severity: "CRITICAL",
      code: "NEW_EXTERNAL_PROGRAM",
      instruction: "cpi_target",
      description: `A new program public key appeared in the upgraded bytecode: ${pubkey}. This may be a new CPI target invoked via invoke_signed.`,
      recommendation: "Verify this program ID is audited and intentional. Unknown CPI targets are a common exploit vector.",
      after: pubkey,
    });
  }

  // New strings in rodata (instruction names, error messages)
  const newStrings = [...ctx.newStrings].filter((s) => !ctx.oldStrings.has(s) && s.length >= 6);
  const removedStrings = [...ctx.oldStrings].filter((s) => !ctx.newStrings.has(s) && s.length >= 6);

  if (newStrings.length > 0) {
    findings.push({
      id: nextId(),
      severity: newStrings.length > 5 ? "MEDIUM" : "LOW",
      code: "NEW_RODATA_STRINGS",
      instruction: "rodata",
      description: `${newStrings.length} new string(s) in .rodata: ${newStrings.slice(0, 3).map((s) => `"${s}"`).join(", ")}${newStrings.length > 3 ? "…" : ""}.`,
      recommendation: "New strings may indicate new instruction handlers or error paths.",
    });
  }

  if (removedStrings.length > 0) {
    findings.push({
      id: nextId(),
      severity: "MEDIUM",
      code: "REMOVED_RODATA_STRINGS",
      instruction: "rodata",
      description: `${removedStrings.length} string(s) removed from .rodata, including: ${removedStrings.slice(0, 2).map((s) => `"${s}"`).join(", ")}.`,
      recommendation: "Removed strings may indicate deleted instruction handlers or constraint checks.",
      before: removedStrings.slice(0, 2).join(", "),
    });
  }

  if (ctx.changedChunks > 20) {
    findings.push({
      id: nextId(),
      severity: ctx.changedChunks > 80 ? "HIGH" : "MEDIUM",
      code: "LOGIC_CHANGE",
      instruction: "program",
      description: `${ctx.changedChunks} bytecode chunks differ in .text. Broad logic changes detected across the program.`,
      recommendation: "Treat as a major upgrade. Run full manual audit if CRITICAL rules fired.",
    });
  }

  return findings;
}

export function buildRuleContext(
  oldBin: FetchedBytecode,
  newBin: FetchedBytecode,
  changedChunks: number
): RuleContext {
  return {
    oldBin,
    newBin,
    changedChunks,
    oldPubkeys: new Set([
      ...extractPubkeys(oldBin.textSection),
      ...extractPubkeys(oldBin.rodataSection),
    ]),
    newPubkeys: new Set([
      ...extractPubkeys(newBin.textSection),
      ...extractPubkeys(newBin.rodataSection),
    ]),
    oldStrings: new Set(extractStrings(oldBin.rodataSection)),
    newStrings: new Set(extractStrings(newBin.rodataSection)),
  };
}

export function computeRiskScore(findings: Finding[]): number {
  const weights: Record<Severity, number> = {
    CRITICAL: 35,
    HIGH: 20,
    MEDIUM: 10,
    LOW: 4,
    INFO: 1,
  };
  const raw = findings.reduce((sum, f) => sum + weights[f.severity], 0);
  return Math.min(100, raw);
}

export function summarizeFindings(findings: Finding[]) {
  const summary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    instructionsChanged: 0,
    accountsAffected: 0,
    newCpiTargets: 0,
  };

  for (const f of findings) {
    switch (f.severity) {
      case "CRITICAL": summary.critical++; break;
      case "HIGH": summary.high++; break;
      case "MEDIUM": summary.medium++; break;
      case "LOW": summary.low++; break;
      case "INFO": summary.info++; break;
    }
    if (f.code === "LOGIC_CHANGE" || f.code === "BYTECODE_CHANGED") {
      summary.instructionsChanged++;
    }
    if (f.code === "NEW_EXTERNAL_PROGRAM") {
      summary.newCpiTargets++;
      summary.accountsAffected++;
    }
  }

  return summary;
}
