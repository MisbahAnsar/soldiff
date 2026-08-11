import type { AnalysisReport, CaseStudyManifest } from "./types";

export function buildCaseStudyManifest(report: AnalysisReport): CaseStudyManifest {
  return {
    programId: report.programId,
    cluster: report.cluster,
    programDataAddress: report.program.programDataAddress,
    versionA: {
      upgradeSignature: report.versionA.provenance.upgradeSignature ?? "",
      slot: report.versionA.slot,
      bufferAddress: report.versionA.provenance.bufferAddress,
    },
    versionB: {
      upgradeSignature: report.versionB.provenance.upgradeSignature ?? "",
      slot: report.versionB.slot,
      bufferAddress: report.versionB.provenance.bufferAddress,
    },
    artifacts: {
      versionA: {
        sha256: report.versionA.provenance.sha256,
        textSha256: report.versionA.provenance.textSha256,
        rodataSha256: report.versionA.provenance.rodataSha256,
        size: report.versionA.provenance.byteLength,
        coverageComplete: report.versionA.provenance.coverageComplete,
      },
      versionB: {
        sha256: report.versionB.provenance.sha256,
        textSha256: report.versionB.provenance.textSha256,
        rodataSha256: report.versionB.provenance.rodataSha256,
        size: report.versionB.provenance.byteLength,
        coverageComplete: report.versionB.provenance.coverageComplete,
      },
    },
    verification: {
      method: report.versionA.provenance.reconstructionMethod,
      status: report.versionA.provenance.coverageComplete &&
        report.versionB.provenance.coverageComplete
        ? "reconstructed"
        : "partial",
      notes: [
        ...report.versionA.provenance.reconstructionWarnings,
        ...report.versionB.provenance.reconstructionWarnings,
      ],
    },
    generatedAt: new Date().toISOString(),
    soldiffVersion: "0.2.0",
  };
}

export function renderMarkdownReport(report: AnalysisReport): string {
  const a = report.versionA;
  const b = report.versionB;
  const raw = report.comparisons.rawByteDiff;
  const dis = report.comparisons.disassemblyDiff;
  const idl = report.comparisons.anchorIdlDiff;

  const lines: string[] = [];
  lines.push(`# SolDiff Case Study — ${report.label}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Program");
  lines.push("");
  lines.push(`- Program address: \`${report.program.programId}\``);
  lines.push(`- Network: \`${report.cluster}\``);
  lines.push(`- ProgramData: \`${report.program.programDataAddress}\``);
  lines.push(`- Framework (heuristic): \`${report.program.framework}\``);
  lines.push(
    `- Upgrade A: \`${a.provenance.upgradeSignature ?? "n/a"}\``
  );
  lines.push(
    `- Upgrade B: \`${b.provenance.upgradeSignature ?? "n/a"}\``
  );
  lines.push("");
  lines.push("## Version A");
  lines.push("");
  lines.push(...versionSection(a));
  lines.push("");
  lines.push("## Version B");
  lines.push("");
  lines.push(...versionSection(b));
  lines.push("");
  lines.push("## Artifact Verification");
  lines.push("");
  lines.push(
    `Both artifacts were obtained via \`${a.provenance.reconstructionMethod}\` ` +
      `(Write-transaction replay and/or historical account fetch).`
  );
  lines.push("");
  lines.push(
    `- Coverage complete A: **${a.provenance.coverageComplete}**, B: **${b.provenance.coverageComplete}**`
  );
  lines.push(
    `- Unexpected overlaps A: ${a.provenance.unexpectedOverlapCount}, B: ${b.provenance.unexpectedOverlapCount}`
  );
  lines.push(
    `- This report does **not** claim \`solana-verify\` / verified-build status unless separately evidenced.`
  );
  lines.push("");
  lines.push("## Raw Byte Changes");
  lines.push("");
  lines.push(`- .text unchanged: **${raw.textUnchanged}**`);
  lines.push(`- .rodata unchanged: **${raw.rodataUnchanged}**`);
  lines.push(`- Changed .text 32-byte chunks: **${raw.changedTextChunks}**`);
  if (raw.textUnchanged && !raw.rodataUnchanged) {
    lines.push("- Distinction: **code unchanged, data changed**");
  }
  lines.push("");
  lines.push("## SBF Instruction Changes");
  lines.push("");
  if (!dis.available) {
    lines.push(`Unavailable: ${dis.reason ?? "unknown"}`);
  } else {
    lines.push(
      `- Added: ${dis.added}, Removed: ${dis.removed}, Replaced: ${dis.replaced}, Unchanged: ${dis.unchanged}`
    );
    lines.push(`- Changed regions: ${dis.functionRegionsChanged}`);
    lines.push("");
    lines.push("Sample (up to 20 changed instructions):");
    lines.push("");
    lines.push("```");
    for (const e of dis.entries.slice(0, 20)) {
      if (e.kind === "added") {
        lines.push(`+ 0x${(e.offsetB ?? 0).toString(16)} ${e.after?.opcode} ${e.after?.operands.join(", ")}`);
      } else if (e.kind === "removed") {
        lines.push(`- 0x${(e.offsetA ?? 0).toString(16)} ${e.before?.opcode} ${e.before?.operands.join(", ")}`);
      } else if (e.kind === "replaced") {
        lines.push(
          `~ 0x${(e.offsetA ?? 0).toString(16)} ${e.before?.opcode} → ${e.after?.opcode}`
        );
      }
    }
    lines.push("```");
  }
  lines.push("");
  lines.push("## Anchor IDL Changes");
  lines.push("");
  if (idl.status !== "available") {
    lines.push("Historical Anchor IDL: unavailable");
    if (idl.reason) lines.push(`Reason: ${idl.reason}`);
  } else {
    lines.push(`IDL diff findings: ${idl.findings.length}`);
  }
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  for (const f of report.findings) {
    lines.push(`### ${f.code} (${f.severity}, confidence=${f.confidence})`);
    lines.push("");
    lines.push(`- Analyzer: \`${f.analyzer}\``);
    lines.push(`- ${f.description}`);
    if (f.affectedVersions?.length) {
      lines.push(`- Affected versions: ${f.affectedVersions.join(", ")}`);
    }
    lines.push(`- Evidence: ${f.evidence.summary}`);
    if (f.evidence.details) {
      lines.push(`- Details: \`${JSON.stringify(f.evidence.details)}\``);
    }
    lines.push("");
  }
  lines.push("## Limitations");
  lines.push("");
  for (const lim of report.limitations) {
    lines.push(`- ${lim}`);
  }
  lines.push("");
  return lines.join("\n");
}

function versionSection(v: AnalysisReport["versionA"]): string[] {
  const p = v.provenance;
  return [
    `- Slot: \`${v.slot}\``,
    `- Buffer: \`${p.bufferAddress ?? "n/a"}\``,
    `- Artifact size: \`${p.byteLength}\` bytes`,
    `- SHA-256: \`${p.sha256}\``,
    `- .text SHA-256: \`${p.textSha256}\``,
    `- .rodata SHA-256: \`${p.rodataSha256}\``,
    `- Reconstruction coverage complete: **${p.coverageComplete}**`,
    `- Write txs / chunks: ${p.writeTransactionCount} / ${p.writeChunkCount}`,
    `- Overlaps: ${p.overlapCount} (unexpected ${p.unexpectedOverlapCount})`,
    ...(p.reconstructionWarnings.length
      ? [`- Warnings: ${p.reconstructionWarnings.join("; ")}`]
      : []),
  ];
}
