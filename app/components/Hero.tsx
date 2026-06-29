"use client";

import Link from "next/link";
import { useState } from "react";
import { handleSectionNav } from "../lib/scrollToSection";

/* ─── HeroButton ─────────────────────────────────────────────────────────── */
function HeroButton({
  href,
  sectionId,
  variant,
  children,
}: {
  href?: string;
  sectionId?: string;
  variant: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  const isPrimary = variant === "primary";

  const style = {
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: isPrimary
          ? hov ? "#e9e7e5" : "#fafaf9"
          : hov ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
        color: isPrimary ? "#080808" : "var(--text-primary)",
        border: isPrimary
          ? "none"
          : `1px solid ${hov ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.10)"}`,
        borderRadius: 100,
        padding: "12px 28px",
        minWidth: 160,
        justifyContent: "center",
        fontWeight: isPrimary ? 600 : 500,
        fontSize: 14.5,
        letterSpacing: "-0.015em",
        cursor: "pointer",
        transition: "all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: hov ? "translateY(-2px) scale(1.025)" : "translateY(0) scale(1)",
        boxShadow:
          hov && isPrimary
            ? "0 12px 32px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.08)"
            : "none",
  };

  if (href) {
    return (
      <Link
        href={href}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{ ...style, textDecoration: "none" }}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href="/"
      onClick={(e) => sectionId && handleSectionNav(e, sectionId)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ ...style, textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */
export default function Hero() {
  return (
    <section
      id="hero"
      style={{
        position: "relative",
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
        background: "#070707",
      }}
    >
      {/* Grid backdrop */}
      <div
        className="bg-grid"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />

      {/* ── Content ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 140,
          width: "100%",
        }}
      >
        {/* Badge pill */}
        <div
          style={{
            marginBottom: 36,
            animation: "fadeInUp 0.6s ease-out both",
          }}
        >
          <span
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.44)",
              fontSize: 12.5,
              fontWeight: 500,
              padding: "5px 16px",
              borderRadius: 100,
              border: "1px solid rgba(255,255,255,0.09)",
              lineHeight: 1,
            }}
          >
            Security infrastructure
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', Georgia, serif",
            fontSize: "clamp(38px, 5vw, 68px)",
            fontWeight: 400,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            textAlign: "center",
            color: "var(--text-primary)",
            marginBottom: 22,
            maxWidth: 780,
            padding: "0 28px",
            animation: "fadeInUp 0.6s ease-out 0.08s both",
          }}
        >
          Meet! SolDiff.
          <br />
          Built for a secure{" "}
          <span style={{ color: "#d4a574", fontStyle: "italic" }}>Solana</span>{" "}
          future.
        </h1>

        {/* Subtext */}
        <p
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: 15.5,
            color: "rgba(255,255,255,0.46)",
            lineHeight: 1.5,
            textAlign: "center",
            whiteSpace: "nowrap",
            marginBottom: 40,
            letterSpacing: "-0.005em",
            animation: "fadeInUp 0.6s ease-out 0.16s both",
          }}
        >
          Decompile BPF bytecode and surface risk-graded diffs in seconds.
        </p>

        {/* CTA Buttons */}
        <div
          style={{
            display: "flex",
            gap: 12,
            animation: "fadeInUp 0.6s ease-out 0.24s both",
          }}
        >
          <HeroButton href="/analyze" variant="primary">
            Get started
          </HeroButton>
          <HeroButton sectionId="how-it-works" variant="secondary">
            Learn more
          </HeroButton>
        </div>
      </div>
    </section>
  );
}
