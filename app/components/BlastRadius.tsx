"use client";

import { type AccountNode, type AccountEdge, type Severity } from "../data/demos";

interface Props {
  nodes: AccountNode[];
  edges: AccountEdge[];
}

const NODE_TYPE_CONFIG = {
  signer:   { label: "Signer",        color: "var(--text-primary)", mark: "SIG" },
  pda:      { label: "PDA",           color: "var(--accent)",       mark: "PDA" },
  token:    { label: "Token",         color: "var(--sev-safe)",     mark: "TOK" },
  program:  { label: "Program",       color: "var(--text-secondary)", mark: "PRG" },
  external: { label: "External",      color: "var(--sev-critical)", mark: "EXT" },
};

const RISK_OUTLINE: Record<Severity, string> = {
  CRITICAL: "var(--sev-critical)",
  HIGH:     "var(--sev-high)",
  MEDIUM:   "var(--sev-medium)",
  LOW:      "var(--sev-low)",
  INFO:     "var(--sev-info)",
};

const EDGE_COLORS: Record<AccountEdge["type"], string> = {
  write: "var(--sev-critical)",
  read:  "var(--text-muted)",
  cpi:   "var(--accent)",
  sign:  "var(--sev-safe)",
};

export default function BlastRadius({ nodes, edges }: Props) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.005em" }}>
          Account dependency graph
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          — accounts and programs reachable from the changed instructions
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(NODE_TYPE_CONFIG).map(([key, cfg]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 9.5,
                fontWeight: 700,
                color: cfg.color,
                padding: "2px 6px",
                borderRadius: 3,
                border: `1px solid ${cfg.color}`,
                letterSpacing: "0.04em",
                background: "transparent",
                opacity: 0.85,
              }}
            >
              {cfg.mark}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cfg.label}</span>
          </div>
        ))}
        <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 4px" }} />
        {Object.entries(EDGE_COLORS).map(([key, color]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 1.5, background: color, borderRadius: 1 }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>{key}</span>
          </div>
        ))}
      </div>

      {/* Graph area */}
      <div
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 20,
          minHeight: 260,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background dot grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            pointerEvents: "none",
          }}
        />

        {/* Nodes grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            position: "relative",
            zIndex: 1,
          }}
        >
          {nodes.map((node) => {
            const tc = NODE_TYPE_CONFIG[node.type];
            const riskColor = node.risk ? RISK_OUTLINE[node.risk] : null;
            return (
              <div
                key={node.id}
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${riskColor ?? "var(--border)"}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  minWidth: 140,
                  maxWidth: 220,
                  position: "relative",
                  transition: "all 0.2s",
                }}
              >
                {/* Changed indicator */}
                {node.changed && (
                  <div
                    style={{
                      position: "absolute",
                      top: -5,
                      right: -5,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: riskColor ?? "var(--accent)",
                      border: "2px solid var(--bg-input)",
                    }}
                  />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 9,
                      fontWeight: 700,
                      color: tc.color,
                      padding: "1px 5px",
                      borderRadius: 3,
                      border: `1px solid ${tc.color}`,
                      letterSpacing: "0.04em",
                      opacity: 0.85,
                    }}
                  >
                    {tc.mark}
                  </span>
                  {node.risk && (
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 9,
                        fontWeight: 700,
                        color: riskColor as string,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      {node.risk}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: node.changed ? "var(--text-primary)" : "var(--text-secondary)",
                    lineHeight: 1.4,
                    whiteSpace: "pre-line",
                    letterSpacing: "-0.005em",
                    fontFamily: node.label.includes("...") ? "JetBrains Mono, monospace" : "inherit",
                  }}
                >
                  {node.label}
                </div>
                {node.balance && (
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--sev-high)",
                      marginTop: 6,
                      fontWeight: 600,
                      fontFamily: "JetBrains Mono, monospace",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {node.balance} at risk
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Edges list */}
        {edges.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)", position: "relative", zIndex: 1 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 8,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Data flows
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {edges.map((edge, i) => {
                const edgeColor = EDGE_COLORS[edge.type];
                const fromNode = nodes.find((n) => n.id === edge.from);
                const toNode = nodes.find((n) => n.id === edge.to);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: edge.isNew ? "rgba(220,38,38,0.04)" : "rgba(255,255,255,0.015)",
                      border: `1px solid ${edge.isNew ? "var(--sev-critical-border)" : "var(--border)"}`,
                    }}
                  >
                    {edge.isNew && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: "var(--sev-critical-soft)",
                          color: "var(--sev-critical)",
                          letterSpacing: "0.08em",
                          flexShrink: 0,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        NEW
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                        fontFamily: "JetBrains Mono, monospace",
                        flexShrink: 0,
                      }}
                    >
                      {fromNode?.label.split("\n")[0] ?? edge.from}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 40 }}>
                      <div style={{ flex: 1, height: 1, background: edgeColor, opacity: 0.5 }} />
                      <span
                        style={{
                          fontSize: 9,
                          color: edgeColor,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          flexShrink: 0,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        {edge.type.toUpperCase()}
                      </span>
                      <div style={{ flex: 1, height: 1, background: edgeColor, opacity: 0.5 }} />
                      <span style={{ fontSize: 9, color: edgeColor, flexShrink: 0 }}>▸</span>
                    </div>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                        fontFamily: "JetBrains Mono, monospace",
                        flexShrink: 0,
                      }}
                    >
                      {toNode?.label.split("\n")[0] ?? edge.to}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-muted)",
                        flex: "0 0 auto",
                        textAlign: "right",
                      }}
                    >
                      {edge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hint */}
      <div
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 8,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderLeft: "2px solid var(--accent)",
          fontSize: 12,
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}
      >
        Shareable reports include a full interactive Mermaid diagram with live account balances fetched via RPC.
      </div>
    </div>
  );
}
