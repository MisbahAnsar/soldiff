"use client";

import { useState } from "react";
import type { DemoProgram, Severity } from "@/app/data/demos";
import BlastRadius from "@/app/components/BlastRadius";
import DiffViewer from "@/app/components/DiffViewer";
import { AddressField } from "@/app/components/report/ReportChrome";
import {
  formatElapsed,
  formatTimestamp,
  getRiskBanner,
  getRiskLevel,
  parseReconstructionMeta,
  presentFinding,
  sectionStatus,
  type ReportContext,
} from "@/app/lib/report-presenter";

const SEVERITY_CONFIG: Record<
  Severity,
  { color: string; soft: string; border: string; label: string; mark: string }
> = {
  CRITICAL: {
    color: "var(--sev-critical)",
    soft: "var(--sev-critical-soft)",
    border: "var(--sev-critical-border)",
    label: "Critical",
    mark: "C",
  },
  HIGH: {
    color: "var(--sev-high)",
    soft: "var(--sev-high-soft)",
    border: "var(--sev-high-border)",
    label: "High",
    mark: "H",
  },
  MEDIUM: {
    color: "var(--sev-medium)",
    soft: "var(--sev-medium-soft)",
    border: "var(--sev-medium-border)",
    label: "Medium",
    mark: "M",
  },
  LOW: {
    color: "var(--sev-low)",
    soft: "var(--sev-low-soft)",
    border: "var(--sev-low-border)",
    label: "Low",
    mark: "L",
  },
  INFO: {
    color: "var(--sev-info)",
    soft: "var(--sev-info-soft)",
    border: "var(--sev-info-border)",
    label: "Info",
    mark: "I",
  },
};

type Tab = "findings" | "instruction" | "accounts" | "blast" | "details";

const TAB_LABELS: Record<Tab, string> = {
  findings: "Findings",
  instruction: "Bytecode",
  accounts: "Rodata",
  blast: "Blast radius",
  details: "Details",
};

const PANEL_H = 544;

interface Props {
  report: DemoProgram;
  context?: ReportContext;
}

export default function AuditReport({ report, context }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("findings");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(
    report.findings[0]?.id ?? null
  );

  const risk = getRiskLevel(report.riskScore);
  const banner = getRiskBanner(report.riskScore, report.findings);
  const recon = parseReconstructionMeta(report.description);
  const textStatus = sectionStatus(report.instructionDiff, "text");
  const rodataStatus = sectionStatus(report.accountDiff, "rodata");
  const visibleFindings = report.findings.filter((f) => f.code !== "NO_CHANGE");
  const displayFindings =
    visibleFindings.length > 0 ? visibleFindings : report.findings;
  const elapsed =
    context?.analysisStartedAt && context?.analysisCompletedAt
      ? formatElapsed(context.analysisCompletedAt - context.analysisStartedAt)
      : "—";

  const riskColor =
    report.riskScore >= 80
      ? "var(--sev-critical)"
      : report.riskScore >= 50
        ? "var(--sev-high)"
        : report.riskScore >= 25
          ? "var(--sev-medium)"
          : "var(--sev-safe)";

  const tabCount = (tab: Tab) => {
    switch (tab) {
      case "findings":
        return displayFindings.length;
      case "instruction":
        return report.instructionDiff.filter(
          (l) => l.type === "added" || l.type === "removed"
        ).length;
      case "accounts":
        return report.accountDiff.filter((l) => l.type === "added" || l.type === "removed").length;
      case "blast":
        return report.blastNodes.filter((n) => n.changed).length;
      case "details":
        return 1;
    }
  };

  return (
    <div className="analyze-playground-panel" style={{ height: PANEL_H, minHeight: PANEL_H }}>
      {recon.cacheHit && (
        <div className="analyze-playground-cache">
          <span className="audit-cache-dot" aria-hidden />
          ELF loaded from cache
        </div>
      )}

      <div className="analyze-playground-header">
        <RiskMeter score={report.riskScore} color={riskColor} />
        <div className="analyze-playground-header-main">
          <div className="analyze-playground-header-row">
            <span className="analyze-playground-program-name">{report.name}</span>
            <span
              className="analyze-playground-risk-tag"
              style={{ borderColor: riskColor, color: riskColor }}
            >
              {risk.label}
            </span>
          </div>
          <div className="analyze-playground-header-meta report-mono">
            <span>
              {report.programId.slice(0, 14)}…{report.programId.slice(-4)}
            </span>
            <span>·</span>
            <span>
              {report.fromSlot.toLocaleString("en-US")} → {report.toSlot.toLocaleString("en-US")}
            </span>
          </div>
          <p className={`analyze-playground-banner tone-${banner.tone}`}>{banner.reason}</p>
        </div>
        <div className="analyze-playground-severity-counts">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as Severity[]).map((sev) => {
            const count = report.summary[sev.toLowerCase() as keyof typeof report.summary] as number;
            if (!count) return null;
            const cfg = SEVERITY_CONFIG[sev];
            return (
              <div
                key={sev}
                className="analyze-playground-sev-pill"
                style={{ borderColor: cfg.border }}
              >
                <span className="analyze-playground-sev-mark" style={{ color: cfg.color }}>
                  {cfg.mark}
                </span>
                <span style={{ color: cfg.color }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="analyze-playground-tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              className={`analyze-playground-tab${isActive ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
              <span className="analyze-playground-tab-count">{tabCount(tab)}</span>
            </button>
          );
        })}
      </div>

      <div className="analyze-playground-content">
        <div className="analyze-playground-content-inner">
          {activeTab === "findings" && (
            <FindingsPanel
              findings={displayFindings}
              expandedId={expandedFinding}
              onExpand={setExpandedFinding}
            />
          )}
          {activeTab === "instruction" && (
            <DiffViewer lines={report.instructionDiff} title=".text section diff" compact />
          )}
          {activeTab === "accounts" && (
            <DiffViewer lines={report.accountDiff} title=".rodata section diff" compact />
          )}
          {activeTab === "blast" && (
            <BlastRadius nodes={report.blastNodes} edges={report.blastEdges} compact />
          )}
          {activeTab === "details" && (
            <DetailsPanel
              report={report}
              context={context}
              textStatus={textStatus.label}
              rodataStatus={rodataStatus.label}
              elapsed={elapsed}
              recon={recon}
            />
          )}
        </div>
      </div>

      <div className="analyze-playground-footer">
        <div className="analyze-playground-footer-stats">
          {[
            ["Findings", displayFindings.length],
            ["CPI targets", report.summary.newCpiTargets],
            ["Elapsed", elapsed],
          ].map(([label, val]) => (
            <div key={label as string} className="analyze-playground-stat">
              <span>{label}</span>
              <strong>{val}</strong>
            </div>
          ))}
        </div>
        <span className="analyze-playground-footer-time report-mono">
          {formatTimestamp(context?.analysisCompletedAt)}
        </span>
      </div>
    </div>
  );
}

function RiskMeter({ score, color }: { score: number; color: string }) {
  const circumference = 2 * Math.PI * 22;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="analyze-playground-risk-meter">
      <svg width="46" height="46" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle
          cx="28"
          cy="28"
          r="22"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="analyze-playground-risk-meter-label">
        <span style={{ color }}>{score}</span>
        <small>Risk</small>
      </div>
    </div>
  );
}

function FindingsPanel({
  findings,
  expandedId,
  onExpand,
}: {
  findings: DemoProgram["findings"];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
}) {
  if (findings.length === 0) {
    return <p className="analyze-playground-muted">No security findings for this upgrade pair.</p>;
  }

  return (
    <div className="analyze-playground-findings">
      {findings.map((f) => {
        const cfg = SEVERITY_CONFIG[f.severity];
        const p = presentFinding(f);
        const isExpanded = expandedId === f.id;
        return (
          <div
            key={f.id}
            className={`analyze-playground-finding${isExpanded ? " is-expanded" : ""}`}
            style={{ borderLeftColor: cfg.color }}
          >
            <button
              type="button"
              className="analyze-playground-finding-toggle"
              onClick={() => onExpand(isExpanded ? null : f.id)}
            >
              <span className="analyze-playground-finding-mark" style={{ color: cfg.color }}>
                {p.icon}
              </span>
              <span className="analyze-playground-finding-code report-mono">{f.code}</span>
              <span className="analyze-playground-finding-title">{p.title}</span>
              <span className="analyze-playground-finding-chevron" aria-hidden>
                ▾
              </span>
            </button>
            {isExpanded && (
              <div className="analyze-playground-finding-body">
                <p>{f.description}</p>
                <div className="analyze-playground-finding-rec">{f.recommendation}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailsPanel({
  report,
  context,
  textStatus,
  rodataStatus,
  elapsed,
  recon,
}: {
  report: DemoProgram;
  context?: ReportContext;
  textStatus: string;
  rodataStatus: string;
  elapsed: string;
  recon: ReturnType<typeof parseReconstructionMeta>;
}) {
  return (
    <div className="analyze-playground-details">
      <table className="audit-table">
        <thead>
          <tr>
            <th>Section</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>.text</td>
            <td>{textStatus}</td>
          </tr>
          <tr>
            <td>.rodata</td>
            <td>{rodataStatus}</td>
          </tr>
          <tr>
            <td>Writes (A / B)</td>
            <td>
              {recon.writesA ?? "—"} / {recon.writesB ?? "—"}
            </td>
          </tr>
          <tr>
            <td>Elapsed</td>
            <td>{elapsed}</td>
          </tr>
          <tr>
            <td>Cache</td>
            <td>{recon.cacheHit ? "Hit" : "Miss"}</td>
          </tr>
        </tbody>
      </table>

      <div className="analyze-playground-version-grid">
        <div>
          <h4>Version A</h4>
          {context?.prevUpgradeSignature ? (
            <AddressField label="Upgrade tx" value={context.prevUpgradeSignature} kind="tx" />
          ) : (
            <p className="analyze-playground-muted">
              Slot {report.fromSlot.toLocaleString("en-US")}
            </p>
          )}
        </div>
        <div>
          <h4>Version B</h4>
          {context?.upgradeSignature ? (
            <AddressField label="Upgrade tx" value={context.upgradeSignature} kind="tx" />
          ) : (
            <p className="analyze-playground-muted">Slot {report.toSlot.toLocaleString("en-US")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
