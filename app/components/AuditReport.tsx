"use client";

import type { DemoProgram } from "@/app/data/demos";
import BlastRadius from "@/app/components/BlastRadius";
import AuditDiffViewer from "@/app/components/AuditDiffViewer";
import {
  AddressField,
  ReportCard,
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

const NAV = [
  { id: "summary", label: "Summary" },
  { id: "risk", label: "Risk" },
  { id: "findings", label: "Findings" },
  { id: "sections", label: "Sections" },
  { id: "bytecode", label: "Bytecode" },
  { id: "blast", label: "Blast Radius" },
  { id: "reconstruction", label: "Reconstruction" },
  { id: "versions", label: "Versions" },
] as const;

interface Props {
  report: DemoProgram;
  context?: ReportContext;
}

export default function AuditReport({ report, context }: Props) {
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

  const visibleFindings = report.findings.filter((f) => f.code !== "NO_CHANGE");

  return (
    <div className="audit-report-layout">
      <nav className="audit-sidebar" aria-label="Report sections">
        <div className="audit-sidebar-title">Report</div>
        {NAV.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="audit-sidebar-link">
            {item.label}
          </a>
        ))}
      </nav>

      <div className="audit-report-main">
        {recon.cacheHit && (
          <div className="audit-cache-badge">
            <span className="audit-cache-dot" aria-hidden />
            Loaded from cache — analysis used cached ELF reconstruction
          </div>
        )}

        <header className="audit-hero" id="summary">
          <div className="audit-hero-eyebrow">SolDiff Upgrade Report</div>
          <h2 className="audit-hero-title">{report.name}</h2>
          <div className="audit-hero-grid">
            <div className="audit-hero-block">
              <div className="audit-hero-label">Program</div>
              <AddressField label="Program ID" value={report.programId} />
            </div>
            <div className="audit-hero-block">
              <div className="audit-hero-label">Upgrade</div>
              <div className="audit-hero-value report-mono">
                {report.fromSlot.toLocaleString("en-US")} → {report.toSlot.toLocaleString("en-US")}
              </div>
            </div>
            <div className="audit-hero-block">
              <div className="audit-hero-label">Overall Risk</div>
              <div className={`audit-risk-pill tone-${risk.tone}`}>
                {risk.emoji} {risk.label}
                <span className="audit-risk-score">{report.riskScore}/100</span>
              </div>
            </div>
            <div className="audit-hero-block">
              <div className="audit-hero-label">Findings</div>
              <div className="audit-hero-value">{totalFindings}</div>
            </div>
            <div className="audit-hero-block">
              <div className="audit-hero-label">Reconstruction</div>
              <div className="audit-hero-value">
                {recon.cacheHit ? "Cache hit" : recon.raw ?? "Complete"}
              </div>
            </div>
            <div className="audit-hero-block">
              <div className="audit-hero-label">Completed</div>
              <div className="audit-hero-value">
                {formatTimestamp(context?.analysisCompletedAt)}
              </div>
            </div>
          </div>
          <ul className="audit-bullet-list">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </header>

        <div className={`audit-risk-banner tone-${banner.tone}`} id="risk">
          <div className="audit-risk-banner-title">{banner.title}</div>
          <p className="audit-risk-banner-reason">{banner.reason}</p>
        </div>

        <ReportCard title="Findings" id="findings">
          {visibleFindings.length === 0 ? (
            <p className="audit-muted">No security findings for this upgrade pair.</p>
          ) : (
            <div className="audit-findings-grid">
              {visibleFindings.map((f) => {
                const p = presentFinding(f);
                return (
                  <article key={f.id} className="audit-finding-card">
                    <div className="audit-finding-head">
                      <span className="audit-finding-icon" aria-hidden>
                        {p.icon}
                      </span>
                      <div>
                        <h4 className="audit-finding-title">{p.title}</h4>
                        {f.instruction && f.instruction !== f.code && (
                          <div className="audit-finding-sub">{f.instruction}</div>
                        )}
                      </div>
                      <SeverityBadge severity={severityLabel(f.severity)} />
                    </div>
                    <p className="audit-finding-desc">{f.description}</p>
                    {(f.before || f.after) && (
                      <div className="audit-finding-refs">
                        {f.after && (
                          <AddressField label="Program / target" value={f.after} />
                        )}
                      </div>
                    )}
                    <div className="audit-finding-rec">
                      <div className="audit-finding-rec-label">Recommendation</div>
                      <p>{f.recommendation}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </ReportCard>

        <ReportCard title="Section Changes" id="sections">
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
                <td>Program Size</td>
                <td>
                  <span className={textStatus.tone === "changed" ? "status-changed" : "status-ok"}>
                    {textStatus.tone === "changed" ? "Changed" : "Same"}
                  </span>
                </td>
              </tr>
              <tr>
                <td>ELF Header</td>
                <td>
                  <span className="status-ok">Unchanged</span>
                </td>
              </tr>
            </tbody>
          </table>
        </ReportCard>

        <ReportCard title="Bytecode Diff" id="bytecode">
          <AuditDiffViewer lines={report.instructionDiff} sectionName=".text" />
          <div style={{ height: 16 }} />
          <AuditDiffViewer lines={report.accountDiff} sectionName=".rodata" />
        </ReportCard>

        <ReportCard title="Blast Radius" id="blast">
          <BlastRadius nodes={report.blastNodes} edges={report.blastEdges} audit />
        </ReportCard>

        <ReportCard title="Reconstruction Statistics" id="reconstruction">
          <StatGrid
            items={[
              {
                label: "Program Size",
                value: textStatus.tone === "changed" ? "Changed" : "Stable",
              },
              {
                label: "Writes (Version A)",
                value: recon.writesA !== null ? String(recon.writesA) : "—",
              },
              {
                label: "Writes (Version B)",
                value: recon.writesB !== null ? String(recon.writesB) : "—",
              },
              { label: "Elapsed", value: elapsed },
              { label: "RPC Provider", value: "Alchemy Archive" },
              {
                label: "Cache",
                value: recon.cacheHit ? "Hit" : "Miss",
              },
            ]}
          />
        </ReportCard>

        <ReportCard title="Version Information" id="versions">
          <div className="audit-version-grid">
            <div className="audit-version-col">
              <h4 className="audit-version-heading">Version A — before</h4>
              {context?.prevUpgradeSignature ? (
                <>
                  <AddressField
                    label="Upgrade signature"
                    value={context.prevUpgradeSignature}
                    kind="tx"
                  />
                  <div className="audit-version-meta">
                    <span>Slot</span>
                    <code className="report-mono">
                      {(context.prevUpgradeSlot ?? report.fromSlot).toLocaleString("en-US")}
                    </code>
                  </div>
                </>
              ) : (
                <p className="audit-muted">Slot {report.fromSlot.toLocaleString("en-US")}</p>
              )}
            </div>
            <div className="audit-version-col">
              <h4 className="audit-version-heading">Version B — after</h4>
              {context?.upgradeSignature ? (
                <>
                  <AddressField
                    label="Upgrade signature"
                    value={context.upgradeSignature}
                    kind="tx"
                  />
                  <div className="audit-version-meta">
                    <span>Slot</span>
                    <code className="report-mono">
                      {(context.upgradeSlot ?? report.toSlot).toLocaleString("en-US")}
                    </code>
                  </div>
                </>
              ) : (
                <p className="audit-muted">Slot {report.toSlot.toLocaleString("en-US")}</p>
              )}
            </div>
          </div>
        </ReportCard>
      </div>
    </div>
  );
}
