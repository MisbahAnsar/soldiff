"use client";

import Link from "next/link";
import { useState } from "react";
import Navbar from "@/app/components/Navbar";
import ReportPanel from "@/app/components/ReportPanel";
import type { DemoProgram } from "@/app/data/demos";

const LOADING_STAGES = [
  "Parsing upgrade transaction",
  "Fetching Write chunks (prior version)",
  "Fetching Write chunks (new version)",
  "Reconstructing ELF binaries",
  "Running structural diff",
  "Annotating risk patterns",
  "Report ready",
];

interface UpgradeEntry {
  slot: number;
  signature: string;
  suggestedFromSlot: number;
  suggestedToSlot: number;
  diffable: boolean;
}

const JUPITER_PROGRAM = "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB";

export default function AnalyzePage() {
  const [programId, setProgramId] = useState("");
  const [label, setLabel] = useState("");
  const [upgradeSignature, setUpgradeSignature] = useState("");
  const [selectedUpgradeSlot, setSelectedUpgradeSlot] = useState<number | null>(null);
  const [upgrades, setUpgrades] = useState<UpgradeEntry[]>([]);
  const [archiveEarliestSlot, setArchiveEarliestSlot] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(LOADING_STAGES[0]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DemoProgram | null>(null);

  const detectUpgrades = async () => {
    const id = programId.trim();
    if (!id) {
      setError("Enter a program ID first.");
      return;
    }
    setDetecting(true);
    setError(null);
    setUpgrades([]);
    setUpgradeSignature("");
    setSelectedUpgradeSlot(null);
    setArchiveEarliestSlot(null);

    try {
      const res = await fetch(`/api/upgrades?programId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to detect upgrades");
      setUpgrades(data.upgrades ?? []);
      setArchiveEarliestSlot(data.archiveEarliestSlot ?? null);
      if ((data.upgrades ?? []).length === 0) {
        setError("No upgrade transactions found for this program.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDetecting(false);
    }
  };

  const selectUpgrade = (u: UpgradeEntry) => {
    setUpgradeSignature(u.signature);
    setSelectedUpgradeSlot(u.slot);
    setError(
      u.diffable
        ? null
        : "This is the earliest indexed upgrade — there is no prior version to compare against."
    );
  };

  const selectedUpgrade = upgrades.find((u) => u.signature === upgradeSignature);
  const canDiff =
    (selectedUpgrade?.diffable ?? false) ||
    (Boolean(upgradeSignature.trim()) && !selectedUpgrade);

  const fillJupiterExample = () => {
    setProgramId(JUPITER_PROGRAM);
    setLabel("Jupiter Aggregator");
    setUpgradeSignature("");
    setUpgrades([]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setReport(null);

    if (!upgradeSignature.trim()) {
      setError("Detect upgrades and select one, or paste an upgrade transaction signature.");
      return;
    }

    if (selectedUpgrade && !selectedUpgrade.diffable) {
      setError(
        "This is the earliest indexed upgrade — pick a newer one (not the last item in the list)."
      );
      return;
    }

    setLoading(true);
    setLoadingProgress(0);
    setLoadingStage(LOADING_STAGES[0]);

    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, LOADING_STAGES.length - 1);
      setLoadingStage(LOADING_STAGES[stageIdx]);
    }, 900);

    const progressTimer = setInterval(() => {
      setLoadingProgress((p) => Math.min(p + 4, 92));
    }, 200);

    try {
      const res = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: programId.trim(),
          upgradeSignature: upgradeSignature.trim(),
          upgradeSlot: selectedUpgradeSlot ?? undefined,
          label: label.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");

      setLoadingProgress(100);
      setLoadingStage(LOADING_STAGES[LOADING_STAGES.length - 1]);
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
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
              Analyze a program upgrade
            </h1>
            <p style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "var(--text-secondary)", fontSize: 15, maxWidth: 620, lineHeight: 1.6 }}>
              Detect upgrades via Alchemy, then reconstruct bytecode from historical Write transactions.
              Diffs the selected upgrade against the previous on-chain version.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr)",
              gap: 24,
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
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Program ID *</label>
                <input
                  required
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                  placeholder={JUPITER_PROGRAM}
                  style={inputStyle}
                  spellCheck={false}
                />
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

              <button
                type="button"
                className="btn-secondary"
                disabled={detecting || !programId.trim()}
                onClick={detectUpgrades}
                style={{ justifyContent: "center" }}
              >
                {detecting ? "Scanning chain…" : "Detect upgrades"}
              </button>

              {archiveEarliestSlot !== null && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(107, 207, 143, 0.08)",
                    border: "1px solid rgba(107, 207, 143, 0.22)",
                    color: "var(--text-secondary)",
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  <strong style={{ color: "var(--text-primary)" }}>Alchemy Write reconstruction:</strong>{" "}
                  bytecode is rebuilt from ~1000s of historical <code>getTransaction</code> calls per version.
                  First diff may take 1–3 minutes. Do not pick the <em>oldest</em> upgrade (no prior version).
                </div>
              )}

              {upgrades.length > 0 && (
                <div>
                  <label style={labelStyle}>Upgrade transaction *</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                    {upgrades.map((u) => (
                      <button
                        key={u.signature}
                        type="button"
                        onClick={() => selectUpgrade(u)}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1px solid ${upgradeSignature === u.signature ? "var(--accent)" : "var(--border)"}`,
                          background:
                            upgradeSignature === u.signature
                              ? "rgba(212, 165, 116, 0.08)"
                              : "rgba(255,255,255,0.02)",
                          color: "var(--text-secondary)",
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: "var(--font-mono), monospace",
                          opacity: u.diffable ? 1 : 0.55,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: u.diffable ? "#6bcf8f" : "var(--text-muted)",
                            marginRight: 6,
                          }}
                        >
                          {u.diffable ? "READY" : "NO PRIOR"}
                        </span>
                        slot {u.slot.toLocaleString("en-US")}
                        <br />
                        <span style={{ opacity: 0.7 }}>{u.signature.slice(0, 20)}…</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Or paste upgrade signature</label>
                <input
                  value={upgradeSignature}
                  onChange={(e) => setUpgradeSignature(e.target.value)}
                  placeholder="5LCBTaEN8pMvsnuF4qq9r…"
                  style={inputStyle}
                  spellCheck={false}
                />
                <p style={hintStyle}>
                  <strong>READY</strong> = diffs vs previous upgrade. <strong>NO PRIOR</strong> = earliest version, skip.
                  Reconstruction uses your Alchemy key (~1–3 min).
                </p>
              </div>

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
                style={{ justifyContent: "center", marginTop: 4 }}
              >
                {loading ? "Analyzing…" : "Run diff"}
              </button>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={fillJupiterExample}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.02)",
                    color: "var(--text-secondary)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Fill Jupiter program ID
                </button>
              </div>
            </form>

            <ReportPanel
              report={report}
              loading={loading}
              loadingStage={loadingStage}
              loadingProgress={loadingProgress}
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
