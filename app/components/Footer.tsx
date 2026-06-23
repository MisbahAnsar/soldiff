"use client";

import Link from "next/link";
import { handleSectionNav, scrollToSection } from "../lib/scrollToSection";
import SolDiffIcon from "./SolDiffIcon";

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-base)",
        padding: "80px 0 40px",
      }}
    >
      <div className="container-wide">
        {/* CTA block */}
        <div
          style={{
            padding: "56px 28px",
            marginBottom: 64,
            borderRadius: 16,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            position: "relative",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {/* Subtle top accent */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "20%",
              right: "20%",
              height: 1,
              background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
              opacity: 0.5,
            }}
          />

          <div style={{ marginBottom: 20, position: "relative" }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>
              Open source · MIT license
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-serif), 'Instrument Serif', Georgia, serif",
              fontSize: "clamp(28px, 3.2vw, 44px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              marginBottom: 16,
              color: "var(--text-primary)",
              position: "relative",
              maxWidth: 760,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            If SolDiff prevents one exploit,
            <br />
            it pays for itself{" "}
            <span style={{ color: "var(--accent)", fontStyle: "italic" }}>
              a thousand times over.
            </span>
          </h2>
          <p
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              color: "var(--text-secondary)",
              fontSize: 15,
              marginBottom: 32,
              position: "relative",
              letterSpacing: "-0.005em",
            }}
          >
            Star the repo. Run the playground. Contribute a rule.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
              position: "relative",
            }}
          >
            <button type="button" className="btn-primary" onClick={() => scrollToSection("demo")}>
              Open playground
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </button>
            <a href="https://github.com/MisbahAnsar/soldiff" target="_blank" rel="noopener noreferrer">
              <button className="btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                </svg>
                Star on GitHub
              </button>
            </a>
          </div>
        </div>

        {/* Footer columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 40,
            marginBottom: 48,
            paddingBottom: 32,
            borderBottom: "1px solid var(--border)",
          }}
        >
          {/* Logo + tagline */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <SolDiffIcon />
              <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>
                SolDiff
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                lineHeight: 1.6,
                maxWidth: 320,
                letterSpacing: "-0.005em",
              }}
            >
              On-chain program upgrade auditor for Solana. Open-source security infrastructure for DAOs,
              multisigs, and auditors.
            </p>
          </div>

          {/* Link columns */}
          {[
            {
              label: "Product",
              links: [
                { label: "Playground", sectionId: "demo" },
                { label: "How it works", sectionId: "how-it-works" },
                { label: "Rules", sectionId: "case-studies" },
                { label: "Integrations", sectionId: "docs" },
              ],
            },
            {
              label: "Resources",
              links: [
                { label: "GitHub", href: "https://github.com/MisbahAnsar/soldiff" },
              ],
            },
            {
              label: "Ecosystem",
              links: [
                { label: "Superteam", href: "https://earn.superteam.fun" },
                { label: "Squads", href: "https://squads.so" },
                { label: "Realms", href: "https://app.realms.today" },
              ],
            },
          ].map((col) => (
            <div key={col.label}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-faint)",
                  marginBottom: 14,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {col.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((l) =>
                  "sectionId" in l ? (
                    <Link
                      key={l.label}
                      href="/"
                      onClick={(e) => handleSectionNav(e, l.sectionId)}
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        textDecoration: "none",
                        transition: "color 0.15s",
                        letterSpacing: "-0.005em",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
                    >
                      {l.label}
                    </Link>
                  ) : (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        textDecoration: "none",
                        transition: "color 0.15s",
                        letterSpacing: "-0.005em",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
                    >
                      {l.label}
                    </a>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "-0.005em" }}>
            Built by{" "}
            <a
              href="https://x.com/Misbahtwts"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--text-secondary)", textDecoration: "none" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
            >
              @Misbahtwts
            </a>
            {" · MIT © 2026"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.02em" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sev-safe)" }} />
              All systems operational
            </span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <span>v0.3.1</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
