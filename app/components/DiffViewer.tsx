"use client";

import { type DiffLine } from "../data/demos";

interface Props {
  lines: DiffLine[];
  title: string;
}

export default function DiffViewer({ lines, title }: Props) {
  const getLineStyle = (type: DiffLine["type"]) => {
    switch (type) {
      case "added":
        return {
          rowBg: "rgba(5,150,105,0.05)",
          borderLeft: "2px solid var(--sev-safe)",
          gutterBg: "rgba(5,150,105,0.05)",
          gutterColor: "var(--sev-safe)",
          sign: "+",
          textColor: "#86efac",
        };
      case "removed":
        return {
          rowBg: "rgba(220,38,38,0.05)",
          borderLeft: "2px solid var(--sev-critical)",
          gutterBg: "rgba(220,38,38,0.05)",
          gutterColor: "var(--sev-critical)",
          sign: "-",
          textColor: "#fca5a5",
        };
      case "context":
      default:
        return {
          rowBg: "transparent",
          borderLeft: "2px solid transparent",
          gutterBg: "transparent",
          gutterColor: "var(--text-faint)",
          sign: " ",
          textColor: "var(--text-code)",
        };
    }
  };

  const added = lines.filter((l) => l.type === "added").length;
  const removed = lines.filter((l) => l.type === "removed").length;
  const unchanged = lines.filter((l) => l.type === "context" || l.type === "unchanged").length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.005em",
          }}
        >
          {title}
        </span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 12,
            fontSize: 11.5,
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          <span style={{ color: "var(--sev-safe)", fontWeight: 600 }}>+{added}</span>
          <span style={{ color: "var(--sev-critical)", fontWeight: 600 }}>−{removed}</span>
          <span style={{ color: "var(--text-faint)" }}>{unchanged} unchanged</span>
        </div>
      </div>

      {/* Diff table */}
      <div className="code-block scroll-code" style={{ maxHeight: 420 }}>
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "7px 0", background: "rgba(255,255,255,0.015)" }}>
          <div
            style={{
              width: 44,
              textAlign: "center",
              fontSize: 9.5,
              color: "var(--text-faint)",
              fontFamily: "JetBrains Mono, monospace",
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Old
          </div>
          <div
            style={{
              width: 44,
              textAlign: "center",
              fontSize: 9.5,
              color: "var(--text-faint)",
              fontFamily: "JetBrains Mono, monospace",
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            New
          </div>
          <div style={{ width: 24, textAlign: "center", flexShrink: 0, borderRight: "1px solid var(--border)" }} />
          <div
            style={{
              paddingLeft: 14,
              fontSize: 9.5,
              color: "var(--text-faint)",
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Content
          </div>
        </div>

        {lines.map((line, i) => {
          const s = getLineStyle(line.type);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "stretch",
                background: s.rowBg,
                borderLeft: s.borderLeft,
                minHeight: 26,
              }}
            >
              <div
                style={{
                  width: 44,
                  textAlign: "center",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  color: "var(--text-faint)",
                  padding: "4px 0",
                  background: s.gutterBg,
                  borderRight: "1px solid var(--border)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                }}
              >
                {line.type === "added" ? "" : line.lineA ?? ""}
              </div>
              <div
                style={{
                  width: 44,
                  textAlign: "center",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  color: "var(--text-faint)",
                  padding: "4px 0",
                  background: s.gutterBg,
                  borderRight: "1px solid var(--border)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                }}
              >
                {line.type === "removed" ? "" : line.lineB ?? ""}
              </div>

              <div
                style={{
                  width: 24,
                  textAlign: "center",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: s.gutterColor,
                  padding: "4px 0",
                  background: s.gutterBg,
                  borderRight: "1px solid var(--border)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                }}
              >
                {s.sign}
              </div>

              <div
                style={{
                  flex: 1,
                  padding: "4px 14px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  color: s.textColor,
                  whiteSpace: "pre",
                  overflowX: "auto",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {line.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
