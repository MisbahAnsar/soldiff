"use client";

import Link from "next/link";
import { useState } from "react";
import Navbar from "@/app/components/Navbar";
import ReportPanel from "@/app/components/ReportPanel";
import type { DemoProgram } from "@/app/data/demos";
import {
  LOADING_STAGES_UI,
  type ReportContext,
} from "@/app/lib/report-presenter";

const LOADING_STAGES = [...LOADING_STAGES_UI];

interface UpgradeEntry {
  slot: number;
  signature: string;
  suggestedFromSlot: number;
  suggestedToSlot: number;
  diffable: boolean;
}

export default function AnalyzePage() {
  const [programId, setProgramId] = useState("");
  const [label, setLabel] = useState("");
  const [prevUpgradeSignature, setPrevUpgradeSignature] = useState("");
  const [upgradeSignature, setUpgradeSignature] = useState("");
  const [prevUpgradeSlot, setPrevUpgradeSlot] = useState<number | null>(null);
  const [upgradeSlot, setUpgradeSlot] = useState<number | null>(null);
  const [upgrades, setUpgrades] = useState<UpgradeEntry[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [showUpgradeHelper, setShowUpgradeHelper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(LOADING_STAGES[0]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DemoProgram | null>(null);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [reportContext, setReportContext] = useState<ReportContext | undefined>();

  const canDiff =
    Boolean(programId.trim()) &&
    Boolean(prevUpgradeSignature.trim()) &&
    Boolean(upgradeSignature.trim());

  const detectUpgrades = async () => {
    const id = programId.trim();
    if (!id) {
      setError("Enter a program ID first.");
      return;
    }
    setDetecting(true);
    setError(null);
    setUpgrades([]);
    setShowUpgradeHelper(true);

    try {
      const res = await fetch(`/api/upgrades?programId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to detect upgrades");
      setUpgrades(data.upgrades ?? []);
      if ((data.upgrades ?? []).length === 0) {
        setError("No upgrade transactions found for this program.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDetecting(false);
    }
  };

  const selectUpgradePair = (u: UpgradeEntry, index: number) => {
    const prev = upgrades[index + 1];
    if (!prev) {
      setError("This is the earliest indexed upgrade — pick a newer one with a prior version.");
      return;
    }
    setPrevUpgradeSignature(prev.signature);
    setPrevUpgradeSlot(prev.slot);
    setUpgradeSignature(u.signature);
    setUpgradeSlot(u.slot);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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

    setLoading(true);
    setLoadingProgress(0);
    setLoadingStageIndex(0);
    setLoadingStage(LOADING_STAGES[0]);
    const startedAt = Date.now();

    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, LOADING_STAGES.length - 2);
      setLoadingStageIndex(stageIdx);
      setLoadingStage(LOADING_STAGES[stageIdx]);
    }, 12000);

    const progressTimer = setInterval(() => {
      setLoadingProgress((p) => Math.min(p + 1, 97));
    }, 2500);

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

      setLoadingProgress(100);
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
      setReport(data.report);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError(
          "Analysis timed out after 10 minutes. Try a smaller program or check RPC rate limits."
        );
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(stageTimer);
      clearInterval(progressTimer);
      setLoading(false);
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
            <p style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "var(--text-secondary)", fontSize: 15, maxWidth: 640, lineHeight: 1.6 }}>
              Enter one program ID and two BPF upgrade transaction signatures — the older version
              (before) and the newer version (after). SolDiff reconstructs bytecode from on-chain
              Write transactions and produces a security diff report.
            </p>
          </div>

          <div
            className="analyze-layout"
            style={{
              display: "grid",
              gridTemplateColumns: report ? "minmax(280px, 340px) minmax(0, 1fr)" : "minmax(300px, 380px) minmax(0, 1fr)",
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
              <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <legend style={{ ...labelStyle, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>
                  Program
                </legend>
                <div>
                  <label style={labelStyle}>Program ID *</label>
                  <input
                    required
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    placeholder="Stk5NCWomVN3itaFjLu382u9ibb5jMSHEsh6CuhaGjB"
                    style={inputStyle}
                    spellCheck={false}
                  />
                  <p style={hintStyle}>
                    Executable program address from Solscan — not ProgramData
                    (e.g. Stk5NC… not CGAkmh…).
                  </p>
                </div>
                <div>
                  <label style={labelStyle}>Label (optional)</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Jupiter Aggregator"
                    style={inputStyle}
                  />
                </div>
              </fieldset>

              <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <legend style={{ ...labelStyle, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>
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

              <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <legend style={{ ...labelStyle, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>
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

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(107, 207, 143, 0.06)",
                  border: "1px solid rgba(107, 207, 143, 0.18)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                Reconstruction time depends on program size. Large programs (e.g. Jupiter) can take
                1–2 minutes per version on Alchemy free tier. Smaller upgradeable programs finish
                in seconds.
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={detecting || !programId.trim()}
                  onClick={detectUpgrades}
                  style={{ justifyContent: "center", width: "100%" }}
                >
                  {detecting ? "Scanning chain…" : "Help me find upgrade signatures"}
                </button>
                <p style={{ ...hintStyle, marginTop: 8 }}>
                  Optional — scans ProgramData history and fills both fields when you pick a pair.
                </p>
              </div>

              {showUpgradeHelper && upgrades.length > 0 && (
                <div>
                  <label style={labelStyle}>Pick consecutive upgrades</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                    {upgrades.map((u, index) => {
                      const hasPrior = u.diffable;
                      const selected =
                        upgradeSignature === u.signature &&
                        prevUpgradeSignature === upgrades[index + 1]?.signature;
                      return (
                        <button
                          key={u.signature}
                          type="button"
                          disabled={!hasPrior}
                          onClick={() => selectUpgradePair(u, index)}
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                            background: selected
                              ? "rgba(212, 165, 116, 0.08)"
                              : "rgba(255,255,255,0.02)",
                            color: "var(--text-secondary)",
                            fontSize: 11,
                            cursor: hasPrior ? "pointer" : "not-allowed",
                            fontFamily: "var(--font-mono), monospace",
                            opacity: hasPrior ? 1 : 0.45,
                          }}
                        >
                          <span style={{ fontSize: 10, color: hasPrior ? "#6bcf8f" : "var(--text-muted)" }}>
                            {hasPrior ? "PAIR" : "NO PRIOR"}
                          </span>
                          {" · "}slot {u.slot.toLocaleString("en-US")}
                          <br />
                          <span style={{ opacity: 0.7 }}>B: {u.signature.slice(0, 16)}…</span>
                          {hasPrior && (
                            <>
                              <br />
                              <span style={{ opacity: 0.5 }}>A: {upgrades[index + 1].signature.slice(0, 16)}…</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
              loadingProgress={loadingProgress}
              loadingStageIndex={loadingStageIndex}
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
