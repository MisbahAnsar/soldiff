#!/usr/bin/env bun
/**
 * Reproducible case-study runner (no large CLI framework).
 *
 * Usage:
 *   bun run case-study --program <PROGRAM_ID> --from <SIG_A> --to <SIG_B> [--out case-study/]
 *   bun run case-study --help
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { runAnalysisPipeline } from "../lib/soldiff/pipeline";
import {
  buildCaseStudyManifest,
  renderMarkdownReport,
} from "../lib/soldiff/report-markdown";

function usage(): never {
  console.log(`SolDiff case-study

Usage:
  bun run case-study --program <PROGRAM_ID> --from <SIG_A> --to <SIG_B> [--out <dir>] [--label <name>]

Writes:
  <out>/manifest.json
  <out>/report.md
  <out>/report.json   (analysis without ELF byte buffers)
`);
  process.exit(1);
}

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) usage();

  const programId = arg("--program");
  const from = arg("--from");
  const to = arg("--to");
  const outDir = arg("--out") ?? "case-study";
  const label = arg("--label");

  if (!programId || !from || !to) usage();

  console.info(`[case-study] program=${programId}`);
  console.info(`[case-study] from=${from}`);
  console.info(`[case-study] to=${to}`);

  const report = await runAnalysisPipeline({
    programId,
    prevUpgradeSignature: from,
    upgradeSignature: to,
    label: label ?? undefined,
  });

  await mkdir(outDir, { recursive: true });

  const manifest = buildCaseStudyManifest(report);
  const markdown = renderMarkdownReport(report);

  // Strip large binary fields for JSON
  const jsonSafe = {
    ...report,
    versionA: {
      ...report.versionA,
      elf: undefined,
      textSection: undefined,
      rodataSection: undefined,
      elfByteLength: report.versionA.elf.length,
    },
    versionB: {
      ...report.versionB,
      elf: undefined,
      textSection: undefined,
      rodataSection: undefined,
      elfByteLength: report.versionB.elf.length,
    },
  };

  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(join(outDir, "report.md"), markdown);
  await writeFile(join(outDir, "report.json"), JSON.stringify(jsonSafe, null, 2));

  // Persist artifact hashes + optional ELF dumps for reproducibility
  await writeFile(
    join(outDir, "artifact-a.sha256"),
    `${report.versionA.provenance.sha256}\n`
  );
  await writeFile(
    join(outDir, "artifact-b.sha256"),
    `${report.versionB.provenance.sha256}\n`
  );
  await writeFile(join(outDir, "version-a.so"), report.versionA.elf);
  await writeFile(join(outDir, "version-b.so"), report.versionB.elf);

  console.info(`[case-study] wrote ${outDir}/manifest.json`);
  console.info(`[case-study] wrote ${outDir}/report.md`);
  console.info(`[case-study] A sha256=${report.versionA.provenance.sha256}`);
  console.info(`[case-study] B sha256=${report.versionB.provenance.sha256}`);
  console.info(
    `[case-study] findings=${report.findings.length} risk=${report.riskScore}`
  );
}

main().catch((err) => {
  console.error("[case-study] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
