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

export default function DemoSection() {
  const [selectedProgram, setSelectedProgram] = useState<DemoProgram>(DEMO_PROGRAMS[0]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loaded, setLoaded] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("findings");
  const [expandedFinding, setExpandedFinding] = useState<string | null>("f1");

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

        {/* Playground shell */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 300px) minmax(0, 1fr)",
            gap: 0,
            borderRadius: 14,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-surface)",
            overflow: "hidden",
            boxShadow: "0 30px 80px -30px rgba(0,0,0,0.55)",
          }}
        >
          {/* Sidebar */}
          <aside
            style={{
              borderRight: "1px solid var(--border)",
              background: "var(--bg-base)",
              display: "flex",
              flexDirection: "column",
              minHeight: 640,
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
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

            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
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
                      gap: 8,
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: `1px solid ${isActive ? "var(--border-strong)" : "transparent"}`,
                      background: isActive ? "var(--bg-card)" : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      textAlign: "left",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
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
                          fontSize: 13.5,
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
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10.5,
                        color: "var(--text-faint)",
                        letterSpacing: "0.01em",
                      }}
                    >
                      {prog.programId.slice(0, 16)}…{prog.programId.slice(-4)}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 10.5,
                        color: "var(--text-muted)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: rc,
                        }}
                      />
                      <span style={{ letterSpacing: "0.02em", textTransform: "uppercase", fontWeight: 600 }}>
                        {getRiskLabel(prog.riskScore)}
                      </span>
                      <span style={{ color: "var(--text-faint)" }}>·</span>
                      <span>{prog.findings.length} findings</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sidebar footer */}
            <div
              style={{
                marginTop: "auto",
                padding: "14px 20px",
                borderTop: "1px solid var(--border)",
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <div style={{ marginBottom: 6, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10, color: "var(--text-faint)" }}>
                Your program
              </div>
              Paste a program ID and two slots to audit anything on mainnet.
            </div>
          </aside>

          {/* Main panel */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 640 }}>
            {/* Panel header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <RiskMeter score={selectedProgram.riskScore} color={riskColor} />

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 17,
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
                    gap: 14,
                    flexWrap: "wrap",
                    fontSize: 11.5,
                    color: "var(--text-muted)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  <span>{selectedProgram.programId.slice(0, 18)}…{selectedProgram.programId.slice(-6)}</span>
                  <span style={{ color: "var(--text-faint)" }}>·</span>
                  <span>
                    slot {selectedProgram.fromSlot.toLocaleString()} → {selectedProgram.toSlot.toLocaleString()}
                  </span>
                  <span style={{ color: "var(--text-faint)" }}>·</span>
                  <span>
                    {selectedProgram.fromDate} → {selectedProgram.toDate}
                  </span>
                </div>
              </div>

              {/* Severity counts */}
              <div style={{ display: "flex", gap: 6 }}>
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
                        gap: 6,
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: `1px solid ${cfg.border}`,
                        background: "transparent",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: cfg.soft,
                          color: cfg.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 700,
                        }}
                      >
                        {cfg.mark}
                      </span>
                      <span style={{ color: cfg.color, fontWeight: 700 }}>{count}</span>
                      <span style={{ color: "var(--text-muted)" }}>{cfg.label}</span>
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
                padding: "0 24px",
                gap: 0,
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
                      padding: "14px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                      background: "transparent",
                      border: "none",
                      borderBottom: `1.5px solid ${isActive ? "var(--text-primary)" : "transparent"}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      marginBottom: -1,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      letterSpacing: "-0.005em",
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
              <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg-input)" }}>
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
                  padding: 24,
                  flex: 1,
                  animation: "fadeIn 0.3s ease-out",
                }}
              >
                {activeTab === "findings" && (
                  <FindingsPanel
                    findings={selectedProgram.findings}
                    expandedId={expandedFinding}
                    onExpand={setExpandedFinding}
                  />
                )}
                {activeTab === "instruction" && (
                  <DiffViewer lines={selectedProgram.instructionDiff} title="Instruction handler diff" />
                )}
                {activeTab === "accounts" && (
                  <DiffViewer lines={selectedProgram.accountDiff} title="Account struct diff" />
                )}
                {activeTab === "blast" && (
                  <BlastRadius nodes={selectedProgram.blastNodes} edges={selectedProgram.blastEdges} />
                )}
              </div>
            )}

            {/* Panel footer */}
            <div
              style={{
                padding: "12px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--bg-base)",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                {[
                  ["Instructions changed", selectedProgram.summary.instructionsChanged],
                  ["Accounts affected", selectedProgram.summary.accountsAffected],
                  ["New CPI targets", selectedProgram.summary.newCpiTargets],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{label}</span>
                    <span
                      style={{
                        fontSize: 12,
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
                <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
                  Export JSON
                </button>
                <button className="btn-secondary" style={{ fontSize: 12, padding: "6px 14px" }}>
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
    </section>
  );
}

function RiskMeter({ score, color }: { score: number; color: string }) {
  const circumference = 2 * Math.PI * 22;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
      <svg width="56" height="56" style={{ transform: "rotate(-90deg)" }}>
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
            fontSize: 14,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {findings.map((f) => {
        const cfg = SEVERITY_CONFIG[f.severity];
        const isExpanded = expandedId === f.id;
        return (
          <div
            key={f.id}
            style={{
              border: `1px solid ${isExpanded ? "var(--border-hover)" : "var(--border)"}`,
              borderLeft: `2px solid ${cfg.color}`,
              borderRadius: 8,
              overflow: "hidden",
              background: isExpanded ? "var(--bg-card)" : "transparent",
              transition: "all 0.15s",
            }}
          >
            {/* Finding header */}
            <button
              onClick={() => onExpand(isExpanded ? null : f.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
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
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: cfg.soft,
                  border: `1px solid ${cfg.border}`,
                  color: cfg.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "JetBrains Mono, monospace",
                  flexShrink: 0,
                }}
              >
                {cfg.mark}
              </span>
              <code
                style={{
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  fontFamily: "JetBrains Mono, monospace",
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  flexShrink: 0,
                }}
              >
                {f.code}
              </code>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  flex: 1,
                  letterSpacing: "-0.005em",
                }}
              >
                {f.instruction}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 10,
                  flexShrink: 0,
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div style={{ padding: "0 16px 16px", animation: "fadeIn 0.2s ease-out" }}>
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-faint)",
                      marginBottom: 6,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    Description
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, letterSpacing: "-0.005em" }}>
                    {f.description}
                  </p>
                </div>

                {(f.before || f.after) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                    {f.before && (
                      <div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--sev-critical)",
                            marginBottom: 6,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          − Before
                        </div>
                        <pre
                          style={{
                            fontSize: 11,
                            fontFamily: "JetBrains Mono, monospace",
                            color: "#fca5a5",
                            background: "var(--sev-critical-soft)",
                            border: "1px solid var(--sev-critical-border)",
                            padding: "10px 12px",
                            borderRadius: 6,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            lineHeight: 1.6,
                            margin: 0,
                          }}
                        >
                          {f.before}
                        </pre>
                      </div>
                    )}
                    {f.after && (
                      <div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--sev-safe)",
                            marginBottom: 6,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          + After
                        </div>
                        <pre
                          style={{
                            fontSize: 11,
                            fontFamily: "JetBrains Mono, monospace",
                            color: "#86efac",
                            background: "var(--sev-safe-soft)",
                            border: "1px solid var(--sev-safe-border)",
                            padding: "10px 12px",
                            borderRadius: 6,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            lineHeight: 1.6,
                            margin: 0,
                          }}
                        >
                          {f.after}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-faint)",
                      marginBottom: 6,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    Recommendation
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderLeft: "2px solid var(--accent)",
                      padding: "10px 12px",
                      borderRadius: 6,
                      lineHeight: 1.7,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {f.recommendation}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
