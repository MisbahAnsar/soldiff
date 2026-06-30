"use client";

import type { DemoProgram } from "@/app/data/demos";
import type { ReportContext } from "@/app/lib/report-presenter";
import { LOADING_STAGES_UI } from "@/app/lib/report-presenter";
import AuditReport from "@/app/components/AuditReport";

interface ReportPanelProps {
  report: DemoProgram | null;
  loading?: boolean;
  loadingStage?: string;
  loadingProgress?: number;
  loadingStageIndex?: number;
  emptyMessage?: string;
  context?: ReportContext;
}

export default function ReportPanel({
  report,
  loading = false,
  loadingStage = LOADING_STAGES_UI[0],
  loadingProgress = 0,
  loadingStageIndex = 0,
  emptyMessage = "Run an analysis to see the security audit report here.",
  context,
}: ReportPanelProps) {
  if (!report && !loading) {
    return (
      <div className="report-empty">
        <div className="report-empty-icon">◎</div>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="report-loading">
        <div className="report-loading-header">
          <h2 className="report-loading-title">Analyzing upgrade…</h2>
          <span className="report-loading-pct">{loadingProgress}%</span>
        </div>
        <div className="report-loading-bar">
          <div className="report-loading-fill" style={{ width: `${loadingProgress}%` }} />
        </div>
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
          Large programs may take several minutes on Alchemy free tier. Keep this tab open.
        </p>
      </div>
    );
  }

  return <AuditReport report={report!} context={context} />;
}
