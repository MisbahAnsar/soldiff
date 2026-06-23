import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SolDiff — On-Chain Program Upgrade Auditor for Solana",
  description:
    "Decompile, diff, and visualize the blast radius of any Solana program upgrade. Know exactly what changed before trusting upgraded code. Open-source security infrastructure for DAOs, auditors, and developers.",
  keywords: ["Solana", "program audit", "upgrade diff", "smart contract security", "BPF", "Anchor", "DAO governance"],
  openGraph: {
    title: "SolDiff — On-Chain Program Upgrade Auditor",
    description: "Know exactly what changed in any Solana program upgrade.",
    type: "website",
    url: "https://soldiff.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolDiff — On-Chain Program Upgrade Auditor",
    description: "Decompile, diff, and visualize any Solana program upgrade.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
