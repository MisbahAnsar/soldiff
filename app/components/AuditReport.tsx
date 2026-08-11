"use client";

import { useState } from "react";
import type { DemoProgram, Finding } from "@/app/data/demos";
import BlastRadius from "@/app/components/BlastRadius";
import DiffViewer from "@/app/components/DiffViewer";
import {
  AddressField,
  SeverityBadge,
  StatGrid,
} from "@/app/components/report/ReportChrome";
import {
  executiveBullets,
  formatElapsed,
  formatTimestamp,
  getRiskBanner,
  getRiskLevel,
  parseReconstructionMeta,
  presentFinding,
  sectionStatus,
  severityLabel,
  type ReportContext,
} from "@/app/lib/report-presenter";

const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "risk", label: "Risk" },
  { id: "findings", label: "Findings" },
  { id: "sections", label: "Sections" },
  { id: "bytecode", label: "Bytecode" },
  { id: "blast", label: "Blast (synthetic)" },
  { id: "reconstruction", label: "Reconstruction" },
  { id: "versions", label: "Versions" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

interface Props {
  report: DemoProgram;
  context?: ReportContext;
}

export default function AuditReport({ report, context }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("summary");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(
    report.findings.find((f) => f.code !== "NO_CHANGE")?.id ?? null
  );

  const risk = getRiskLevel(report.riskScore);
  const banner = getRiskBanner(report.riskScore, report.findings);
  const recon = parseReconstructionMeta(report.description);
  const textStatus = sectionStatus(report.instructionDiff, "text");
  const rodataStatus = sectionStatus(report.accountDiff, "rodata");
  const bullets = executiveBullets(report);
  const totalFindings = report.findings.filter((f) => f.code !== "NO_CHANGE").length;
  const elapsed =
    context?.analysisStartedAt && context?.analysisCompletedAt
      ? formatElapsed(context.analysisCompletedAt - context.analysisStartedAt)
      : "—";

  const noChangeFinding = report.findings.find((f) => f.code === "NO_CHANGE");
  const visibleFindings = report.findings.filter((f) => f.code !== "NO_CHANGE");
  const displayFindings = noChangeFinding ? [noChangeFinding] : visibleFindings;

  const riskColor =
    report.riskScore >= 80
      ? "var(--sev-critical)"
      : report.riskScore >= 50
        ? "var(--sev-high)"
        : report.riskScore >= 25
          ? "var(--sev-medium)"
          : "var(--sev-safe)";

  return (
    <div className="audit-playground">
      <aside className="audit-playground-nav" aria-label="Report sections">
        <div className="audit-playground-nav-head">
          <span>Sections</span>
          <span className="audit-playground-nav-count">{SECTIONS.length}</span>
        </div>
        <div className="audit-playground-nav-list">
          {SECTIONS.map((item) => {
            const isActive = activeSection === item.id;
            const badge =
              item.id === "findings"
                ? totalFindings || (noChangeFinding ? 1 : 0)
                : item.id === "bytecode"
                  ? report.instructionDiff.filter(
                      (l) => l.type === "added" || l.type === "removed"
                    ).length
                  : null;
            return (
              <button
                key={item.id}
                type="button"
                className={`audit-playground-nav-btn${isActive ? " is-active" : ""}`}
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
                {badge !== null && badge > 0 && (
                  <span className="audit-playground-nav-badge">{badge}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="audit-playground-nav-foot">
          Live data from on-chain reconstruction
        </div>
      </aside>

      <div className="audit-playground-main">
        <div className="audit-playground-header">
          <RiskMeter score={report.riskScore} color={riskColor} />
          <div className="audit-playground-header-meta">
            <div className="audit-playground-header-title">
              <span>{report.name}</span>
              <span className="audit-playground-risk-tag" style={{ borderColor: riskColor, color: riskColor }}>
                {risk.label}
              </span>
            </div>
            <div className="audit-playground-header-sub report-mono">
              {report.programId.slice(0, 14)}…{report.programId.slice(-4)}
              <span> · </span>
              {report.fromSlot.toLocaleString("en-US")} → {report.toSlot.toLocaleString("en-US")}
            </div>
          </div>
          {recon.cacheHit && (
            <span className="playground-badge playground-badge-cache">cache hit</span>
          )}
        </div>

        <div className="audit-playground-content">
          {activeSection === "summary" && (
            <div className="audit-panel-scroll">
              <div className="audit-panel-block">
                <div className="audit-panel-eyebrow">SolDiff Upgrade Report</div>
                <div className="audit-summary-grid">
                  <SummaryStat label="Observed change" value={`${report.riskScore}/100`} accent={riskColor} />
                  <SummaryStat label="Findings" value={String(totalFindings)} />
                  <SummaryStat label="Analysis time" value={elapsed} />
                  <SummaryStat
                    label="Reconstruction"
                    value={recon.cacheHit ? "Cache hit" : "Complete"}
                  />
                </div>
                <AddressField label="Program ID" value={report.programId} />
                <ul className="audit-bullet-list compact">
                  {bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="audit-muted compact">{report.description}</p>
              </div>
            </div>
          )}

          {activeSection === "risk" && (
            <div className="audit-panel-scroll">
              <div className={`audit-risk-banner tone-${banner.tone} flat`}>
                <div className="audit-risk-banner-title">{banner.title}</div>
                <p className="audit-risk-banner-reason">{banner.reason}</p>
              </div>
              <div className="audit-panel-block">
                <StatGrid
                  items={[
                    { label: "Observed change score", value: `${report.riskScore}/100` },
                    { label: "Critical", value: String(report.summary.critical) },
                    { label: "High", value: String(report.summary.high) },
                    { label: "Medium", value: String(report.summary.medium) },
                    {
                      label: "Proven new CPI targets",
                      value: String(report.summary.newCpiTargets),
                    },
                    {
                      label: "SBF insn deltas (A/R/R)",
                      value: String(report.summary.instructionsChanged),
                    },
                  ]}
                />
              </div>
            </div>
          )}

          {activeSection === "findings" && (
            <div className="audit-panel-scroll">
              {displayFindings.length === 0 ? (
                <p className="audit-muted">No security findings for this upgrade pair.</p>
              ) : (
                <FindingsList
                  findings={displayFindings}
                  expandedId={expandedFinding}
                  onExpand={setExpandedFinding}
                />
              )}
            </div>
          )}

          {activeSection === "sections" && (
            <div className="audit-panel-scroll">
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
                    <td>
                      <span className={textStatus.tone === "changed" ? "status-changed" : "status-ok"}>
                        {textStatus.label}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>.rodata</td>
                    <td>
                      <span className={rodataStatus.tone === "changed" ? "status-changed" : "status-ok"}>
                        {rodataStatus.label}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Program size</td>
                    <td>
                      <span className={textStatus.tone === "changed" ? "status-changed" : "status-ok"}>
                        {textStatus.tone === "changed" ? "Changed" : "Same"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>ELF header</td>
                    <td>
                      <span className="status-ok">Unchanged</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeSection === "bytecode" && (
            <div className="audit-panel-scroll">
              <DiffViewer lines={report.instructionDiff} title=".text section" compact />
              <div style={{ height: 12 }} />
              <DiffViewer lines={report.accountDiff} title=".rodata section" compact />
            </div>
          )}

          {activeSection === "blast" && (
            <div className="audit-panel-scroll audit-panel-blast">
              <p className="audit-muted compact" style={{ marginBottom: 12 }}>
                Synthetic blast-radius visualization — not an on-chain dependency graph.
                Nodes are inferred from sampled byte patterns and report structure, not proven
                CPI / PDA edges.
              </p>
              <BlastRadius nodes={report.blastNodes} edges={report.blastEdges} compact />
            </div>
          )}

          {activeSection === "reconstruction" && (
            <div className="audit-panel-scroll">
              <StatGrid
                items={[
                  {
                    label: "Method",
                    value:
                      context?.versionA?.reconstructionMethod ??
                      context?.versionB?.reconstructionMethod ??
                      "buffer-write-replay",
                  },
                  {
                    label: "Writes (Version A)",
                    value:
                      context?.versionA?.writeTransactionCount !== undefined
                        ? String(context.versionA.writeTransactionCount)
                        : recon.writesA !== null
                          ? String(recon.writesA)
                          : "—",
                  },
                  {
                    label: "Writes (Version B)",
                    value:
                      context?.versionB?.writeTransactionCount !== undefined
                        ? String(context.versionB.writeTransactionCount)
                        : recon.writesB !== null
                          ? String(recon.writesB)
                          : "—",
                  },
                  { label: "Elapsed", value: elapsed },
                  {
                    label: "Coverage A/B",
                    value: `${context?.versionA?.coverageComplete ?? "?"} / ${context?.versionB?.coverageComplete ?? "?"}`,
                  },
                  {
                    label: "Verified build",
                    value: "Not claimed",
                  },
                ]}
              />
              {context?.limitations && context.limitations.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 className="audit-version-heading">Limitations</h4>
                  <ul className="audit-muted" style={{ paddingLeft: 18, fontSize: 13 }}>
                    {context.limitations.map((lim) => (
                      <li key={lim}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeSection === "versions" && (
            <div className="audit-panel-scroll">
              <div className="audit-version-grid">
                <ProvenanceColumn
                  title="Version A — before"
                  fallbackSig={context?.prevUpgradeSignature}
                  fallbackSlot={context?.prevUpgradeSlot ?? report.fromSlot}
                  provenance={context?.versionA}
                />
                <ProvenanceColumn
                  title="Version B — after"
                  fallbackSig={context?.upgradeSignature}
                  fallbackSlot={context?.upgradeSlot ?? report.toSlot}
                  provenance={context?.versionB}
                />
              </div>
              <p className="audit-muted compact" style={{ marginTop: 16 }}>
                Completed {formatTimestamp(context?.analysisCompletedAt)}
                {context?.framework ? ` · framework heuristic: ${context.framework}` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="audit-playground-footer">
          <div className="audit-playground-footer-stats">
            <span>
              SBF insn deltas{" "}
              <strong>{report.summary.instructionsChanged}</strong>
            </span>
            <span>
              Pubkey candidates <strong>{report.summary.accountsAffected}</strong>
            </span>
            <span>
              Synthetic blast nodes{" "}
              <strong>{report.blastNodes.filter((n) => n.changed).length}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvenanceColumn({
  title,
  fallbackSig,
  fallbackSlot,
  provenance,
}: {
  title: string;
  fallbackSig?: string;
  fallbackSlot: number;
  provenance?: ReportContext["versionA"];
}) {
  const sig = provenance?.upgradeSignature ?? fallbackSig;
  const slot = provenance?.upgradeSlot ?? fallbackSlot;
  return (
    <div className="audit-version-col">
      <h4 className="audit-version-heading">{title}</h4>
      {sig ? <AddressField label="Upgrade signature" value={sig} kind="tx" /> : null}
      <div className="audit-version-meta">
        <span>Slot</span>
        <code className="report-mono">{slot.toLocaleString("en-US")}</code>
      </div>
      {provenance?.bufferAddress && (
        <AddressField label="Buffer" value={provenance.bufferAddress} />
      )}
      {provenance?.sha256 && (
        <div className="audit-version-meta">
          <span>SHA-256</span>
          <code className="report-mono" style={{ wordBreak: "break-all" }}>
            {provenance.sha256}
          </code>
        </div>
      )}
      {provenance?.byteLength !== undefined && (
        <div className="audit-version-meta">
          <span>Size</span>
          <code className="report-mono">{provenance.byteLength.toLocaleString("en-US")} bytes</code>
        </div>
      )}
      {provenance?.coverageComplete !== undefined && (
        <div className="audit-version-meta">
          <span>Coverage</span>
          <code className="report-mono">
            {provenance.coverageComplete ? "complete" : "incomplete"}
          </code>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="audit-summary-stat">
      <div className="audit-summary-stat-label">{label}</div>
      <div className="audit-summary-stat-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

function RiskMeter({ score, color }: { score: number; color: string }) {
  const circumference = 2 * Math.PI * 22;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="audit-risk-meter">
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
      <div className="audit-risk-meter-label">
        <span style={{ color }}>{score}</span>
        <span>Risk</span>
      </div>
    </div>
  );
}

function FindingsList({
  findings,
  expandedId,
  onExpand,
}: {
  findings: Finding[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
}) {
  return (
    <div className="audit-findings-compact">
      {findings.map((f) => {
        const p = presentFinding(f);
        const isExpanded = expandedId === f.id;
        const isNoChange = f.code === "NO_CHANGE";
        return (
          <div
            key={f.id}
            className={`audit-finding-row${isExpanded ? " is-expanded" : ""}${isNoChange ? " tone-safe" : ""}`}
          >
            <button
              type="button"
              className="audit-finding-row-btn"
              onClick={() => onExpand(isExpanded ? null : f.id)}
            >
              <span className="audit-finding-row-icon" aria-hidden>
                {p.icon}
              </span>
              <span className="audit-finding-row-title">{p.title}</span>
              <SeverityBadge severity={severityLabel(f.severity)} />
            </button>
            {isExpanded && (
              <div className="audit-finding-row-body">
                <p>{f.description}</p>
                {(f.analyzer || f.confidence) && (
                  <p className="audit-muted compact">
                    {f.analyzer ? `Analyzer: ${f.analyzer}` : ""}
                    {f.analyzer && f.confidence ? " · " : ""}
                    {f.confidence ? `Confidence: ${f.confidence}` : ""}
                  </p>
                )}
                {f.evidence?.summary && (
                  <p className="audit-muted compact">Evidence: {f.evidence.summary}</p>
                )}
                {f.after && <AddressField label="Program / target" value={f.after} />}
                <div className="audit-finding-rec compact">
                  <div className="audit-finding-rec-label">Recommendation</div>
                  <p>{f.recommendation}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
