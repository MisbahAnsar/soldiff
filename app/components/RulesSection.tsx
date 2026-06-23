"use client";

type Sev = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

const SEV_STYLES: Record<Sev, { color: string; soft: string; border: string; mark: string }> = {
  CRITICAL: { color: "var(--sev-critical)", soft: "var(--sev-critical-soft)", border: "var(--sev-critical-border)", mark: "C" },
  HIGH:     { color: "var(--sev-high)",     soft: "var(--sev-high-soft)",     border: "var(--sev-high-border)",     mark: "H" },
  MEDIUM:   { color: "var(--sev-medium)",   soft: "var(--sev-medium-soft)",   border: "var(--sev-medium-border)",   mark: "M" },
  INFO:     { color: "var(--sev-info)",     soft: "var(--sev-info-soft)",     border: "var(--sev-info-border)",     mark: "I" },
};

const RULES: { code: string; severity: Sev; description: string; example: string }[] = [
  {
    code: "REMOVED_SIGNER_CHECK",
    severity: "CRITICAL",
    description: "A required signer constraint was removed from an instruction. Any caller can now invoke it without authorization.",
    example: "liquidate_perp: #[account(signer)] → #[account]",
  },
  {
    code: "NEW_INVOKE_SIGNED_TARGET",
    severity: "CRITICAL",
    description: "A new CPI target was added inside invoke_signed. A program PDA authority is now used to CPI to an unverified program.",
    example: "place_order: new CPI → xYz3...kP9m",
  },
  {
    code: "CHANGED_AUTHORITY_FIELD",
    severity: "CRITICAL",
    description: "An account marked as authority or admin has changed its ownership or address constraint.",
    example: "config.upgrade_authority: old_key → new_key",
  },
  {
    code: "DISCRIMINATOR_CHANGE",
    severity: "HIGH",
    description: "An instruction's 8-byte discriminator was modified — a breaking change that can silently break all existing clients.",
    example: "withdraw: discriminator [0x4a..] → [0x9f..]",
  },
  {
    code: "NEW_MUTABLE_ACCOUNT",
    severity: "HIGH",
    description: "An account that was previously read-only is now marked as writable. Enables unexpected balance mutations.",
    example: "settle_pnl: insurance_fund_vault → #[account(mut)]",
  },
  {
    code: "REMOVED_OWNER_CHECK",
    severity: "HIGH",
    description: "An owner validation (constraint on account.owner) was removed, enabling account substitution attacks.",
    example: "deposit: owner = token_program removed",
  },
  {
    code: "ADDED_CLOSE_ACCOUNT",
    severity: "MEDIUM",
    description: "A new close_account CPI was added. Could be used to drain PDA lamports to an attacker-controlled destination.",
    example: "admin_withdraw: new close_account(escrow)",
  },
  {
    code: "CHANGED_SEEDS",
    severity: "MEDIUM",
    description: "PDA derivation seeds changed. The PDA address changes — existing records become inaccessible, potential account substitution.",
    example: "deposit: seeds [\"v1\", user] → [\"v2\", user]",
  },
  {
    code: "NEW_EXTERNAL_PROGRAM",
    severity: "MEDIUM",
    description: "A new CPI target that is not a well-known Solana program (Token, System, etc.) was added to the program graph.",
    example: "route: new CPI → unknown_aggregator_program",
  },
  {
    code: "LOGIC_CHANGE",
    severity: "INFO",
    description: "General business logic modification detected in the instruction body. No structural security regressions identified.",
    example: "route_exact_in: fee_bps 30 → 25",
  },
];

export default function RulesSection() {
  return (
    <section id="case-studies" style={{ padding: "112px 0", background: "var(--bg-surface)", position: "relative", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div className="container-wide">
        {/* Header */}
        <div style={{ marginBottom: 48, maxWidth: 720 }}>
          <div style={{ marginBottom: 20 }}>
            <span className="eyebrow">Rule engine</span>
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
            Ten rules that catch
            <br />
            <span style={{ color: "var(--accent)", fontStyle: "italic" }}>real exploits.</span>
          </h2>
          <p style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.6, maxWidth: 580 }}>
            Every rule is derived from a real Solana incident. The engine targets a{" "}
            <span style={{ color: "var(--text-primary)" }}>zero false-negative rate</span> on CRITICAL findings —
            if it fires, treat the upgrade as dangerous until proven otherwise.
          </p>
        </div>

        {/* Rules grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 1,
            background: "var(--border)",
            border: "1px solid var(--border-strong)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {RULES.map((rule) => {
            const s = SEV_STYLES[rule.severity];
            return (
              <div
                key={rule.code}
                style={{
                  padding: "20px 22px",
                  background: "var(--bg-base)",
                  borderLeft: `2px solid ${s.color}`,
                  transition: "background 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 200,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-card)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-base)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
                  <code
                    style={{
                      fontSize: 11.5,
                      fontFamily: "JetBrains Mono, monospace",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {rule.code}
                  </code>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      padding: "2px 7px",
                      borderRadius: 4,
                      color: s.color,
                      border: `1px solid ${s.border}`,
                      background: s.soft,
                      flexShrink: 0,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    {rule.severity}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    marginBottom: 14,
                    letterSpacing: "-0.005em",
                    flex: 1,
                  }}
                >
                  {rule.description}
                </p>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--text-muted)",
                    background: "var(--bg-input)",
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    letterSpacing: "0.01em",
                  }}
                >
                  <span style={{ color: "var(--text-faint)" }}>e.g. </span>
                  {rule.example}
                </div>
              </div>
            );
          })}
        </div>

        {/* Contribution callout */}
        <div
          style={{
            marginTop: 28,
            padding: "24px 28px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--bg-base)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
                letterSpacing: "-0.01em",
              }}
            >
              Community rule contributions
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              New rule patterns can be submitted as a PR. Rules are versioned, tested, and reviewed before merge.
            </div>
          </div>
          <a href="https://github.com/MisbahAnsar/soldiff" target="_blank" rel="noopener noreferrer">
            <button className="btn-secondary" style={{ fontSize: 13, padding: "10px 18px", whiteSpace: "nowrap" }}>
              Submit a rule
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </button>
          </a>
        </div>
      </div>
    </section>
  );
}
