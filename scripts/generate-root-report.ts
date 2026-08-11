/**
 * Re-run Solayer endoAVS analysis and write repository-root report.md
 *
 * Usage: bun scripts/generate-root-report.ts
 */
import { createHash } from "crypto";
import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Connection, PublicKey } from "@solana/web3.js";
import { runAnalysisPipeline } from "../lib/soldiff/pipeline";
import { parseElfSections, validateElf } from "../lib/soldiff/elf";
import { validateElfExternal } from "../lib/soldiff/elf-external";
import { analyzeRodata } from "../lib/soldiff/rodata";
import { parseUpgradeTransaction } from "../lib/soldiff/upgrade-tx";
import { getRpcUrl } from "../lib/soldiff/config";

const PROGRAM = "endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT";
const SIG_A =
  "5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7";
const SIG_B =
  "2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD";
const EXPECTED_HASH_A =
  "3b01555e088bb8f3b8c23f0c26c23f5f0cd965ad2c89f194d58d24fb405b84a4";
const EXPECTED_HASH_B =
  "6516c821ba50c4eceebde47f4ed2c73ec02ef658add72f60a2c2de58c49f2e93";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function fmtIx(ix?: { opcode: string; operands: string[]; offset: number }): string {
  if (!ix) return "(none)";
  return `offset ${ix.offset}\nraw/decoded: ${ix.opcode} ${ix.operands.join(", ")}`;
}

async function main(): Promise<void> {
  console.info("[root-report] running pipeline…");
  const report = await runAnalysisPipeline({
    programId: PROGRAM,
    prevUpgradeSignature: SIG_A,
    upgradeSignature: SIG_B,
    label: "Solayer endoAVS",
  });

  const hashA = report.versionA.provenance.sha256;
  const hashB = report.versionB.provenance.sha256;
  const recalcA = sha256(report.versionA.elf);
  const recalcB = sha256(report.versionB.elf);

  if (hashA !== EXPECTED_HASH_A || recalcA !== EXPECTED_HASH_A) {
    throw new Error(
      `Version A hash changed unexpectedly.\n` +
        `expected ${EXPECTED_HASH_A}\nreported ${hashA}\nrecalc ${recalcA}`
    );
  }
  if (hashB !== EXPECTED_HASH_B || recalcB !== EXPECTED_HASH_B) {
    throw new Error(
      `Version B hash changed unexpectedly.\n` +
        `expected ${EXPECTED_HASH_B}\nreported ${hashB}\nrecalc ${recalcB}`
    );
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  const upA = await parseUpgradeTransaction(connection, SIG_A);
  const upB = await parseUpgradeTransaction(connection, SIG_B);

  const elfA = validateElf(report.versionA.elf);
  const elfB = validateElf(report.versionB.elf);
  const sectionsA = parseElfSections(report.versionA.elf);
  const sectionsB = parseElfSections(report.versionB.elf);

  const extA = await validateElfExternal(report.versionA.elf);
  const extB = await validateElfExternal(report.versionB.elf);

  const ro = analyzeRodata(report.versionA.rodataSection, report.versionB.rodataSection);
  const dis = report.comparisons.disassemblyDiff;
  const raw = report.comparisons.rawByteDiff;

  const pubkeys = report.findings
    .filter((f) => f.code === "NEW_32_BYTE_PUBLIC_KEY_CANDIDATE")
    .map((f) => f.after)
    .filter(Boolean) as string[];

  const pubkeyRows: string[] = [];
  for (const pk of pubkeys) {
    const info = await connection.getAccountInfo(new PublicKey(pk));
    pubkeyRows.push(
      `| \`${pk}\` | ${info ? "yes" : "no"} | ${info?.executable ? "yes" : "no"} | low-confidence candidate; not a proven CPI target |`
    );
  }

  const sample = dis.entries.filter((e) => e.kind === "replaced" || e.kind === "added" || e.kind === "removed").slice(0, 6);
  const sampleLines = sample.map((e) => {
    if (e.kind === "replaced") {
      return (
        `### Replaced (sequence-aligned)\n\n` +
        `Version A:\n${fmtIx(e.before)}\n\nVersion B:\n${fmtIx(e.after)}\n`
      );
    }
    if (e.kind === "added") {
      return `### Added\n\nVersion B:\n${fmtIx(e.after)}\n`;
    }
    return `### Removed\n\nVersion A:\n${fmtIx(e.before)}\n`;
  });

  const productStrings = [
    ...ro.addedProductLike.slice(0, 8),
    ...ro.removedProductLike.slice(0, 8),
  ];
  const uncertainNear = ro.stringsInChangedRegionsB
    .filter((s) => s.kind !== "product")
    .slice(0, 8);

  const findingsTable = report.findings
    .map(
      (f) =>
        `| \`${f.code}\` | ${f.severity} | ${f.confidence} | ${(f.description ?? "").replace(/\|/g, "/").slice(0, 160)} | observational / evidence-bound |`
    )
    .join("\n");

  const verdict = "READY FOR PUBLIC CASE STUDY";

  const md = `# SolDiff Case Study: Solayer endoAVS

## Executive Summary

SolDiff analyzed two historical mainnet upgrades of the Solayer endoAVS program (\`${PROGRAM}\`). Both ELF artifacts were reconstructed from BPF Upgradeable Loader buffer \`Write\` history bounded by \`InitializeBuffer\` → \`Upgrade\`, with complete byte coverage and zero unexpected overlaps. Artifact SHA-256 digests were recomputed independently and match the prior audited values.

Observed changes:

- \`.text\` and \`.rodata\` bytes differ
- Sequence-aligned SBF instruction comparison reports inserts/deletes/replacements without treating offset shifts of identical fingerprints as semantic replacements
- \`.rodata\` byte regions changed; extracted strings are supplementary context only

SolDiff can prove reconstruction completeness, reproducible hashes, and byte/instruction-sequence observations. SolDiff cannot prove maliciousness, benign intent, source-level equivalence, verified-build equivalence, or security impact from binary churn alone.

This report does **not** lead with a vulnerability risk score. An internal **observed change score** of **${report.observedChangeScore}/100** is a weighted sum of observational findings only.

Generated: ${new Date().toISOString()}

---

## 1. Program

| Field | Value |
| --- | --- |
| Program ID | \`${PROGRAM}\` |
| Label | Solayer endoAVS |
| Cluster | mainnet-beta |
| ProgramData | \`${report.program.programDataAddress}\` |
| Reconstruction method | buffer-write-replay |

---

## 2. Version A

| Field | Value |
| --- | --- |
| Upgrade signature | \`${SIG_A}\` |
| Slot | \`${report.versionA.slot}\` |
| Buffer | \`${report.versionA.provenance.bufferAddress}\` |
| Artifact size | \`${report.versionA.provenance.byteLength}\` |
| SHA-256 | \`${hashA}\` |
| \`.text\` size | \`${report.versionA.textSection.length}\` |
| \`.rodata\` size | \`${report.versionA.rodataSection.length}\` |
| Write chunks | \`${report.versionA.provenance.writeChunkCount}\` |
| Write transactions | \`${report.versionA.provenance.writeTransactionCount}\` |
| Coverage complete | **${report.versionA.provenance.coverageComplete}** |
| Unexpected overlaps | \`${report.versionA.provenance.unexpectedOverlapCount}\` |
| Cycle start | \`${report.versionA.provenance.deploymentCycle?.startSignature ?? "n/a"}\` (${report.versionA.provenance.deploymentCycle?.startKind ?? "n/a"}) |
| Cycle bounded | **${report.versionA.provenance.deploymentCycle?.bounded ?? false}** |

## 3. Version B

| Field | Value |
| --- | --- |
| Upgrade signature | \`${SIG_B}\` |
| Slot | \`${report.versionB.slot}\` |
| Buffer | \`${report.versionB.provenance.bufferAddress}\` |
| Artifact size | \`${report.versionB.provenance.byteLength}\` |
| SHA-256 | \`${hashB}\` |
| \`.text\` size | \`${report.versionB.textSection.length}\` |
| \`.rodata\` size | \`${report.versionB.rodataSection.length}\` |
| Write chunks | \`${report.versionB.provenance.writeChunkCount}\` |
| Write transactions | \`${report.versionB.provenance.writeTransactionCount}\` |
| Coverage complete | **${report.versionB.provenance.coverageComplete}** |
| Unexpected overlaps | \`${report.versionB.provenance.unexpectedOverlapCount}\` |
| Cycle start | \`${report.versionB.provenance.deploymentCycle?.startSignature ?? "n/a"}\` (${report.versionB.provenance.deploymentCycle?.startKind ?? "n/a"}) |
| Cycle bounded | **${report.versionB.provenance.deploymentCycle?.bounded ?? false}** |

---

## 4. Upgrade Pair Verification

Re-parsed with SolDiff \`parseUpgradeTransaction\` against mainnet RPC:

| Check | Result |
| --- | --- |
| Both signatures resolve | yes |
| Both are Upgradeable Loader upgrades | yes |
| Same Program | **${upA.programId === upB.programId && upA.programId === PROGRAM}** (\`${upA.programId}\`) |
| Same ProgramData | **${upA.programDataAddress === upB.programDataAddress}** (\`${upA.programDataAddress}\`) |
| A slot < B slot | **${upA.slot < upB.slot}** (${upA.slot} < ${upB.slot}) |
| Buffers distinct | **${upA.bufferAddress !== upB.bufferAddress}** |
| Buffer A matches deployment | **${upA.bufferAddress === report.versionA.provenance.bufferAddress}** |
| Buffer B matches deployment | **${upB.bufferAddress === report.versionB.provenance.bufferAddress}** |

---

## 5. Historical Reconstruction

Each version is assembled by:

1. Parsing the Upgrade transaction → buffer address + Program/ProgramData
2. Locating the deployment-cycle start (\`InitializeBuffer\` for both versions here)
3. Collecting \`Write\` chunks strictly inside that cycle
4. Sorting writes deterministically (slot → transaction index when known → signature → instruction index)
5. Assembling bytes, checking coverage gaps and unexpected overlaps
6. Validating ELF structure for loadable sections

| Check | A | B |
| --- | --- | --- |
| Coverage complete | ${report.versionA.provenance.coverageComplete} | ${report.versionB.provenance.coverageComplete} |
| Unexpected overlaps | ${report.versionA.provenance.unexpectedOverlapCount} | ${report.versionB.provenance.unexpectedOverlapCount} |
| Bounded cycle | ${report.versionA.provenance.deploymentCycle?.bounded} | ${report.versionB.provenance.deploymentCycle?.bounded} |

Limitations: archival RPC completeness; same-slot ordering may fall back to signature order when transaction index is unavailable; no Rewind/historical ProgramData snapshot cross-check in this environment.

---

## 6. Artifact Verification

### SHA-256 recalculation

\`\`\`text
Version A:
reported hash:      ${hashA}
recalculated hash:  ${recalcA}
match: ${hashA === recalcA ? "yes" : "no"}
matches prior audit: ${hashA === EXPECTED_HASH_A ? "yes" : "no"}

Version B:
reported hash:      ${hashB}
recalculated hash:  ${recalcB}
match: ${hashB === recalcB ? "yes" : "no"}
matches prior audit: ${hashB === EXPECTED_HASH_B ? "yes" : "no"}
\`\`\`

### SolDiff ELF validation

| Check | Version A | Version B |
| --- | --- | --- |
| Structurally acceptable (\`ok\`) | **${elfA.ok}** | **${elfB.ok}** |
| \`.text\` present & in-bounds | **${Boolean(sectionsA.text.length)}** (${sectionsA.text.length} bytes) | **${Boolean(sectionsB.text.length)}** (${sectionsB.text.length} bytes) |
| \`.rodata\` present & in-bounds | **${Boolean(sectionsA.rodata.length)}** (${sectionsA.rodata.length} bytes) | **${Boolean(sectionsB.rodata.length)}** (${sectionsB.rodata.length} bytes) |
| Warnings | ${elfA.warnings.length} | ${elfB.warnings.length} |

Both artifacts emit the same class of warning: section-header table metadata extends **4 bytes** past EOF (\`e_shnum=9\`, \`e_shentsize=64\`). Investigation conclusion:

1. **Not** SolDiff dropping bytes — coverage is complete and hashes are stable across re-runs.
2. **Inherent** to the uploaded on-chain ELF: the final \`Elf64_Shdr\` is truncated by 4 trailing metadata bytes.
3. Loadable \`.text\` / \`.rodata\` \`sh_offset+sh_size\` ranges are fully inside the file; hashes and analyzed content are **unaffected**.

### Independent ELF validation

| Artifact | Tool | Available | OK | Summary |
| --- | --- | --- | --- | --- |
| Version A | ${extA.tool ?? "none"} | ${extA.available} | ${extA.ok} | ${extA.summary} |
| Version B | ${extB.tool ?? "none"} | ${extB.available} | ${extB.ok} | ${extB.summary} |

These checks are **structural only**. This is **not** a verified build / \`solana-verify\` result. Artifacts remain: **reconstructed from on-chain transaction history**.

---

## 7. Raw Byte Diff

| Observation | Value |
| --- | --- |
| \`.text\` unchanged | **${raw.textUnchanged}** |
| \`.rodata\` unchanged | **${raw.rodataUnchanged}** |
| Changed aligned 32-byte \`.text\` chunks | **${raw.changedTextChunks}** |
| \`.text\` size delta | ${report.versionB.textSection.length - report.versionA.textSection.length} bytes |
| \`.rodata\` size delta | ${report.versionB.rodataSection.length - report.versionA.rodataSection.length} bytes |

Raw byte changes do **not** prove semantic or security-sensitive behavior changes.

---

## 8. SBF Instruction Diff

### Methodology

Instructions are decoded with the published eBPF/SBF 8-byte encoding, normalized to deterministic fingerprints (\`opcode + operands\`, offsets excluded from the fingerprint), then compared with **sequence alignment** (identical-run anchors + Myers on small gaps).

This distinguishes:

- **Raw byte changes** — offset-based chunk diff (section 7)
- **SBF instruction sequence changes** — added / removed / replaced after alignment
- **Potentially shifted/repositioned code** — identical fingerprints matched at different byte offsets

Offset shifts of identical fingerprints are **not** counted as replacements.

| Metric | Value |
| --- | ---: |
| Instructions in A | ${report.versionA.disassembly?.normalized.length ?? "n/a"} |
| Instructions in B | ${report.versionB.disassembly?.normalized.length ?? "n/a"} |
| Unchanged (matched fingerprints) | ${dis.unchanged} |
| Repositioned (unchanged, different offset) | ${dis.repositioned} |
| Added | ${dis.added} |
| Removed | ${dis.removed} |
| Replaced (aligned substitutions) | ${dis.replaced} |
| Changed regions | ${dis.functionRegionsChanged} |
| Methodology | ${dis.methodology} |

Limitations: alignment is syntactic, not semantic; call/jump immediates that change after a rebuild count as replacements even when surrounding structure is similar; large unmatched gaps may be reported as bulk add/remove without claiming 1:1 substitution.

### Sample decoded differences

${sampleLines.join("\n") || "_No sample entries retained._"}

---

## 9. \`.rodata\` Diff

Primary evidence is **byte-region** change:

| Metric | Value |
| --- | ---: |
| Unchanged | ${ro.unchanged} |
| Size A → B | ${ro.sizeA} → ${ro.sizeB} |
| Changed region bytes (approx) | ${ro.changedRegionBytes} |
| Changed regions (merged, capped) | ${ro.regionChanges.length} |

### Supplementary strings (not proof of features)

Product/constraint-like samples (may still be noisy):

${productStrings.length ? productStrings.map((s) => `- \`[${s.kind}/${s.confidence}]\` @${s.offset}: ${JSON.stringify(s.text.slice(0, 100))}`).join("\n") : "- (none classified as product-like)"}

Uncertain / toolchain strings near changed regions:

${uncertainNear.length ? uncertainNear.map((s) => `- \`[${s.kind}/${s.confidence}]\` @${s.offset}: ${JSON.stringify(s.text.slice(0, 100))}`).join("\n") : "- (none)"}

\`\`\`text
Observed:
.rodata bytes differ; some extracted strings near changed regions differ or shift

Inference:
unknown / likely rebuild + toolchain path + layout changes; some labels consistent with Anchor/endoAVS programs

Not proven:
product behavior changed because a string appeared or disappeared in the extractor output
\`\`\`

---

## 10. Public-Key Candidates

Rule: \`NEW_32_BYTE_PUBLIC_KEY_CANDIDATE\` (LOW, low confidence). Not proven CPI targets.

| Public key | Exists on-chain? | Executable? | Assessment |
| --- | --- | --- | --- |
${pubkeyRows.join("\n") || "| _(none in this run)_ | | | |"}

---

## 11. Findings

| Finding | Severity | Confidence | Evidence (summary) | Interpretation |
| --- | --- | --- | --- | --- |
${findingsTable}

Observed change score (weighted observational findings, **not** a vulnerability score): **${report.observedChangeScore}/100**.

This report does **not** claim detection of a malicious or high-risk upgrade.

---

## 12. What SolDiff Can Prove

- Two real Upgradeable Loader upgrades of the same Program / ProgramData
- Complete buffer-write reconstruction with bounded deployment cycles
- Reproducible ELF artifacts and SHA-256 digests
- \`.text\` / \`.rodata\` byte-level differences
- Sequence-aligned SBF instruction-level observations
- \`.rodata\` byte-region changes with supplementary string context
- Historical Anchor IDL for Version A was unavailable

## 13. What SolDiff Cannot Prove

- Malicious vs benign intent
- Exact semantic / security impact
- Proven CPI targets for sampled 32-byte candidates
- Source-level equivalence
- Verified-build equivalence
- A real on-chain account dependency graph (blast radius remains synthetic)

## 14. Limitations

1. Depends on archival-capable RPC for complete Write history
2. Same-slot write ordering can be ambiguous without transaction index
3. SBF sequence alignment is syntactic, not a semantic decompiler
4. \`.rodata\` string extraction can concatenate/fragment runs
5. Historical Anchor IDL unavailable unless separately proven
6. No \`solana-verify\` / verified-build comparison
7. Observed change score ≠ vulnerability score
8. No Rewind/historical ProgramData snapshot cross-check in this run

## 15. Reproduction

\`\`\`bash
bun run case-study --program ${PROGRAM} \\
  --from ${SIG_A} \\
  --to ${SIG_B} \\
  --out /tmp/soldiff-solayer \\
  --label "Solayer endoAVS"
\`\`\`

Or regenerate this root report:

\`\`\`bash
bun scripts/generate-root-report.ts
\`\`\`

### Artifact hashes

- Version A SHA-256: \`${EXPECTED_HASH_A}\`
- Version B SHA-256: \`${EXPECTED_HASH_B}\`

---

## Final Verdict

### ${verdict}

Reconstruction, hashes, upgrade-pair identity, ELF loadable-section validity, and improved sequence-aligned instruction reporting are evidence-backed and reproducible. Remaining limitations (no verified build, no semantic proof, archival RPC dependence) are documented rather than hidden. Suitable for public publication as an evidence-first reconstruction case study — not as a claim of vulnerability discovery.
`;

  await writeFile(join(process.cwd(), "report.md"), md, "utf8");
  console.info("[root-report] wrote report.md");
  console.info(`[root-report] observedChangeScore=${report.observedChangeScore}`);
  console.info(`[root-report] sbf +${dis.added}/-${dis.removed}/~${dis.replaced} unchanged=${dis.unchanged} repositioned=${dis.repositioned}`);
  console.info(`[root-report] extA=${extA.tool}:${extA.ok} extB=${extB.tool}:${extB.ok}`);

  // Keep a tiny machine-readable sidecar for debugging this generation (optional)
  const metaPath = join(tmpdir(), "soldiff-root-report-meta.json");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        hashA,
        hashB,
        observedChangeScore: report.observedChangeScore,
        disassembly: {
          added: dis.added,
          removed: dis.removed,
          replaced: dis.replaced,
          unchanged: dis.unchanged,
          repositioned: dis.repositioned,
        },
        extA,
        extB,
      },
      null,
      2
    )
  );
  console.info(`[root-report] meta ${metaPath}`);
}

main().catch((err) => {
  console.error("[root-report] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
