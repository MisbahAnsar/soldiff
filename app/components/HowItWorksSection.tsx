"use client";

const STEPS = [
  {
    number: "01",
    title: "Parse upgrade transactions",
    description:
      "SolDiff reads two BPF Upgradeable Loader Upgrade transactions, extracts buffer / Program / ProgramData addresses, and validates Version A is older than Version B.",
    detail: "parseUpgradeTransaction(sigA|sigB)",
  },
  {
    number: "02",
    title: "Reconstruct historical ELFs",
    description:
      "Buffer Write instructions are collected, ordered deterministically, isolated to a deployment cycle, coverage-checked, and assembled into validated ELF64 artifacts with full SHA-256 identity.",
    detail: "Write replay → coverage map → validateElf()",
  },
  {
    number: "03",
    title: "Raw byte + SBF instruction diff",
    description:
      "`.text` and `.rodata` are compared at the byte-chunk layer. An SBF instruction-level decoder adds offset-aligned instruction evidence. This is not a semantic decompiler.",
    detail: "raw-byte diff + soldiff-ebpf-isa / optional sbpf|llvm-objdump",
  },
  {
    number: "04",
    title: "Optional Anchor IDL diff",
    description:
      "When an IDL can be historically matched, instruction/account/discriminator changes are reported with evidence. Otherwise historical IDL is marked unavailable — never silently unchanged.",
    detail: "normalizeIdl → compareNormalizedIdls",
  },
  {
    number: "05",
    title: "Evidence-backed findings",
    description:
      "Heuristic findings attach analyzer, confidence, and evidence. Overstated claims (e.g. treating sampled pubkeys as CPI targets) are avoided.",
    detail: "Finding{ analyzer, code, severity, confidence, evidence }",
  },
  {
    number: "06",
    title: "Reproducible case study",
    description:
      "CLI/scripts emit manifest.json + report.md with hashes and provenance. Reports are ephemeral in the UI today — persistence/shareable URLs are not shipped yet.",
    detail: "bun run case-study --program … --from … --to …",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" style={{ padding: "112px 0", position: "relative" }}>
      <div className="container-wide">
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
            From upgrade signatures to
            <br />
            evidence-backed bytecode diffs.
          </h2>
          <p
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              color: "var(--text-secondary)",
              fontSize: 16,
              lineHeight: 1.6,
              maxWidth: 560,
            }}
          >
            Built around trustworthy historical reconstruction first. Advanced semantic claims stay
            out of scope until they can be proven.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {STEPS.map((step) => (
            <div
              key={step.number}
              style={{
                padding: 24,
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--bg-surface)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 12,
                  color: "var(--accent)",
                  marginBottom: 12,
                }}
              >
                {step.number}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-serif), Georgia, serif",
                  fontSize: 22,
                  fontWeight: 400,
                  marginBottom: 10,
                  color: "var(--text-primary)",
                }}
              >
                {step.title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-inter), Inter, sans-serif",
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--text-secondary)",
                  marginBottom: 14,
                }}
              >
                {step.description}
              </p>
              <code
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  wordBreak: "break-word",
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
