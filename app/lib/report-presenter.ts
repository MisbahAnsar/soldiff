import type { DemoProgram, Finding, Severity } from "@/app/data/demos";

export interface ReportContext {
  prevUpgradeSignature?: string;
  upgradeSignature?: string;
  prevUpgradeSlot?: number | null;
  upgradeSlot?: number | null;
  analysisStartedAt?: number;
  analysisCompletedAt?: number;
}

export interface FindingPresentation {
  icon: string;
  title: string;
}

const FINDING_PRESENTATION: Record<string, FindingPresentation> = {
  BYTECODE_CHANGED: { icon: "🔴", title: "Bytecode Changed" },
  TEXT_SECTION_SIZE_CHANGE: { icon: "🟠", title: "Code Section Resized" },
  NEW_EXTERNAL_PROGRAM: { icon: "⚠️", title: "New External Program" },
  NEW_RODATA_STRINGS: { icon: "🟡", title: "New Read-Only Data" },
  REMOVED_RODATA_STRINGS: { icon: "🟡", title: "Removed Read-Only Data" },
  LOGIC_CHANGE: { icon: "🔵", title: "Logic Change Detected" },
  NO_CHANGE: { icon: "✓", title: "No Bytecode Changes" },
  REMOVED_SIGNER_CHECK: { icon: "🔴", title: "Removed Signer Check" },
  NEW_INVOKE_SIGNED_TARGET: { icon: "🔴", title: "New Invoke Signed Target" },
  CHANGED_AUTHORITY_FIELD: { icon: "🔴", title: "Authority Field Changed" },
  DISCRIMINATOR_CHANGE: { icon: "🟠", title: "Discriminator Changed" },
  NEW_MUTABLE_ACCOUNT: { icon: "🟠", title: "New Mutable Account" },
  REMOVED_OWNER_CHECK: { icon: "🟠", title: "Removed Owner Check" },
  ADDED_CLOSE_ACCOUNT: { icon: "🟡", title: "Close Account Added" },
  CHANGED_SEEDS: { icon: "🟡", title: "PDA Seeds Changed" },
};

export function presentFinding(finding: Finding): FindingPresentation & Finding {
  const preset = FINDING_PRESENTATION[finding.code];
  return {
    ...finding,
    icon: preset?.icon ?? "•",
    title: preset?.title ?? (finding.instruction || "Security Finding"),
  };
}

export function getRiskLevel(score: number): {
  label: string;
  tone: "safe" | "review" | "critical";
  emoji: string;
} {
  if (score >= 80) return { label: "Critical", tone: "critical", emoji: "🔴" };
  if (score >= 50) return { label: "High", tone: "critical", emoji: "🔴" };
  if (score >= 25) return { label: "Medium", tone: "review", emoji: "🟡" };
  return { label: "Low", tone: "safe", emoji: "🟢" };
}

export function getRiskBanner(score: number, findings: Finding[]): {
  tone: "safe" | "review" | "critical";
  title: string;
  reason: string;
} {
  const critical = findings.filter((f) => f.severity === "CRITICAL").length;
  const high = findings.filter((f) => f.severity === "HIGH").length;

  if (score >= 80 || critical > 0) {
    return {
      tone: "critical",
      title: "Critical review required",
      reason:
        critical > 0
          ? `${critical} critical finding(s) detected. Do not approve this upgrade without a full security review.`
          : "Risk score is elevated. Treat this upgrade as security-sensitive until reviewed.",
    };
  }
  if (score >= 25 || high > 0) {
    return {
      tone: "review",
      title: "Review recommended",
      reason:
        high > 0
          ? `${high} high-severity finding(s) warrant manual verification before deployment.`
          : "Bytecode or dependency changes were detected. Confirm they match the intended release.",
    };
  }
  return {
    tone: "safe",
    title: "No significant risk signals",
    reason:
      "No critical or high-severity patterns detected. Standard review is still recommended for production upgrades.",
  };
}

export function parseReconstructionMeta(description: string): {
  writesA: number | null;
  writesB: number | null;
  cacheHit: boolean;
  raw: string | null;
} {
  const cacheHit =
    /ELF from cache/i.test(description) ||
    /before cached|after cached/i.test(description);

  const before = description.match(/(\d+)\s+Write txs \(before\)/i);
  const after = description.match(/(\d+)\s+Write txs \(after\)/i);
  const paren = description.match(/\(([^)]+via Alchemy[^)]*)\)/i);

  return {
    writesA: before ? Number(before[1]) : null,
    writesB: after ? Number(after[1]) : null,
    cacheHit,
    raw: paren?.[1] ?? null,
  };
}

export function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export function formatTimestamp(ts?: number): string {
  if (!ts) return new Date().toLocaleString("en-US");
  return new Date(ts).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function sectionStatus(
  lines: DemoProgram["instructionDiff"],
  kind: "text" | "rodata"
): { label: string; tone: "changed" | "unchanged" } {
  const changed = lines.filter((l) => l.type === "added" || l.type === "removed").length;
  if (changed === 0) return { label: "Unchanged", tone: "unchanged" };
  return {
    label: kind === "text" ? `Modified (+${changed} blocks)` : `Modified (+${changed} blocks)`,
    tone: "changed",
  };
}

export function executiveBullets(report: DemoProgram): string[] {
  const bullets: string[] = [];
  const textChanged = report.instructionDiff.some(
    (l) => l.type === "added" || l.type === "removed"
  );
  const rodataChanged = report.accountDiff.some(
    (l) => l.type === "added" || l.type === "removed"
  );
  const newExternal = report.summary.newCpiTargets;

  bullets.push(textChanged ? "✓ Bytecode modified" : "✓ No .text changes");
  bullets.push(
    newExternal > 0
      ? `✓ ${newExternal} new external program reference${newExternal > 1 ? "s" : ""}`
      : "✓ No new external program references"
  );
  bullets.push(rodataChanged ? "✓ .rodata modified" : "✓ No .rodata changes");
  bullets.push(`✓ Blast radius: ${report.blastNodes.filter((n) => n.changed).length}`);

  return bullets;
}

export function severityLabel(sev: Severity): string {
  const map: Record<Severity, string> = {
    CRITICAL: "Critical",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
    INFO: "Info",
  };
  return map[sev];
}

export const LOADING_STAGES_UI = [
  "Finding ProgramData…",
  "Finding Write Transactions…",
  "Reconstructing Version A…",
  "Reconstructing Version B…",
  "Computing Diff…",
  "Generating Report…",
] as const;
