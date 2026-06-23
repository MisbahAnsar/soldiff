"use client";

import { type AccountNode, type AccountEdge, type Severity } from "../data/demos";

interface Props {
  nodes: AccountNode[];
  edges: AccountEdge[];
  compact?: boolean;
}

const NODE_TYPE_CONFIG = {
  signer:   { label: "Signer",   color: "var(--text-primary)", mark: "SIG" },
  pda:      { label: "PDA",      color: "var(--accent)",       mark: "PDA" },
  token:    { label: "Token",    color: "var(--sev-safe)",     mark: "TOK" },
  program:  { label: "Program",  color: "var(--text-secondary)", mark: "PRG" },
  external: { label: "External", color: "var(--sev-critical)", mark: "EXT" },
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

export default function BlastRadius({ nodes, edges, compact = false }: Props) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: compact ? 8 : 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: compact ? 11.5 : 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Account dependency graph
        </span>
        {!compact && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            — reachable from changed instructions
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: compact ? 8 : 16, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(NODE_TYPE_CONFIG).map(([key, cfg]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 8.5,
                fontWeight: 700,
                color: cfg.color,
                padding: "1px 4px",
                borderRadius: 3,
                border: `1px solid ${cfg.color}`,
                opacity: 0.85,
              }}
            >
              {cfg.mark}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border)",
          borderRadius: compact ? 8 : 10,
          padding: compact ? 10 : 14,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: compact ? 6 : 10,
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
                  borderRadius: 6,
                  padding: compact ? "6px 9px" : "10px 14px",
                  minWidth: compact ? 110 : 140,
                  maxWidth: compact ? 170 : 220,
                  position: "relative",
                }}
              >
                {node.changed && (
                  <div
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: riskColor ?? "var(--accent)",
                      border: "2px solid var(--bg-input)",
                    }}
                  />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 8,
                      fontWeight: 700,
                      color: tc.color,
                      padding: "1px 4px",
                      borderRadius: 3,
                      border: `1px solid ${tc.color}`,
                      opacity: 0.85,
                    }}
                  >
                    {tc.mark}
                  </span>
                  {node.risk && (
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 8,
                        fontWeight: 700,
                        color: riskColor as string,
                        textTransform: "uppercase",
                      }}
                    >
                      {node.risk}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: compact ? 10.5 : 12,
                    fontWeight: 500,
                    color: node.changed ? "var(--text-primary)" : "var(--text-secondary)",
                    lineHeight: 1.35,
                    whiteSpace: "pre-line",
                    fontFamily: node.label.includes("...") ? "JetBrains Mono, monospace" : "inherit",
                  }}
                >
                  {node.label}
                </div>
                {node.balance && (
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "var(--sev-high)",
                      marginTop: 4,
                      fontWeight: 600,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    {node.balance} at risk
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {edges.length > 0 && (
          <div style={{ marginTop: compact ? 10 : 18, paddingTop: compact ? 8 : 14, borderTop: "1px solid var(--border)", position: "relative", zIndex: 1 }}>
            <div
              style={{
                fontSize: 9,
                color: "var(--text-faint)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Data flows
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {edges.slice(0, compact ? 3 : edges.length).map((edge, i) => {
                const edgeColor = EDGE_COLORS[edge.type];
                const fromNode = nodes.find((n) => n.id === edge.from);
                const toNode = nodes.find((n) => n.id === edge.to);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: compact ? "4px 8px" : "6px 10px",
                      borderRadius: 5,
                      background: edge.isNew ? "rgba(220,38,38,0.04)" : "rgba(255,255,255,0.015)",
                      border: `1px solid ${edge.isNew ? "var(--sev-critical-border)" : "var(--border)"}`,
                    }}
                  >
                    {edge.isNew && (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          padding: "1px 4px",
                          borderRadius: 3,
                          background: "var(--sev-critical-soft)",
                          color: "var(--sev-critical)",
                          flexShrink: 0,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        NEW
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: compact ? 10 : 11.5,
                        color: "var(--text-secondary)",
                        fontFamily: "JetBrains Mono, monospace",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {(fromNode?.label.split("\n")[0] ?? edge.from) + " → " + (toNode?.label.split("\n")[0] ?? edge.to)}
                    </span>
                    <span
                      style={{
                        fontSize: 8.5,
                        color: edgeColor,
                        fontWeight: 700,
                        flexShrink: 0,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {edge.type.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
