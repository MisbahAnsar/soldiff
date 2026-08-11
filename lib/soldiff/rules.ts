import type { Finding, Severity } from "./types";
import type { FetchedBytecode } from "./rpc";
import { KNOWN_PROGRAM_IDS } from "./constants";
import { extractPubkeys, extractStrings } from "./diff";

export interface RuleContext {
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

  const textUnchanged = ctx.oldBin.textHash === ctx.newBin.textHash;
  const rodataUnchanged = ctx.oldBin.rodataSection.equals(ctx.newBin.rodataSection);

  const sizeDelta = ctx.newBin.textSection.length - ctx.oldBin.textSection.length;
  const sizePct =
    ctx.oldBin.textSection.length > 0
      ? Math.abs(sizeDelta) / ctx.oldBin.textSection.length
      : 1;

  if (textUnchanged && rodataUnchanged) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: "INFO",
      confidence: "high",
      code: "NO_CHANGE",
      instruction: "program",
      description:
        ".text and .rodata are identical between the two versions. No bytecode or read-only data changes detected.",
      recommendation:
        "No upgrade bytecode diff is required for these reconstructed artifacts.",
      evidence: {
        summary: "text and rodata unchanged",
        hashes: {
          textA: ctx.oldBin.textHash,
          textB: ctx.newBin.textHash,
        },
      },
    });
    return findings;
  }

  if (textUnchanged && !rodataUnchanged) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: "INFO",
      confidence: "high",
      code: "CODE_UNCHANGED_DATA_CHANGED",
      instruction: "rodata",
      description:
        ".text is identical but .rodata changed. Code bytes are unchanged; read-only data differs.",
      recommendation:
        "Review .rodata diffs for constant, string, or embedded data changes. Do not treat this as NO_CHANGE.",
      evidence: {
        summary: "code unchanged, data changed",
        hashes: {
          textA: ctx.oldBin.textHash,
          textB: ctx.newBin.textHash,
        },
        before: `${ctx.oldBin.rodataSection.length} rodata bytes`,
        after: `${ctx.newBin.rodataSection.length} rodata bytes`,
      },
    });
  }

  if (!textUnchanged) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: "INFO",
      confidence: "high",
      code: "TEXT_BYTES_CHANGED",
      instruction: "program",
      description:
        `.text section bytes changed between slot ${ctx.oldBin.slot} and ${ctx.newBin.slot}. ` +
        `Hash ${ctx.oldBin.textHash} → ${ctx.newBin.textHash}.`,
      recommendation:
        "Review the raw byte diff and SBF instruction-level diff. Byte changes do not by themselves prove semantic logic changes.",
      before: `sha256:${ctx.oldBin.textHash} (${ctx.oldBin.textSection.length} bytes)`,
      after: `sha256:${ctx.newBin.textHash} (${ctx.newBin.textSection.length} bytes)`,
      evidence: {
        summary: ".text bytes differ",
        hashes: {
          textA: ctx.oldBin.textHash,
          textB: ctx.newBin.textHash,
        },
      },
    });

    // Keep BYTECODE_CHANGED as alias for UI presenters that still look for it
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: "INFO",
      confidence: "high",
      code: "BYTECODE_CHANGED",
      instruction: "program",
      description: `.text section hash changed (${ctx.oldBin.textHash} → ${ctx.newBin.textHash}).`,
      evidence: {
        summary: "bytecode hash changed",
        hashes: { before: ctx.oldBin.textHash, after: ctx.newBin.textHash },
      },
    });
  }

  if (!textUnchanged && sizePct > 0.15) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: sizePct > 0.4 ? "HIGH" : "MEDIUM",
      confidence: "medium",
      code: "TEXT_SECTION_SIZE_CHANGE",
      instruction: "program",
      description: `.text section size changed by ${sizeDelta > 0 ? "+" : ""}${sizeDelta} bytes (${(sizePct * 100).toFixed(1)}%).`,
      recommendation: "Inspect added/removed bytecode regions in the raw and instruction diffs.",
      before: `${ctx.oldBin.textSection.length} bytes`,
      after: `${ctx.newBin.textSection.length} bytes`,
      evidence: {
        summary: ".text size change",
        before: ctx.oldBin.textSection.length,
        after: ctx.newBin.textSection.length,
      },
    });
  }

  // Sampled 32-byte windows that decode as pubkeys — candidates only, not proven CPI targets
  const newExternal = [...ctx.newPubkeys].filter(
    (k) => !ctx.oldPubkeys.has(k) && !KNOWN_PROGRAM_IDS.has(k)
  );
  for (const pubkey of newExternal.slice(0, 3)) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: "LOW",
      confidence: "low",
      code: "NEW_32_BYTE_PUBLIC_KEY_CANDIDATE",
      instruction: "sampled_bytes",
      description:
        `A new 32-byte value that decodes as a Solana public key appeared in sampled bytecode bytes: ${pubkey}. ` +
        `This is not proof of a new external program or CPI target.`,
      recommendation:
        "Treat as a hypothesis until confirmed by instruction/CPI evidence or a known program account lookup.",
      after: pubkey,
      evidence: {
        summary: "sampled pubkey candidate",
        after: pubkey,
        details: {
          proof: "none",
          method: "aligned-32-byte-window-sample",
        },
      },
    });
  }

  const newStrings = [...ctx.newStrings].filter((s) => !ctx.oldStrings.has(s) && s.length >= 6);
  const removedStrings = [...ctx.oldStrings].filter(
    (s) => !ctx.newStrings.has(s) && s.length >= 6
  );

  if (newStrings.length > 0) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: newStrings.length > 5 ? "MEDIUM" : "LOW",
      confidence: "medium",
      code: "NEW_RODATA_STRINGS",
      instruction: "rodata",
      description: `${newStrings.length} new string(s) in .rodata: ${newStrings
        .slice(0, 3)
        .map((s) => `"${s}"`)
        .join(", ")}${newStrings.length > 3 ? "…" : ""}.`,
      recommendation: "New strings may indicate new handlers or error paths — confirm manually.",
      evidence: {
        summary: "new rodata strings",
        after: newStrings.slice(0, 10),
      },
    });
  }

  if (removedStrings.length > 0) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: "MEDIUM",
      confidence: "medium",
      code: "REMOVED_RODATA_STRINGS",
      instruction: "rodata",
      description: `${removedStrings.length} string(s) removed from .rodata, including: ${removedStrings
        .slice(0, 2)
        .map((s) => `"${s}"`)
        .join(", ")}.`,
      recommendation: "Removed strings may indicate deleted paths — confirm manually.",
      before: removedStrings.slice(0, 2).join(", "),
      evidence: {
        summary: "removed rodata strings",
        before: removedStrings.slice(0, 10),
      },
    });
  }

  if (!textUnchanged && ctx.changedChunks > 20) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: ctx.changedChunks > 80 ? "HIGH" : "MEDIUM",
      confidence: "medium",
      code: "LARGE_TEXT_REGION_CHANGED",
      instruction: "program",
      description: `${ctx.changedChunks} aligned 32-byte chunks differ in .text. This measures raw region churn, not proven semantic logic changes.`,
      recommendation:
        "Use the SBF instruction-level diff for finer evidence. Do not equate chunk count with logic change.",
      evidence: {
        summary: "large .text region churn",
        details: { changedChunks: ctx.changedChunks },
      },
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
      case "CRITICAL":
        summary.critical++;
        break;
      case "HIGH":
        summary.high++;
        break;
      case "MEDIUM":
        summary.medium++;
        break;
      case "LOW":
        summary.low++;
        break;
      case "INFO":
        summary.info++;
        break;
    }
    if (
      f.code === "TEXT_BYTES_CHANGED" ||
      f.code === "BYTECODE_CHANGED" ||
      f.code === "LARGE_TEXT_REGION_CHANGED"
    ) {
      summary.instructionsChanged++;
    }
    if (f.code === "NEW_32_BYTE_PUBLIC_KEY_CANDIDATE") {
      summary.accountsAffected++;
    }
    // newCpiTargets only when proven — candidates do not increment
  }

  return summary;
}
