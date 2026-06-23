"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { handleSectionNav } from "../lib/scrollToSection";
import SolDiffIcon from "./SolDiffIcon";

const NAV_LINKS = [
  { label: "Home", sectionId: "hero" },
  { label: "Playground", sectionId: "demo" },
  { label: "How it works", sectionId: "how-it-works" },
  { label: "Rules", sectionId: "case-studies" },
  { label: "Integrations", sectionId: "docs" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        transition: "background 0.35s ease, border-color 0.35s ease, backdrop-filter 0.35s ease",
        background: scrolled ? "rgba(7,7,7,0.78)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(255,255,255,0.06)"
          : "1px solid transparent",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          onClick={(e) => handleSectionNav(e, "hero")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "var(--text-primary)",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-0.028em",
            flexShrink: 0,
            transition: "opacity 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.82")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <SolDiffIcon />
          <span>SolDiff.</span>
        </Link>

        {/* Center pill nav */}
        <nav
          className="hide-md"
          aria-label="Main navigation"
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 100,
            padding: "5px 6px",
            gap: 2,
          }}
        >
          {NAV_LINKS.map((item) => (
            <NavLink key={item.label} sectionId={item.sectionId}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* CTA */}
        <CTAButton sectionId="demo">Try Playground</CTAButton>
      </div>
    </header>
  );
}

function NavLink({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href="/"
      onClick={(e) => handleSectionNav(e, sectionId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textDecoration: "none",
        color: hovered ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.50)",
        background: hovered ? "rgba(255,255,255,0.07)" : "transparent",
        fontSize: 13.5,
        fontWeight: 500,
        padding: "7px 18px",
        borderRadius: 100,
        transition: "all 0.18s ease",
        whiteSpace: "nowrap",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </Link>
  );
}

function CTAButton({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href="/"
      onClick={(e) => handleSectionNav(e, sectionId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textDecoration: "none",
        background: hovered ? "#e9e7e5" : "#fafaf9",
        color: "#080808",
        fontSize: 13.5,
        fontWeight: 600,
        padding: "9px 22px",
        borderRadius: 100,
        transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        flexShrink: 0,
        whiteSpace: "nowrap",
        letterSpacing: "-0.015em",
        transform: hovered ? "translateY(-1.5px) scale(1.03)" : "translateY(0) scale(1)",
        boxShadow: hovered
          ? "0 8px 22px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.08)"
          : "none",
        display: "inline-block",
      }}
    >
      {children}
    </Link>
  );
}
