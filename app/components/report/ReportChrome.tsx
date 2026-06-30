"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="report-chip-btn"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      title={`Copy ${label}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ExplorerButton({
  value,
  kind = "account",
}: {
  value: string;
  kind?: "account" | "tx";
}) {
  const href =
    kind === "tx"
      ? `https://solscan.io/tx/${value}`
      : `https://solscan.io/account/${value}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="report-chip-btn"
      title="Open in Solscan"
    >
      Explorer
    </a>
  );
}

export function AddressField({
  label,
  value,
  kind = "account",
}: {
  label: string;
  value: string;
  kind?: "account" | "tx";
}) {
  const short =
    value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;

  return (
    <div className="report-address-field">
      <div className="report-address-label">{label}</div>
      <div className="report-address-row">
        <code className="report-mono" title={value}>
          {short}
        </code>
        <div className="report-address-actions">
          <CopyButton value={value} label={label} />
          <ExplorerButton value={value} kind={kind} />
        </div>
      </div>
    </div>
  );
}

export function ReportCard({
  title,
  children,
  id,
}: {
  title?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="report-card" id={id}>
      {title && <h3 className="report-card-title">{title}</h3>}
      {children}
    </section>
  );
}

export function StatGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="report-stat-grid">
      {items.map((item) => (
        <div key={item.label} className="report-stat">
          <div className="report-stat-label">{item.label}</div>
          <div className="report-stat-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cls = `report-sev report-sev-${severity.toLowerCase()}`;
  return <span className={cls}>{severity}</span>;
}
