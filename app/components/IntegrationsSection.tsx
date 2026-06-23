"use client";

const INTEGRATIONS = [
  {
    title: "CLI",
    subtitle: "npx soldiff",
    description: "Run in any terminal. Diff by slot, upgrade transaction, or program ID. Outputs JSON for CI pipelines.",
    code: `$ npx soldiff JUP4...GuJB \\
    --from-slot 280000000 \\
    --to-slot 284500000 \\
    --output report.html`,
  },
  {
    title: "Squads v4 SDK",
    subtitle: "@soldiff/sdk",
    description: "Generate a diff report before submitting an upgrade transaction. Attach the shareable URL to the multisig proposal.",
    code: `import { generateDiffReport } from "@soldiff/sdk";

const report = await generateDiffReport({
  programId: new PublicKey("JUP4...GuJB"),
  fromSlot: 280_000_000,
  toSlot: 284_500_000,
});
console.log(report.shareableUrl);`,
  },
  {
    title: "GitHub Actions",
    subtitle: "soldiff-action",
    description: "Monitor programs automatically. Get Slack or webhook alerts the moment any watched program is upgraded.",
    code: `- uses: MisbahAnsar/soldiff-action@v1
  with:
    program-ids: |
      JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB
    rpc-url: \${{ secrets.HELIUS_RPC_URL }}
    alert-on-severity: HIGH
    notify-slack: \${{ secrets.SLACK_WEBHOOK }}`,
  },
];

export default function IntegrationsSection() {
  return (
    <section id="docs" style={{ padding: "112px 0", position: "relative" }}>
      <div className="container-wide">
        {/* Header */}
        <div style={{ marginBottom: 56, maxWidth: 720 }}>
          <div style={{ marginBottom: 20 }}>
            <span className="eyebrow">Integrations</span>
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
            Fits into your existing workflow.
          </h2>
          <p style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.6, maxWidth: 540 }}>
            Web UI, CLI, TypeScript SDK, or GitHub Actions. One engine, every entry point.
          </p>
        </div>

        {/* Integration cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 16,
            marginBottom: 48,
          }}
        >
          {INTEGRATIONS.map((int) => (
            <div
              key={int.title}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: 12,
                overflow: "hidden",
                transition: "all 0.2s",
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              }}
            >
              {/* Card header */}
              <div style={{ padding: "22px 22px 14px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {int.title}
                  </span>
                  <code
                    style={{
                      fontSize: 11.5,
                      color: "var(--accent)",
                      fontFamily: "JetBrains Mono, monospace",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {int.subtitle}
                  </code>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {int.description}
                </p>
              </div>

              {/* Code block */}
              <div className="code-block" style={{ margin: "0 16px 16px", borderRadius: 8, background: "var(--bg-input)" }}>
                <div className="code-block-header" style={{ padding: "8px 12px" }}>
                  <div className="code-dot" style={{ background: "#ff5f56" }} />
                  <div className="code-dot" style={{ background: "#ffbd2e" }} />
                  <div className="code-dot" style={{ background: "#27c93f" }} />
                </div>
                <pre
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11.5,
                    color: "var(--text-code)",
                    padding: "14px 16px",
                    margin: 0,
                    overflowX: "auto",
                    lineHeight: 1.7,
                  }}
                >
                  {int.code}
                </pre>
              </div>
            </div>
          ))}
        </div>

        {/* DAO Governance callout */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 14,
            padding: "36px 40px",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 32,
            alignItems: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle accent line */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background: "var(--accent)",
            }}
          />

          <div>
            <div style={{ marginBottom: 12 }}>
              <span className="eyebrow">Governance ready</span>
            </div>
            <h3
              style={{
                fontFamily: "var(--font-serif), 'Instrument Serif', Georgia, serif",
                fontSize: 22,
                fontWeight: 400,
                color: "var(--text-primary)",
                marginBottom: 12,
                letterSpacing: "-0.015em",
              }}
            >
              Immutable, content-addressed reports.
            </h3>
            <p style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 620, letterSpacing: "-0.005em" }}>
              SolDiff reports are hashed by SHA-256 and permanently hosted. Multisig members and DAO voters can
              attach a SolDiff URL to any upgrade proposal on{" "}
              <span style={{ color: "var(--text-primary)" }}>Realms</span> or{" "}
              <span style={{ color: "var(--text-primary)" }}>Squads</span> — if the URL still loads, it is the
              same report that was reviewed.
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap" }}>
              {["Realms / SPL Governance", "Squads v4", "Serum Multisig", "Mean Finance DAO"].map((name) => (
                <span
                  key={name}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 5,
                    border: "1px solid var(--border)",
                    background: "var(--bg-base)",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontFamily: "JetBrains Mono, monospace",
                    letterSpacing: "0.01em",
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 48,
                lineHeight: 1,
                color: "var(--accent)",
                fontWeight: 500,
                letterSpacing: "-0.04em",
              }}
            >
              SHA-256
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Content-addressed
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
