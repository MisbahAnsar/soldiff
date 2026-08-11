import type { Finding, Severity } from "./types";
import type { FetchedBytecode } from "./rpc";
import { KNOWN_PROGRAM_IDS } from "./constants";
import { extractPubkeys } from "./diff";
import { analyzeRodata, type RodataAnalysis } from "./rodata";

export interface RuleContext {
  oldBin: FetchedBytecode;
  newBin: FetchedBytecode;
  changedChunks: number;
  oldPubkeys: Set<string>;
  newPubkeys: Set<string>;
  rodataAnalysis: RodataAnalysis;
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
      // Size delta alone is observational — never HIGH/CRITICAL by itself.
      severity: "MEDIUM",
      confidence: "medium",
      code: "TEXT_SECTION_SIZE_CHANGE",
      instruction: "program",
      description: `.text section size changed by ${sizeDelta > 0 ? "+" : ""}${sizeDelta} bytes (${(sizePct * 100).toFixed(1)}%). Size change is not proof of a vulnerability.`,
      recommendation: "Inspect added/removed bytecode regions in the raw and instruction diffs.",
      before: `${ctx.oldBin.textSection.length} bytes`,
      after: `${ctx.newBin.textSection.length} bytes`,
      evidence: {
        summary: ".text size change",
        before: ctx.oldBin.textSection.length,
        after: ctx.newBin.textSection.length,
        details: { securityImplication: "none_proven" },
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

  const ro = ctx.rodataAnalysis;
  if (!ro.unchanged) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      severity: "INFO",
      confidence: "high",
      code: "RODATA_BYTES_CHANGED",
      instruction: "rodata",
      description:
        `.rodata bytes changed (${ro.sizeA} → ${ro.sizeB}; ~${ro.changedRegionBytes} byte(s) in ` +
        `${ro.regionChanges.length} changed region(s)). Byte changes do not prove product behavior changes.`,
      recommendation:
        "Treat byte-region diffs as primary evidence. Extracted strings are supplementary and often noisy.",
      before: `${ro.sizeA} bytes`,
      after: `${ro.sizeB} bytes`,
      evidence: {
        summary: ".rodata byte regions changed",
        details: {
          changedRegionBytes: ro.changedRegionBytes,
          regionCount: ro.regionChanges.length,
          notes: ro.notes,
        },
      },
    });

    const interesting = [
      ...ro.addedProductLike.slice(0, 5),
      ...ro.stringsInChangedRegionsB
        .filter((s) => s.kind === "product" || s.kind === "anchor_constraint")
        .slice(0, 5),
    ];
    const uncertain = ro.stringsInChangedRegionsB.filter(
      (s) => s.kind === "uncertain_fragment" || s.kind === "build_path" || s.kind === "compiler_runtime"
    ).length;

    if (interesting.length > 0 || uncertain > 0) {
      findings.push({
        id: nextId(),
        analyzer: "raw-byte",
        severity: "LOW",
        confidence: "low",
        code: "RODATA_STRING_CONTEXT",
        instruction: "rodata",
        description:
          `Supplementary .rodata string context near changed bytes: ` +
          `${interesting.length} product/constraint-like sample(s)` +
          (uncertain > 0
            ? `; ${uncertain} build-path/runtime/fragment string(s) marked uncertain`
            : "") +
          `. Not proof of new or removed features.`,
        recommendation:
          "Do not equate string-set membership with functionality. Prefer byte-region evidence.",
        evidence: {
          summary: "supplementary rodata string context",
          after: interesting.map((s) => ({
            text: s.text.slice(0, 80),
            kind: s.kind,
            confidence: s.confidence,
            offset: s.offset,
          })),
          details: {
            proof: "none",
            method: "offset-associated-string-extract",
          },
        },
      });
    }
  }

  if (!textUnchanged && ctx.changedChunks > 20) {
    findings.push({
      id: nextId(),
      analyzer: "raw-byte",
      // Chunk churn is an observation of binary size/layout change — never HIGH/CRITICAL by itself.
      severity: "MEDIUM",
      confidence: "medium",
      code: "LARGE_TEXT_REGION_CHANGED",
      instruction: "program",
      description: `${ctx.changedChunks} aligned 32-byte chunks differ in .text. This measures raw region churn, not proven semantic logic changes or a vulnerability.`,
      recommendation:
        "Use the SBF instruction-level diff for finer evidence. Do not equate chunk count with malicious logic.",
      evidence: {
        summary: "large .text region churn",
        details: { changedChunks: ctx.changedChunks, securityImplication: "none_proven" },
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
    rodataAnalysis: analyzeRodata(oldBin.rodataSection, newBin.rodataSection),
  };
}

/** Weighted observational finding score — not a vulnerability / CVSS score. */
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

/** Public name for computeRiskScore. */
export function computeObservedChangeScore(findings: Finding[]): number {
  return computeRiskScore(findings);
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
    // instructionsChanged is NOT a finding-code counter (that previously showed "3"
    // and was misread as "3 SBF instructions"). Pipeline sets the real SBF delta total.
    if (f.code === "NEW_32_BYTE_PUBLIC_KEY_CANDIDATE") {
      summary.accountsAffected++;
    }
    // newCpiTargets only when proven — candidates do not increment
  }

  return summary;
}

/** Apply real SBF instruction-level delta counts onto a findings summary. */
export function applyInstructionDiffSummary(
  summary: ReturnType<typeof summarizeFindings>,
  diff: { added: number; removed: number; replaced: number }
): ReturnType<typeof summarizeFindings> {
  return {
    ...summary,
    instructionsChanged: diff.added + diff.removed + diff.replaced,
  };
}
