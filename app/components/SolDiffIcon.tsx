"use client";

import { useId } from "react";

export default function SolDiffIcon({ size = 28 }: { size?: number }) {
  const gradientId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12" fill={`url(#${gradientId})`} opacity="0.22" />
      <path
        d="M14 4C8.5 4 4 8.5 4 14c0 3.2 1.5 6 3.8 7.9C10.5 16.5 14 14 14 14s3.5 2.5 6.2 7.9C22.5 20 24 17.2 24 14c0-5.5-4.5-10-10-10z"
        fill="#FF5F00"
        opacity="0.92"
      />
      <path
        d="M14 24c5.5 0 10-4.5 10-10 0-3.2-1.5-6-3.8-7.9C17.5 11.5 14 14 14 14s-3.5-2.5-6.2-7.9C5.5 8 4 10.8 4 14c0 5.5 4.5 10 10 10z"
        fill="#FF5F00"
        opacity="0.52"
      />
      <text
        x="14"
        y="17"
        textAnchor="middle"
        fill="#000"
        fontSize="9"
        fontWeight="700"
        fontFamily="var(--font-mono), monospace"
      >
        ∆
      </text>
      <defs>
        <radialGradient id={gradientId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FF5F00" />
          <stop offset="100%" stopColor="#FF5F00" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
