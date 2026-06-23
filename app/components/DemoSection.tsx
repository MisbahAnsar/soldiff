"use client";

import { useState } from "react";
import { DEMO_PROGRAMS, type DemoProgram, type Severity } from "../data/demos";
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
  instruction: "Instructions",
  accounts: "Accounts",
  blast: "Blast radius",
};

const PLAYGROUND_H = 544;

export default function DemoSection() {
  const [selectedProgram, setSelectedProgram] = useState<DemoProgram>(DEMO_PROGRAMS[0]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loaded, setLoaded] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("findings");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  const loadingStages = [
    "Fetching bytecode from archival RPC",
    "Decompiling ELF to IR",
    "Running structural diff",
    "Annotating risk patterns",
    "Generating blast radius",
    "Report ready",
  ];
  const [loadingStage, setLoadingStage] = useState(0);

  const handleSelectProgram = (prog: DemoProgram) => {
    if (prog.id === selectedProgram.id) return;
    setLoading(true);
    setLoaded(false);
    setLoadingProgress(0);
    setLoadingStage(0);
    setExpandedFinding(null);
    setActiveTab("findings");

    const stageInterval = setInterval(() => {
      setLoadingStage((s) => {
        if (s >= loadingStages.length - 1) {
          clearInterval(stageInterval);
          return s;
        }
        return s + 1;
      });
    }, 260);

    const progressInterval = setInterval(() => {
      setLoadingProgress((p) => {
        if (p >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return p + 5;
      });
    }, 70);

    setTimeout(() => {
      setSelectedProgram(prog);
      setLoading(false);
      setLoaded(true);
      setLoadingProgress(100);
      setExpandedFinding(prog.findings[0]?.id ?? null);
    }, 1600);
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return "var(--sev-critical)";
    if (score >= 50) return "var(--sev-high)";
    if (score >= 25) return "var(--sev-medium)";
    return "var(--sev-safe)";
  };

  const getRiskLabel = (score: number) => {
    if (score >= 80) return "Critical";
    if (score >= 50) return "High";
    if (score >= 25) return "Medium";
    return "Safe";
  };

  const riskColor = getRiskColor(selectedProgram.riskScore);

  return (
    <section id="demo" style={{ padding: "96px 0 112px", position: "relative" }}>
      <div className="container-wide">
        {/* Section header */}
        <div style={{ marginBottom: 40, maxWidth: 720 }}>
          <div style={{ marginBottom: 20 }}>
            <span className="eyebrow">Playground · Live demo</span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-serif), 'Instrument Serif', Georgia, serif",
              fontSize: "clamp(32px, 3.6vw, 48px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              marginBottom: 16,
              color: "var(--text-primary)",
            }}
          >
            Run a real mainnet upgrade diff.
          </h2>
          <p style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.6, maxWidth: 580 }}>
            Pick a program below to load a pre-computed report for a genuine on-chain upgrade.
            Every finding here was produced by the rule engine, not hand-written.
          </p>
        </div>

        {/* Playground frame — outer layer + toolbar + main shell */}
        <div
          style={{
            position: "relative",
            padding: "1px",
            borderRadius: 18,
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 45%, rgba(212,165,116,0.12) 100%)",
            boxShadow:
              "0 40px 100px -40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          {/* Top toolbar layer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "8px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)",
              borderRadius: "17px 17px 0 0",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
                  <span
                    key={c}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: c,
                      opacity: 0.72,
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  height: 18,
                  width: 1,
                  background: "rgba(255,255,255,0.08)",
                }}
              />
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.04em",
                }}
              >
                soldiff playground
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--sev-safe)",
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "4px 10px",
                  borderRadius: 100,
                  border: "1px solid rgba(5,150,105,0.28)",
                  background: "rgba(5,150,105,0.08)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--sev-safe)",
                    boxShadow: "0 0 8px rgba(5,150,105,0.55)",
                  }}
                />
                mainnet · demo mode
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "4px 10px",
                  borderRadius: 100,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                {selectedProgram.findings.length} findings loaded
              </span>
            </div>
          </div>

          {/* Main playground shell */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 300px) minmax(0, 1fr)",
              gap: 0,
              borderRadius: "0 0 17px 17px",
              border: "1px solid rgba(255,255,255,0.06)",
              borderTop: "none",
              background: "var(--bg-surface)",
              overflow: "hidden",
            }}
          >
          {/* Sidebar */}
          <aside
            style={{
              borderRight: "1px solid var(--border)",
              background:
                "linear-gradient(180deg, var(--bg-base) 0%, rgba(7,7,7,0.98) 100%)",
              display: "flex",
              flexDirection: "column",
              minHeight: PLAYGROUND_H,
              height: PLAYGROUND_H,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.015)",
              }}
            >
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Programs
              </span>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  color: "var(--text-faint)",
                  padding: "2px 6px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                }}
              >
                {DEMO_PROGRAMS.length}
              </span>
            </div>

            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0 }}>
              {DEMO_PROGRAMS.map((prog) => {
                const rc = getRiskColor(prog.riskScore);
                const isActive = prog.id === selectedProgram.id;
                return (
                  <button
                    key={prog.id}
                    onClick={() => handleSelectProgram(prog)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      padding: "9px 11px",
                      borderRadius: 8,
                      border: `1px solid ${isActive ? "rgba(212,165,116,0.28)" : "rgba(255,255,255,0.05)"}`,
                      background: isActive
                        ? "linear-gradient(135deg, rgba(212,165,116,0.08) 0%, rgba(255,255,255,0.03) 100%)"
                        : "rgba(255,255,255,0.015)",
                      boxShadow: isActive
                        ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px -16px rgba(0,0,0,0.5)"
                        : "none",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textAlign: "left",
                      position: "relative",
                      transform: isActive ? "translateX(2px)" : "translateX(0)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.10)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.015)";
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.05)";
                      }
                    }}
                  >
                    {isActive && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 12,
                          bottom: 12,
                          width: 2,
                          background: "var(--accent)",
                          borderRadius: 2,
                        }}
                      />
                    )}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 12.5,
                          color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {prog.name}
                      </span>
                      <span
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 11,
                          fontWeight: 600,
                          color: rc,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {prog.riskScore}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 10,
                        color: "var(--text-muted)",
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: rc,
                        }}
                      />
                      <span style={{ letterSpacing: "0.02em", textTransform: "uppercase", fontWeight: 600 }}>
                        {getRiskLabel(prog.riskScore)}
                      </span>
                      <span style={{ color: "var(--text-faint)" }}>·</span>
                      <span
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 9.5,
                          color: "var(--text-faint)",
                        }}
                      >
                        {prog.programId.slice(0, 8)}…{prog.programId.slice(-4)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "auto",
                padding: "8px 12px",
                borderTop: "1px solid var(--border)",
                fontSize: 10,
                color: "var(--text-faint)",
                lineHeight: 1.4,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Paste any program ID + slot range on mainnet.
            </div>
          </aside>

          {/* Main panel */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: PLAYGROUND_H,
              minHeight: PLAYGROUND_H,
              overflow: "hidden",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.012) 0%, transparent 120px)",
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                background: "rgba(255,255,255,0.018)",
                flexShrink: 0,
              }}
            >
              <RiskMeter score={selectedProgram.riskScore} color={riskColor} />

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: "var(--text-primary)",
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {selectedProgram.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "transparent",
                      border: `1px solid ${riskColor}`,
                      color: riskColor,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    {getRiskLabel(selectedProgram.riskScore)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    fontSize: 10.5,
                    color: "var(--text-muted)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  <span>{selectedProgram.programId.slice(0, 14)}…{selectedProgram.programId.slice(-4)}</span>
                  <span style={{ color: "var(--text-faint)" }}>·</span>
                  <span>
                    {selectedProgram.fromSlot.toLocaleString()} → {selectedProgram.toSlot.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Severity counts */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as Severity[]).map((sev) => {
                  const count = selectedProgram.summary[sev.toLowerCase() as keyof typeof selectedProgram.summary] as number;
                  if (!count) return null;
                  const cfg = SEVERITY_CONFIG[sev];
                  return (
                    <div
                      key={sev}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 7px",
                        borderRadius: 5,
                        border: `1px solid ${cfg.border}`,
                        background: "transparent",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: cfg.soft,
                          color: cfg.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 8,
                          fontWeight: 700,
                        }}
                      >
                        {cfg.mark}
                      </span>
                      <span style={{ color: cfg.color, fontWeight: 700 }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                padding: "6px 18px 0",
                gap: 4,
                background: "rgba(0,0,0,0.15)",
                flexShrink: 0,
              }}
            >
              {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
                const isActive = tab === activeTab;
                const count =
                  tab === "findings" ? selectedProgram.findings.length :
                  tab === "instruction" ? selectedProgram.instructionDiff.filter((l) => l.type === "added" || l.type === "removed").length :
                  tab === "accounts" ? selectedProgram.accountDiff.filter((l) => l.type === "added" || l.type === "removed").length :
                  selectedProgram.blastNodes.filter((n) => n.changed).length;

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
                      borderBottom: isActive ? "1px solid var(--bg-surface)" : "1px solid transparent",
                      borderRadius: "8px 8px 0 0",
                      cursor: "pointer",
                      transition: "all 0.18s ease",
                      marginBottom: -1,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      letterSpacing: "-0.005em",
                      boxShadow: isActive ? "0 -4px 16px -8px rgba(0,0,0,0.4)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    }}
                  >
                    {TAB_LABELS[tab]}
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10.5,
                        color: isActive ? "var(--text-muted)" : "var(--text-faint)",
                        background: "rgba(255,255,255,0.03)",
                        padding: "1px 6px",
                        borderRadius: 4,
                        border: "1px solid var(--border)",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Loading overlay */}
            {loading && (
              <div
                style={{
                  padding: "14px 24px",
                  borderBottom: "1px solid var(--border)",
                  background:
                    "linear-gradient(90deg, rgba(212,165,116,0.06) 0%, var(--bg-input) 40%)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-secondary)",
                      fontFamily: "JetBrains Mono, monospace",
                      letterSpacing: "0.01em",
                    }}
                  >
                    → {loadingStages[loadingStage]}…
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--accent)",
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                    }}
                  >
                    {loadingProgress}%
                  </span>
                </div>
                <div style={{ height: 2, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      background: "var(--accent)",
                      width: `${loadingProgress}%`,
                      transition: "width 0.1s linear",
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Tab content */}
            {loaded && !loading && (
              <div
                key={selectedProgram.id + activeTab}
                style={{
                  padding: 10,
                  flex: 1,
                  minHeight: 0,
                  overflow: "hidden",
                  animation: "fadeIn 0.3s ease-out",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    padding: 2,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.05)",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.008) 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: 10, height: "100%", overflow: "hidden" }}>
                {activeTab === "findings" && (
                  <FindingsPanel
                    findings={selectedProgram.findings}
                    expandedId={expandedFinding}
                    onExpand={setExpandedFinding}
                  />
                )}
                {activeTab === "instruction" && (
                  <DiffViewer lines={selectedProgram.instructionDiff} title="Instruction handler diff" compact />
                )}
                {activeTab === "accounts" && (
                  <DiffViewer lines={selectedProgram.accountDiff} title="Account struct diff" compact />
                )}
                {activeTab === "blast" && (
                  <BlastRadius nodes={selectedProgram.blastNodes} edges={selectedProgram.blastEdges} compact />
                )}
                  </div>
                </div>
              </div>
            )}

            {/* Panel footer */}
            <div
              style={{
                padding: "8px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.2) 100%)",
                flexWrap: "wrap",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                {[
                  ["Instructions changed", selectedProgram.summary.instructionsChanged],
                  ["Accounts affected", selectedProgram.summary.accountsAffected],
                  ["New CPI targets", selectedProgram.summary.newCpiTargets],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: (val as number) > 0 ? "var(--accent)" : "var(--sev-safe)",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {val as number}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>
                  Export JSON
                </button>
                <button className="btn-secondary" style={{ fontSize: 11, padding: "5px 12px" }}>
                  Share report
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17l10-10M7 7h10v10" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

function RiskMeter({ score, color }: { score: number; color: string }) {
  const circumference = 2 * Math.PI * 22;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div
      style={{
        position: "relative",
        width: 52,
        height: 52,
        flexShrink: 0,
        padding: 3,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <svg width="46" height="46" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)", display: "block", margin: "0 auto" }}>
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
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.3s" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color,
            lineHeight: 1,
            fontFamily: "JetBrains Mono, monospace",
            letterSpacing: "-0.03em",
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontSize: 8,
            color: "var(--text-faint)",
            fontFamily: "JetBrains Mono, monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 1,
          }}
        >
          Risk
        </span>
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {findings.map((f) => {
        const cfg = SEVERITY_CONFIG[f.severity];
        const isExpanded = expandedId === f.id;
        return (
          <div
            key={f.id}
            style={{
              border: `1px solid ${isExpanded ? "var(--border-hover)" : "rgba(255,255,255,0.06)"}`,
              borderLeft: `2px solid ${cfg.color}`,
              borderRadius: 8,
              overflow: "hidden",
              background: isExpanded
                ? "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)"
                : "rgba(255,255,255,0.015)",
              transition: "all 0.2s ease",
            }}
          >
            <button
              onClick={() => onExpand(isExpanded ? null : f.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: cfg.soft,
                  border: `1px solid ${cfg.border}`,
                  color: cfg.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: "JetBrains Mono, monospace",
                  flexShrink: 0,
                }}
              >
                {cfg.mark}
              </span>
              <code
                style={{
                  fontSize: 10,
                  color: "var(--text-secondary)",
                  fontFamily: "JetBrains Mono, monospace",
                  fontWeight: 600,
                  flexShrink: 0,
                  maxWidth: 130,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.code}
              </code>
              <span
                style={{
                  fontSize: 11.5,
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.instruction}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 9,
                  flexShrink: 0,
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            {isExpanded && (
              <div style={{ padding: "0 10px 10px", animation: "fadeIn 0.2s ease-out" }}>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    marginBottom: 6,
                  }}
                >
                  {f.description}
                </p>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderLeft: "2px solid var(--accent)",
                    padding: "6px 8px",
                    borderRadius: 5,
                    lineHeight: 1.45,
                  }}
                >
                  {f.recommendation}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
