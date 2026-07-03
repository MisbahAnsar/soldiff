"use client";

import { useMemo, useState } from "react";

export interface RecentUpgradeProgram {
  programId: string;
  label?: string;
  programSizeBytes: number;
  lastDeployedSlot: number;
  upgradeSignatures: string[];
  previousUpgradeSignature: string;
  latestUpgradeSignature: string;
  previousUpgradeSlot: number;
  latestUpgradeSlot: number;
}

interface Props {
  open: boolean;
  loading: boolean;
  error: string | null;
  programs: RecentUpgradeProgram[];
  generatedAt?: number;
  currentSlot?: number;
  onClose: () => void;
  onUseProgram: (program: RecentUpgradeProgram) => void;
}

export default function RecentUpgradesModal(props: Props) {
  const {
    open,
    loading,
    error,
    programs,
    generatedAt,
    currentSlot,
    onClose,
    onUseProgram,
  } = props;
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((p) => {
      const hay = `${p.label ?? ""} ${p.programId} ${p.latestUpgradeSignature} ${p.previousUpgradeSignature}`.toLowerCase();
      return hay.includes(q);
    });
  }, [programs, query]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          maxHeight: "88vh",
          overflow: "hidden",
          borderRadius: 14,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-surface)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-primary)" }}>
              Find Recent Upgrade
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Upgradeable programs from recent slots, size {"<="} 210000 bytes, with Version A/B available
            </div>
          </div>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div
          style={{
            padding: 16,
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by program, ID, or signature"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "var(--font-mono), monospace",
            }}
          />
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </div>
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "grid", gap: 12 }}>
          {loading && (
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Scanning recent upgrades... this may take ~10-30 seconds.
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
              }}
            >
              {error}
            </div>
          )}
          {!loading &&
            !error &&
            filtered.map((p) => (
              <div
                key={`${p.programId}:${p.latestUpgradeSignature}`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: 12,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 600 }}>
                      {p.label ?? "Unknown Program"}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono), monospace" }}>
                      {p.programId}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onUseProgram(p)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Use this Program
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                    marginTop: 10,
                    fontSize: 12,
                  }}
                >
                  <Meta label="Program Size" value={`${p.programSizeBytes.toLocaleString("en-US")} bytes`} />
                  <Meta label="Last Deployed Slot" value={p.lastDeployedSlot.toLocaleString("en-US")} />
                  <Meta label="Version A Slot" value={p.previousUpgradeSlot.toLocaleString("en-US")} />
                  <Meta label="Version B Slot" value={p.latestUpgradeSlot.toLocaleString("en-US")} />
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <Sig label="Version A" sig={p.previousUpgradeSignature} />
                  <Sig label="Version B" sig={p.latestUpgradeSignature} />
                </div>
              </div>
            ))}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              No matching programs found.
            </div>
          )}
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {generatedAt ? `Generated: ${new Date(generatedAt).toLocaleString("en-US")}` : "No scan yet"}
          {currentSlot ? ` · Current slot: ${currentSlot.toLocaleString("en-US")}` : ""}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--text-muted)" }}>{label}</div>
      <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Sig({ label, sig }: { label: string; sig: string }) {
  return (
    <div style={{ fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)", marginRight: 8 }}>{label}</span>
      <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>
        {sig}
      </span>
    </div>
  );
}
