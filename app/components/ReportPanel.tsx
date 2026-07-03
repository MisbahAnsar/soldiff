"use client";

import type { DemoProgram } from "@/app/data/demos";
import type { ReportContext } from "@/app/lib/report-presenter";
import { LOADING_STAGES_UI, formatElapsed } from "@/app/lib/report-presenter";
import AuditReport from "@/app/components/AuditReport";

interface ReportPanelProps {
  report: DemoProgram | null;
  loading?: boolean;
  loadingStage?: string;
  loadingStageIndex?: number;
  elapsedMs?: number;
  emptyMessage?: string;
  error?: string | null;
  context?: ReportContext;
}

function PlaygroundFrame({
  badge,
  children,
}: {
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <div className="analyze-playground-frame">
      <div className="analyze-playground-toolbar">
        <div className="analyze-playground-toolbar-left">
          <div className="analyze-playground-dots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <span className="analyze-playground-title">soldiff · live analysis</span>
        </div>
        <span className="analyze-playground-badge">{badge}</span>
      </div>
      <div className="analyze-playground-shell">{children}</div>
    </div>
  );
}

export default function ReportPanel({
  report,
  loading = false,
  loadingStage = LOADING_STAGES_UI[0],
  loadingStageIndex = 0,
  elapsedMs = 0,
  emptyMessage = "Run an analysis to see the security audit report here.",
  error = null,
  context,
}: ReportPanelProps) {
  if (!report && !loading && !error) {
    return (
      <PlaygroundFrame badge="awaiting input">
        <div className="analyze-playground-empty">
          <div className="analyze-playground-empty-icon">◎</div>
          <p>{emptyMessage}</p>
        </div>
      </PlaygroundFrame>
    );
  }

  if (!report && !loading && error) {
    return (
      <PlaygroundFrame badge="analysis failed">
        <div className="analyze-playground-error">
          <div className="analyze-playground-error-icon" aria-hidden>
            !
          </div>
          <h2 className="analyze-playground-error-title">Analysis failed</h2>
          <p className="analyze-playground-error-message">{error}</p>
          <p className="analyze-playground-error-hint">
            Large programs can exhaust Node heap during diff. Retry with{" "}
            <code className="report-mono">NODE_OPTIONS=--max-old-space-size=8192</code> or use a
            program under 450,000 bytes.
          </p>
        </div>
      </PlaygroundFrame>
    );
  }

  if (loading) {
    return (
      <PlaygroundFrame badge="reconstructing">
        <div className="analyze-playground-loading">
          <div className="analyze-playground-loading-head">
            <h2 className="analyze-playground-loading-title">Analyzing upgrade…</h2>
            <span className="analyze-playground-elapsed">{formatElapsed(elapsedMs)}</span>
          </div>
          <p className="analyze-playground-loading-lead">
            Reconstructing historical program versions. Large programs may take 4–6 minutes. Please
            keep this page open.
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
          <p className="analyze-playground-loading-current">{loadingStage}</p>
          <p className="analyze-playground-loading-hint">
            Do not refresh or close this tab while reconstruction is in progress.
          </p>
        </div>
      </PlaygroundFrame>
    );
  }

  return (
    <PlaygroundFrame badge="report ready">
      <AuditReport report={report!} context={context} />
    </PlaygroundFrame>
  );
}
