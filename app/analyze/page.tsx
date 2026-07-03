"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";
import ReportPanel from "@/app/components/ReportPanel";
import type { DemoProgram } from "@/app/data/demos";
import {
  LOADING_STAGES_UI,
  type ReportContext,
} from "@/app/lib/report-presenter";

const LOADING_STAGES = [...LOADING_STAGES_UI];

const PROVEN_EXAMPLE = {
  label: "Solayer endoAVS Program",
  programId: "endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT",
  solscanUrl: "https://solscan.io/account/endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT",
  prevUpgradeSignature:
    "5BzTSCsM5PLEx2zcucUHS14Xo2yQa112UN8D6C4s38j25nHA4FWnLSQsGQyVnJFy8qFXas7UF9qGxN13DSkg7tFq",
  upgradeSignature:
    "2b6hpipHgNsF24b5Sb2wUHNtbMhdVPNMhvL73ANxdPmQb14MJjQWJpym9gawYDtfSup2LfJ45iEX86c1WgsfXU3s",
} as const;

export default function AnalyzePage() {
  const [programId, setProgramId] = useState("");
  const [label, setLabel] = useState("");
  const [prevUpgradeSignature, setPrevUpgradeSignature] = useState("");
  const [upgradeSignature, setUpgradeSignature] = useState("");
  const [prevUpgradeSlot, setPrevUpgradeSlot] = useState<number | null>(null);
  const [upgradeSlot, setUpgradeSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(LOADING_STAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [report, setReport] = useState<DemoProgram | null>(null);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [reportContext, setReportContext] = useState<ReportContext | undefined>();
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const canDiff =
    Boolean(programId.trim()) &&
    Boolean(prevUpgradeSignature.trim()) &&
    Boolean(upgradeSignature.trim());

  const isProvenExampleActive =
    programId.trim() === PROVEN_EXAMPLE.programId &&
    label.trim() === PROVEN_EXAMPLE.label &&
    prevUpgradeSignature.trim() === PROVEN_EXAMPLE.prevUpgradeSignature &&
    upgradeSignature.trim() === PROVEN_EXAMPLE.upgradeSignature;

  useEffect(() => {
    if (!loading || analysisStartedAt === null) return;
    const tick = () => setElapsedMs(Date.now() - analysisStartedAt);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [loading, analysisStartedAt]);

  const fillProvenExample = () => {
    setProgramId(PROVEN_EXAMPLE.programId);
    setLabel(PROVEN_EXAMPLE.label);
    setPrevUpgradeSignature(PROVEN_EXAMPLE.prevUpgradeSignature);
    setUpgradeSignature(PROVEN_EXAMPLE.upgradeSignature);
    setPrevUpgradeSlot(null);
    setUpgradeSlot(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAnalysisError(null);
    setReport(null);

    if (!programId.trim()) {
      setError("Program ID is required.");
      return;
    }
    if (!prevUpgradeSignature.trim()) {
      setError("Version A (before) upgrade signature is required.");
      return;
    }
    if (!upgradeSignature.trim()) {
      setError("Version B (after) upgrade signature is required.");
      return;
    }
    if (prevUpgradeSignature.trim() === upgradeSignature.trim()) {
      setError("Version A and Version B must be different upgrade transactions.");
      return;
    }

    const startedAt = Date.now();
    setAnalysisStartedAt(startedAt);
    setElapsedMs(0);
    setLoading(true);
    setLoadingStageIndex(0);
    setLoadingStage(LOADING_STAGES[0]);

    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, LOADING_STAGES.length - 2);
      setLoadingStageIndex(stageIdx);
      setLoadingStage(LOADING_STAGES[stageIdx]);
    }, 12000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    try {
      const res = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          programId: programId.trim(),
          prevUpgradeSignature: prevUpgradeSignature.trim(),
          upgradeSignature: upgradeSignature.trim(),
          prevUpgradeSlot: prevUpgradeSlot ?? undefined,
          upgradeSlot: upgradeSlot ?? undefined,
          label: label.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");

      setLoadingStageIndex(LOADING_STAGES.length - 1);
      setLoadingStage(LOADING_STAGES[LOADING_STAGES.length - 1]);
      setReportContext({
        prevUpgradeSignature: prevUpgradeSignature.trim(),
        upgradeSignature: upgradeSignature.trim(),
        prevUpgradeSlot,
        upgradeSlot,
        analysisStartedAt: startedAt,
        analysisCompletedAt: Date.now(),
      });
      setAnalysisError(null);
      setReport(data.report);
    } catch (err) {
      setReport(null);
      if (err instanceof Error && err.name === "AbortError") {
        setAnalysisError(
          "Analysis timed out after 10 minutes. Try a smaller program or check RPC rate limits."
        );
      } else {
        setAnalysisError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(stageTimer);
      setLoading(false);
      setAnalysisStartedAt(null);
    }
  };

  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 80, minHeight: "100vh", background: "var(--bg-base)" }}>
        <div className="container-wide" style={{ paddingBottom: 80 }}>
          <div style={{ marginBottom: 32 }}>
            <Link href="/" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
              ← Back to home
            </Link>
            <h1
              style={{
                fontFamily: "var(--font-serif), 'Instrument Serif', Georgia, serif",
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 400,
                marginTop: 16,
                marginBottom: 8,
                letterSpacing: "-0.02em",
              }}
            >
              Diff two on-chain versions
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                color: "var(--text-secondary)",
                fontSize: 15,
                maxWidth: 640,
                lineHeight: 1.6,
              }}
            >
              Enter one program ID and two BPF upgrade transaction signatures — the older version
              (before) and the newer version (after). SolDiff reconstructs bytecode from on-chain
              Write transactions and produces a security diff report.
            </p>
          </div>

          <div
            className="analyze-layout"
            style={{
              display: "grid",
              gridTemplateColumns:
                report || loading || analysisError
                  ? "minmax(280px, 340px) minmax(0, 1fr)"
                  : "minmax(300px, 380px) minmax(0, 1fr)",
              gap: 28,
              alignItems: "start",
            }}
          >
            <form
              onSubmit={handleSubmit}
              style={{
                padding: 24,
                borderRadius: 14,
                border: "1px solid var(--border-strong)",
                background: "var(--bg-surface)",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div className="analyze-tip-callout">
                <span className="analyze-tip-label">Tip</span>
                <p>
                  For the best experience, use upgradeable programs under 450,000 bytes. Larger
                  programs require many historical Write transactions and may take much longer to
                  process.
                </p>
              </div>

              <fieldset
                style={{
                  border: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <legend
                  style={{
                    ...labelStyle,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    marginBottom: 4,
                  }}
                >
                  Proven example
                </legend>
                <button
                  type="button"
                  className={`analyze-example-btn${isProvenExampleActive ? " is-active" : ""}`}
                  onClick={fillProvenExample}
                >
                  <span className="analyze-example-badge">Proven working example</span>
                  <span className="analyze-example-title">
                    Solayer endoAVS — proven historical upgrade diff
                  </span>
                  <span className="analyze-example-meta">
                    {PROVEN_EXAMPLE.programId.slice(0, 8)}…{PROVEN_EXAMPLE.programId.slice(-4)}
                  </span>
                </button>
                <a
                  href={PROVEN_EXAMPLE.solscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="analyze-example-link"
                >
                  View on Solscan ↗
                </a>
              </fieldset>

              <fieldset
                style={{
                  border: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <legend
                  style={{
                    ...labelStyle,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    marginBottom: 4,
                  }}
                >
                  Program
                </legend>
                <div>
                  <label style={labelStyle}>Program ID *</label>
                  <input
                    required
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    placeholder={PROVEN_EXAMPLE.programId}
                    style={inputStyle}
                    spellCheck={false}
                  />
                  <p style={hintStyle}>
                    Executable program address from Solscan — not ProgramData.
                  </p>
                </div>
                <div>
                  <label style={labelStyle}>Label (optional)</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={PROVEN_EXAMPLE.label}
                    style={inputStyle}
                  />
                </div>
              </fieldset>

              <fieldset
                style={{
                  border: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <legend
                  style={{
                    ...labelStyle,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    marginBottom: 4,
                  }}
                >
                  Version A — before upgrade
                </legend>
                <div>
                  <label style={labelStyle}>Upgrade transaction signature *</label>
                  <input
                    required
                    value={prevUpgradeSignature}
                    onChange={(e) => {
                      setPrevUpgradeSignature(e.target.value);
                      setPrevUpgradeSlot(null);
                    }}
                    placeholder="Older BPF Upgrade tx signature"
                    style={inputStyle}
                    spellCheck={false}
                  />
                  <p style={hintStyle}>The on-chain upgrade that deployed the prior bytecode.</p>
                </div>
              </fieldset>

              <fieldset
                style={{
                  border: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <legend
                  style={{
                    ...labelStyle,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    marginBottom: 4,
                  }}
                >
                  Version B — after upgrade
                </legend>
                <div>
                  <label style={labelStyle}>Upgrade transaction signature *</label>
                  <input
                    required
                    value={upgradeSignature}
                    onChange={(e) => {
                      setUpgradeSignature(e.target.value);
                      setUpgradeSlot(null);
                    }}
                    placeholder="Newer BPF Upgrade tx signature"
                    style={inputStyle}
                    spellCheck={false}
                  />
                  <p style={hintStyle}>The upgrade you want to audit — compared against Version A.</p>
                </div>
              </fieldset>

              {error && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--sev-critical-soft)",
                    border: "1px solid var(--sev-critical-border)",
                    color: "var(--sev-critical)",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              )}

              <p className="analyze-runtime-note">
                Large programs can take 4–6 minutes to reconstruct and compare. For faster, more
                reliable results, use programs under 450,000 bytes. Programs larger than 450,000
                bytes may take significantly longer or exceed available memory/time limits.
              </p>

              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !canDiff}
                style={{ justifyContent: "center" }}
              >
                {loading ? "Analyzing…" : "Run diff"}
              </button>
            </form>

            <ReportPanel
              report={report}
              loading={loading}
              loadingStage={loadingStage}
              loadingStageIndex={loadingStageIndex}
              elapsedMs={elapsedMs}
              error={analysisError}
              context={reportContext}
            />
          </div>
        </div>
      </main>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
  letterSpacing: "-0.01em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
  outline: "none",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginTop: 6,
  lineHeight: 1.45,
};
