"use client";

import { useState } from "react";
import type { DemoProgram, Severity } from "@/app/data/demos";
import DiffViewer from "./DiffViewer";
import BlastRadius from "./BlastRadius";

const SEVERITY_CONFIG: Record<Severity, { color: string; soft: string; border: string; label: string; mark: string }> = {
  CRITICAL: { color: "var(--sev-critical)", soft: "var(--sev-critical-soft)", border: "var(--sev-critical-border)", label: "Critical", mark: "C" },
  HIGH:     { color: "var(--sev-high)",     soft: "var(--sev-high-soft)",     border: "var(--sev-high-border)",     label: "High",     mark: "H" },
  MEDIUM:   { color: "var(--sev-medium)",   soft: "var(--sev-medium-soft)",   border: "var(--sev-medium-border)",   label: "Medium",   mark: "M" },
  LOW:      { color: "var(--sev-low)",      soft: "var(--sev-low-soft)",      border: "var(--sev-low-border)",      label: "Low",      mark: "L" },
  INFO:     { color: "var(--sev-info)",     soft: "var(--sev-info-soft)",     border: "var(--sev-info-border)",     label: "Info",     mark: "I" },
};

type Tab = "findings" | "instruction" | "accounts" | "blast";

const TAB_LABELS: Record<Tab, string> = {
  findings: "Findings",
  instruction: "Bytecode diff",
  accounts: ".rodata diff",
  blast: "Blast radius",
};

const PLAYGROUND_H = 544;

function getRiskColor(score: number) {
  if (score >= 80) return "var(--sev-critical)";
  if (score >= 50) return "var(--sev-high)";
  if (score >= 25) return "var(--sev-medium)";
  return "var(--sev-safe)";
}

function getRiskLabel(score: number) {
  if (score >= 80) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Safe";
}

interface ReportPanelProps {
  report: DemoProgram | null;
  loading?: boolean;
  loadingStage?: string;
  loadingProgress?: number;
  emptyMessage?: string;
}

export default function ReportPanel({
  report,
  loading = false,
  loadingStage = "",
  loadingProgress = 0,
  emptyMessage = "Run an analysis to see results here.",
}: ReportPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("findings");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  if (!report && !loading) {
    return (
      <div
        style={{
          height: PLAYGROUND_H,
          borderRadius: 14,
          border: "1px dashed var(--border-strong)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 14,
          background: "var(--bg-surface)",
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  const program = report!;
  const riskColor = getRiskColor(program?.riskScore ?? 0);

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-surface)",
        overflow: "hidden",
        height: PLAYGROUND_H,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {loading && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-input)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontFamily: "JetBrains Mono, monospace" }}>
              → {loadingStage}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--accent)", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
              {loadingProgress}%
            </span>
          </div>
          <div style={{ height: 2, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--accent)", width: `${loadingProgress}%`, transition: "width 0.1s linear" }} />
          </div>
        </div>
      )}

      {report && !loading && (
        <>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", flexShrink: 0 }}>
            <RiskMeter score={program.riskScore} color={riskColor} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>{program.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, border: `1px solid ${riskColor}`, color: riskColor, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" }}>
                  {getRiskLabel(program.riskScore)}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                {program.programId.slice(0, 14)}…{program.programId.slice(-4)} · {program.fromSlot.toLocaleString()} → {program.toSlot.toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "6px 16px 0", gap: 4, flexShrink: 0 }}>
            {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
              const isActive = tab === activeTab;
              const count =
                tab === "findings" ? program.findings.length :
                tab === "instruction" ? program.instructionDiff.filter((l) => l.type === "added" || l.type === "removed").length :
                tab === "accounts" ? program.accountDiff.filter((l) => l.type === "added" || l.type === "removed").length :
                program.blastNodes.filter((n) => n.changed).length;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                    background: isActive ? "var(--bg-surface)" : "transparent",
                    border: isActive ? "1px solid var(--border-strong)" : "1px solid transparent",
                    borderRadius: "8px 8px 0 0",
                    cursor: "pointer",
                    marginBottom: -1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {TAB_LABELS[tab]}
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--text-faint)", padding: "1px 5px", borderRadius: 4, border: "1px solid var(--border)" }}>{count}</span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, overflow: "hidden", padding: 12 }}>
            <div style={{ height: "100%", overflow: "auto", padding: 8, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.015)" }}>
              {activeTab === "findings" && (
                <FindingsList findings={program.findings} expandedId={expandedFinding} onExpand={setExpandedFinding} />
              )}
              {activeTab === "instruction" && <DiffViewer lines={program.instructionDiff} title=".text section diff" compact />}
              {activeTab === "accounts" && <DiffViewer lines={program.accountDiff} title=".rodata section diff" compact />}
              {activeTab === "blast" && <BlastRadius nodes={program.blastNodes} edges={program.blastEdges} compact />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RiskMeter({ score, color }: { score: number; color: string }) {
  const circumference = 2 * Math.PI * 22;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
      <svg width="46" height="46" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)", display: "block", margin: "0 auto" }}>
        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: "JetBrains Mono, monospace" }}>{score}</span>
      </div>
    </div>
  );
}

function FindingsList({
  findings,
  expandedId,
  onExpand,
}: {
  findings: DemoProgram["findings"];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
}) {
  if (findings.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No findings.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {findings.map((f) => {
        const cfg = SEVERITY_CONFIG[f.severity];
        const isExpanded = expandedId === f.id;
        return (
          <div key={f.id} style={{ border: `1px solid var(--border)`, borderLeft: `2px solid ${cfg.color}`, borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => onExpand(isExpanded ? null : f.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 4, background: cfg.soft, border: `1px solid ${cfg.border}`, color: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{cfg.mark}</span>
              <code style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)" }}>{f.code}</code>
              <span style={{ fontSize: 11.5, color: "var(--text-primary)", flex: 1 }}>{f.instruction}</span>
            </button>
            {isExpanded && (
              <div style={{ padding: "0 10px 10px", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <p style={{ marginBottom: 6 }}>{f.description}</p>
                <p style={{ color: "var(--text-muted)", borderLeft: "2px solid var(--accent)", paddingLeft: 8 }}>{f.recommendation}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
