"use client";

const STEPS = [
  {
    number: "01",
    title: "Fetch historical bytecode",
    description:
      "SolDiff queries an archival Helius RPC node for the raw ELF binary at any historical slot — going back years. Unlike standard RPCs, archival nodes retain full account history.",
    detail: "getAccountInfoAndContext(programDataPDA, { minContextSlot })",
  },
  {
    number: "02",
    title: "Decompile to IR",
    description:
      "Both ELF binaries are disassembled and lifted to a structured Intermediate Representation — recovering instruction handlers, discriminators, account constraints, PDA seeds, and CPI targets.",
    detail: "ELF → .text / .rodata → BPF IR (JSON AST)",
  },
  {
    number: "03",
    title: "Structural diff",
    description:
      "A Myers algorithm adapted for tree structures computes the difference between the two IR ASTs, producing a semantic diff — not a textual one — capturing meaningful structural changes.",
    detail: "Myers(IR_A, IR_B) → ChangeSet",
  },
  {
    number: "04",
    title: "Risk annotation",
    description:
      "A rule engine scans the ChangeSet for 10 known-dangerous patterns: removed signer checks, new invoke_signed targets, changed authorities, new mutable accounts, changed PDA seeds, and more.",
    detail: "10 rules → Finding[] graded CRITICAL / HIGH / MEDIUM / LOW / INFO",
  },
  {
    number: "05",
    title: "Blast radius",
    description:
      "From the IR, SolDiff constructs an account dependency graph, traverses from changed nodes, and maps every downstream PDA, token account, and CPI that could be affected.",
    detail: "Graph traversal → affected accounts + live RPC balance fetch",
  },
  {
    number: "06",
    title: "Shareable report",
    description:
      "The final report is content-addressed (SHA-256), permanently hosted, and structured for DAO governance — attach it to Squads or Realms proposals as verifiable proof of review.",
    detail: "HTML + JSON → soldiff.app/r/<sha256>",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" style={{ padding: "112px 0", position: "relative" }}>
      <div className="container-wide">
        {/* Header */}
        <div style={{ marginBottom: 56, maxWidth: 720 }}>
          <div style={{ marginBottom: 20 }}>
            <span className="eyebrow">How it works</span>
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
            From bytecode to actionable
            <br />
            insight in under three seconds.
          </h2>
          <p style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.6, maxWidth: 560 }}>
            No source code required. SolDiff works directly from deployed on-chain bytecode, end to end.
          </p>
        </div>

        {/* Steps */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 1,
            background: "var(--border)",
            border: "1px solid var(--border-strong)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {STEPS.map((step) => (
            <div
              key={step.number}
              style={{
                background: "var(--bg-surface)",
                padding: "28px 26px",
                transition: "background 0.2s",
                position: "relative",
                minHeight: 220,
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-card)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--accent)",
                    letterSpacing: "0.1em",
                  }}
                >
                  STEP {step.number}
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>

              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 10,
                  letterSpacing: "-0.015em",
                }}
              >
                {step.title}
              </h3>

              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  marginBottom: 16,
                  letterSpacing: "-0.005em",
                  flex: 1,
                }}
              >
                {step.description}
              </p>

              <code
                style={{
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  color: "var(--text-muted)",
                  background: "var(--bg-input)",
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: "0.01em",
                }}
              >
                {step.detail}
              </code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
