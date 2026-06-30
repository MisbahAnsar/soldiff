"use client";

import { useState } from "react";
import { type AccountNode, type AccountEdge, type Severity } from "../data/demos";
import { CopyButton } from "./report/ReportChrome";
import { severityLabel } from "@/app/lib/report-presenter";

interface Props {
  nodes: AccountNode[];
  edges: AccountEdge[];
  compact?: boolean;
  audit?: boolean;
}

const NODE_TYPE_CONFIG = {
  program:  { label: "Program",  color: "#a78bfa", mark: "PRG" },
  pda:      { label: "PDA",      color: "#60a5fa", mark: "PDA" },
  token:    { label: "Token",    color: "#4ade80", mark: "TOK" },
  external: { label: "External", color: "#fb923c", mark: "EXT" },
  signer:   { label: "Signer",   color: "#a8a29e", mark: "SIG" },
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

export default function BlastRadius({ nodes, edges, compact = false, audit = false }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div>
      {!audit && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: compact ? 8 : 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: compact ? 11.5 : 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Account dependency graph
          </span>
        </div>
      )}

      <div className="blast-legend">
        {Object.entries(NODE_TYPE_CONFIG).map(([key, cfg]) => (
          <div key={key} className="blast-legend-item">
            <span className="blast-legend-swatch" style={{ borderColor: cfg.color, color: cfg.color }}>
              {cfg.mark}
            </span>
            <span>{cfg.label}</span>
          </div>
        ))}
      </div>

      <div className={`blast-canvas ${audit ? "blast-canvas-audit" : ""}`}>
        <div className="blast-grid-bg" />

        <div className="blast-nodes">
          {nodes.map((node) => {
            const tc = NODE_TYPE_CONFIG[node.type];
            const riskColor = node.risk ? RISK_OUTLINE[node.risk] : null;
            const isHovered = hovered === node.id;

            return (
              <div
                key={node.id}
                className={`blast-node ${node.changed ? "is-changed" : ""} ${isHovered ? "is-hovered" : ""}`}
                style={{ borderColor: riskColor ?? tc.color }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => navigator.clipboard.writeText(node.id)}
                title="Click to copy address"
              >
                {node.changed && <span className="blast-node-dot" style={{ background: riskColor ?? tc.color }} />}

                <div className="blast-node-head">
                  <span className="blast-node-type" style={{ color: tc.color, borderColor: tc.color }}>
                    {tc.mark}
                  </span>
                  {node.risk && (
                    <span className="blast-node-risk" style={{ color: riskColor ?? undefined }}>
                      {severityLabel(node.risk)}
                    </span>
                  )}
                </div>

                <div className="blast-node-label">{node.label}</div>

                {audit && isHovered && (
                  <div className="blast-node-tooltip">
                    <div><strong>Address</strong> <code>{node.id}</code></div>
                    <div><strong>Role</strong> {tc.label}</div>
                    <div><strong>Risk</strong> {node.risk ? severityLabel(node.risk) : "None"}</div>
                    <CopyButton value={node.id} label="address" />
                  </div>
                )}

                {node.balance && (
                  <div className="blast-node-balance">{node.balance} at risk</div>
                )}
              </div>
            );
          })}
        </div>

        {edges.length > 0 && (
          <div className="blast-edges">
            <div className="blast-edges-title">Data flows</div>
            {edges.slice(0, audit ? edges.length : compact ? 3 : edges.length).map((edge, i) => {
              const edgeColor = EDGE_COLORS[edge.type];
              const fromNode = nodes.find((n) => n.id === edge.from);
              const toNode = nodes.find((n) => n.id === edge.to);
              return (
                <div
                  key={i}
                  className={`blast-edge ${edge.isNew ? "is-new" : ""}`}
                >
                  {edge.isNew && <span className="blast-edge-new">NEW</span>}
                  <span className="blast-edge-label">
                    {(fromNode?.label.split("\n")[0] ?? edge.from) +
                      " → " +
                      (toNode?.label.split("\n")[0] ?? edge.to)}
                  </span>
                  <span className="blast-edge-type" style={{ color: edgeColor }}>
                    {edge.type.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
