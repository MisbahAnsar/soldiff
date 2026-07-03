"use client";

import { useEffect, useState } from "react";
import type { DemoProgram } from "@/app/data/demos";
import type { ReportContext } from "@/app/lib/report-presenter";
import { LOADING_STAGES_UI, formatElapsed } from "@/app/lib/report-presenter";
import AuditReport from "@/app/components/AuditReport";

interface ReportPanelProps {
  report: DemoProgram | null;
  loading?: boolean;
  loadingStage?: string;
  loadingStageIndex?: number;
  loadingStartedAt?: number;
  emptyMessage?: string;
  error?: string | null;
  context?: ReportContext;
}

export default function ReportPanel({
  report,
  loading = false,
  loadingStage = LOADING_STAGES_UI[0],
  loadingStageIndex = 0,
  loadingStartedAt,
  emptyMessage = "Run an analysis to see the security audit report here.",
  error = null,
  context,
}: ReportPanelProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!loading || !loadingStartedAt) return;
    const tick = () => setElapsedMs(Date.now() - loadingStartedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [loading, loadingStartedAt]);

  return (
    <div className="playground-frame">
      <div className="playground-toolbar">
        <div className="playground-toolbar-left">
          <div className="playground-dots" aria-hidden>
            <span style={{ background: "#ff5f56" }} />
            <span style={{ background: "#ffbd2e" }} />
            <span style={{ background: "#27c93f" }} />
          </div>
          <span className="playground-toolbar-label">soldiff · live analysis</span>
        </div>
        <div className="playground-toolbar-right">
          {report && !loading && (
            <span className="playground-badge playground-badge-live">
              <span className="playground-badge-dot" />
              report ready
            </span>
          )}
          {loading && (
            <span className="playground-badge playground-badge-loading">reconstructing…</span>
          )}
        </div>
      </div>

      <div className="playground-shell">
        {loading && (
          <div className="report-loading">
            <div className="report-loading-header">
              <h2 className="report-loading-title">Analyzing upgrade…</h2>
              {loadingStartedAt ? (
                <span className="report-loading-elapsed">{formatElapsed(elapsedMs)}</span>
              ) : null}
            </div>
            <p className="report-loading-lead">
              Reconstructing historical program versions. Large programs may take 4–6 minutes.
              Please keep this page open.
            </p>
            <ol className="report-loading-steps">
              {LOADING_STAGES_UI.map((step, i) => {
                const state =
                  i < loadingStageIndex ? "done" : i === loadingStageIndex ? "active" : "pending";
                return (
                  <li key={step} className={`report-loading-step is-${state}`}>
                    <span className="report-loading-dot" />
                    {step}
                  </li>
                );
              })}
            </ol>
            <p className="report-loading-current">{loadingStage}</p>
            <p className="report-loading-hint">
              Do not refresh or close this tab while reconstruction is in progress.
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="report-error">
            <div className="report-error-icon" aria-hidden>
              !
            </div>
            <h2 className="report-error-title">Analysis failed</h2>
            <p className="report-error-message">{error}</p>
            <p className="report-error-hint">
              Programs larger than 450,000 bytes may exceed memory or time limits. Try a smaller
              upgradeable program or retry with{" "}
              <code className="report-mono">NODE_OPTIONS=--max-old-space-size=8192</code>.
            </p>
          </div>
        )}

        {!loading && !error && !report && (
          <div className="report-empty">
            <div className="report-empty-icon">◎</div>
            <p>{emptyMessage}</p>
          </div>
        )}

        {!loading && !error && report && <AuditReport report={report} context={context} />}
      </div>
    </div>
  );
}
