# SolDiff Case Study: Solayer endoAVS

## Executive Summary

SolDiff reconstructed two historical versions of the Solayer endoAVS program directly from on-chain upgrade transaction history and produced reproducible ELF artifacts with independently matching SHA-256 hashes.

Both versions were assembled from BPF Upgradeable Loader buffer `Write` transactions inside bounded `InitializeBuffer` → `Upgrade` deployment cycles, with complete byte coverage and zero unexpected overlaps. The same Program and ProgramData were upgraded through two distinct buffers. ELF structural checks (SolDiff and independent pyelftools) confirm loadable `.text` and `.rodata` contents are in-bounds.

**Evidence levels used in this report:**

| Level | What it is | Status here |
| --- | --- | --- |
| **1 — Raw bytes** | Direct observation that `.text` / `.rodata` bytes differ | Established |
| **2 — SBF structure** | Sequence alignment of normalized instruction fingerprints | Observational (syntactic) |
| **3 — Semantics** | Source-level or application-level behavior equivalence | **Not established** |

SolDiff does not currently establish source-level or application-level semantic equivalence between these versions. This case study is evidence of a working historical on-chain binary reconstruction and diff pipeline — not a vulnerability finding.

Generated: 2026-08-11T02:53:46.657Z

---

## Why this case study matters

Traditional source-code diffing is unavailable when only historical deployed binaries are available. This case study demonstrates that SolDiff can reconstruct historical Solana program artifacts from upgrade transaction history and compare them reproducibly at the binary and instruction-stream levels.

It does **not** claim semantic security analysis, malicious-upgrade detection, or verified-build equivalence.

---

## 1. Program

| Field | Value |
| --- | --- |
| Program ID | `endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT` |
| Label | Solayer endoAVS |
| Cluster | mainnet-beta |
| ProgramData | `2GDubXcpGKwpRekN6iWCPXTvfZ7sHoD3WG7MZSWutFzM` |
| Reconstruction method | buffer-write-replay |

---

## 2. Version A

| Field | Value |
| --- | --- |
| Upgrade signature | `5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7` |
| Slot | `285208450` |
| Buffer | `buf5a19HRXELq7vKcee4qWt4GLq7aQP14WVe19qT2o3` |
| Artifact size | `375716` |
| SHA-256 | `3b01555e088bb8f3b8c23f0c26c23f5f0cd965ad2c89f194d58d24fb405b84a4` |
| `.text` size | `331184` |
| `.rodata` size | `12479` |
| Write chunks | `372` |
| Write transactions | `372` |
| Coverage complete | **true** |
| Unexpected overlaps | `0` |
| Cycle start | `5EEC7vkbJfNNvn1MRUWPG4oXrVbzftrgwMbPYifXqAysjCtACJMHGxJG98f4mQFnXni4nKRYC1t8fmEW91u1znQF` (`initialize_buffer`) |
| Cycle bounded | **true** |

## 3. Version B

| Field | Value |
| --- | --- |
| Upgrade signature | `2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD` |
| Slot | `302204161` |
| Buffer | `piNr72uHL1jfaSz4EwB3w9VZhL8g6CR9hzMUyd2wRcN` |
| Artifact size | `398228` |
| SHA-256 | `6516c821ba50c4eceebde47f4ed2c73ec02ef658add72f60a2c2de58c49f2e93` |
| `.text` size | `352720` |
| `.rodata` size | `12623` |
| Write chunks | `394` |
| Write transactions | `394` |
| Coverage complete | **true** |
| Unexpected overlaps | `0` |
| Cycle start | `3cK9gYRZerVEcgmWzF6MBUPMkJGG2vnrPEbJfedy5NEGW8NRyVSgATQ1mKVgXGu6chupqfVkRJ9WEkjRa4pXo1dh` (`initialize_buffer`) |
| Cycle bounded | **true** |

---

## 4. Upgrade Pair Verification

Re-parsed with SolDiff `parseUpgradeTransaction` against mainnet RPC:

| Check | Result |
| --- | --- |
| Both signatures resolve | yes |
| Both are Upgradeable Loader upgrades | yes |
| Same Program | **true** (`endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT`) |
| Same ProgramData | **true** (`2GDubXcpGKwpRekN6iWCPXTvfZ7sHoD3WG7MZSWutFzM`) |
| A slot < B slot | **true** (285208450 < 302204161) |
| Buffers distinct | **true** |
| Buffer A matches deployment | **true** |
| Buffer B matches deployment | **true** |

---

## 5. Historical Reconstruction

Each version is assembled by:

1. Parsing the Upgrade transaction → buffer address + Program / ProgramData
2. Locating the deployment-cycle start (`InitializeBuffer` for both versions here)
3. Collecting `Write` chunks strictly inside that cycle
4. Sorting writes deterministically (slot → transaction index when known → signature → instruction index)
5. Assembling bytes, checking coverage gaps and unexpected overlaps
6. Validating ELF structure for loadable sections

| Check | A | B |
| --- | --- | --- |
| Coverage complete | true | true |
| Unexpected overlaps | 0 | 0 |
| Bounded cycle | true | true |

Limitations: archival RPC completeness; same-slot ordering may fall back to signature order when transaction index is unavailable; no Rewind / historical ProgramData snapshot cross-check in this environment.

---

## 6. Artifact Verification

Artifacts are **reconstructed from on-chain transaction history**. They are **not** independently verified builds.

### SHA-256 recalculation

```text
Version A:
reported hash:      3b01555e088bb8f3b8c23f0c26c23f5f0cd965ad2c89f194d58d24fb405b84a4
recalculated hash:  3b01555e088bb8f3b8c23f0c26c23f5f0cd965ad2c89f194d58d24fb405b84a4
match: yes

Version B:
reported hash:      6516c821ba50c4eceebde47f4ed2c73ec02ef658add72f60a2c2de58c49f2e93
recalculated hash:  6516c821ba50c4eceebde47f4ed2c73ec02ef658add72f60a2c2de58c49f2e93
match: yes
```

### SolDiff ELF validation

| Check | Version A | Version B |
| --- | --- | --- |
| Structurally acceptable (`ok`) | **true** | **true** |
| `.text` present & in-bounds | **true** (331184 bytes) | **true** (352720 bytes) |
| `.rodata` present & in-bounds | **true** (12479 bytes) | **true** (12623 bytes) |
| Warnings | 1 | 1 |

Both artifacts emit the same warning: section-header table metadata extends **4 bytes** past EOF (`e_shnum=9`, `e_shentsize=64`).

Conclusion:

1. **Not** SolDiff dropping bytes — coverage is complete and hashes are stable across re-runs.
2. **Inherent** to the uploaded on-chain ELF: the final `Elf64_Shdr` is truncated by 4 trailing metadata bytes.
3. Loadable `.text` / `.rodata` ranges are fully inside the file; hashes and analyzed content are **unaffected**.

### Independent ELF validation (pyelftools)

llvm-readelf was unavailable. pyelftools confirms ELF64 with in-bounds `.text` and `.rodata`. Because of the trailing 4-byte section-header truncation, pyelftools requires a temporary zero-pad **only for header parsing**; bounds are checked against the original file length. Hashed artifact bytes are never modified.

| Artifact | Tool | OK | Notes |
| --- | --- | --- | --- |
| Version A | pyelftools | true | ELF64; `.text` / `.rodata` present; sh_table EOF truncation confirmed |
| Version B | pyelftools | true | ELF64; `.text` / `.rodata` present; sh_table EOF truncation confirmed |

This is structural validation only — **not** a `solana-verify` / verified-build result.

---

## 7. Raw Byte Diff

**Level 1 evidence** — directly observed:

| Observation | Value |
| --- | --- |
| `.text` unchanged | **false** |
| `.rodata` unchanged | **false** |
| Changed aligned 32-byte `.text` chunks | **11,016** |
| `.text` size delta | +21,536 bytes (331184 → 352720) |
| `.rodata` size delta | +144 bytes (12479 → 12623) |

Raw byte differences prove that the reconstructed binaries are not identical. They do **not** prove semantic or security-sensitive behavior changes.

---

## 8. SBF Instruction-Level Comparison

**Level 2 evidence** — structural / syntactic comparison.

### Methodology

SolDiff decodes the reconstructed binaries into normalized SBF instruction fingerprints (`opcode + operands`; byte offsets excluded from the fingerprint) and performs sequence alignment (identical-run anchors + Myers on small gaps).

Offset shifts of identical fingerprints are counted as matches that moved, not as replacements.

### Alignment observations

| Metric | Value | How to read it |
| --- | ---: | --- |
| Instructions in A | 39,965 | Decoded from Version A `.text` |
| Instructions in B | 42,591 | Decoded from Version B `.text` |
| Matched fingerprints | 1,300 | Same fingerprint aligned in both streams |
| … of which repositioned | 1,274 | Match at a different byte offset |
| Aligned substitutions | 63 | Adjacent delete+insert pairs after alignment |
| Changed regions | 76 | Contiguous runs of non-matching ops |
| Classified as added | 41,228 | Unmatched in B after alignment |
| Classified as removed | 38,602 | Unmatched in A after alignment |

### Interpretation (conservative)

SolDiff found **1,300** directly matched instruction fingerprints, including **1,274** matches that moved to different byte offsets. It also identified **63** aligned substitutions across **76** changed regions.

The alignment contains large unmatched regions: **41,228** instructions are classified as added and **38,602** as removed. These figures should **not** be interpreted as 79,830 independent semantic instruction changes. Large unmatched regions can result from code insertion, deletion, reorganization, compiler/toolchain changes, or divergence that prevents one-to-one alignment.

Therefore, the strongest defensible conclusion from this analysis is:

> **The two reconstructed binaries have substantially different SBF instruction streams, but this comparison does not establish how much application-level behavior changed.**

SolDiff does not currently establish source-level or application-level semantic equivalence between these versions (**Level 3 — not established**).

### Sample decoded differences

These examples demonstrate **syntactic** instruction differences. A changed call target does not, by itself, establish what application-level behavior changed.

```text
Version A:
offset 48
decoded: call 31348

Version B:
offset 48
decoded: call 34040
```

```text
Version A:
offset 160
decoded: call 1959

Version B:
offset 160
decoded: call 1983
```

```text
Version A:
offset 224
decoded: call 31326

Version B:
offset 224
decoded: call 34018
```

```text
Version B (unmatched / classified as added):
offset 232
decoded: ldxdw r1, [r10+-16]

offset 240
decoded: ldxdw r2, [r10+-8]

offset 248
decoded: mov64 r3, 2
```

---

## 9. `.rodata` Comparison

**Level 1 (bytes)** is primary. Extracted strings are supplementary only.

| Metric | Value |
| --- | ---: |
| `.rodata` unchanged | false |
| Size A → B | 12,479 → 12,623 (+144) |
| Approx. bytes in changed regions | 12,169 |
| Merged changed regions (capped listing) | 4 |

The `.rodata` section changed by **144 bytes** in total size, with approximately **12,169 bytes** participating in changed regions. Extracted strings are presented only as contextual evidence because compiler/runtime strings, path metadata, fragmentation, and layout changes can produce misleading string-level differences.

### Supplementary string context (not feature proof)

Examples near changed regions include toolchain paths (`/home/runner/work/platform-tools/...`), runtime/panic strings, and fragmented Anchor/endoAVS path concatenations. These are **not** proof that product features were added or removed.

```text
Observed:
.rodata bytes differ; some extracted strings near changed regions differ or shift

Inference:
unknown / likely rebuild + toolchain path + layout changes

Not proven:
product behavior changed because a string appeared or disappeared in the extractor output
```

Historical Anchor IDL for Version A remains **unavailable**.

---

## 10. Public-Key Candidates

Rule: `NEW_32_BYTE_PUBLIC_KEY_CANDIDATE` (LOW, low confidence). **Not** proven CPI targets.

| Public key | Exists on-chain? | Executable? | Assessment |
| --- | --- | --- | --- |
| `Du3G3vLMCg7UmDc1CB7JzdZkuTzCw6rqR9MjhLZeKB8b` | no | no | low-confidence candidate; arbitrary 32-byte data that base58-decodes |
| `ULjpebnht6NgdKw8cLTNkV5BDwLow9z12Zuh6gN9G47` | no | no | same |
| `DKPNtwp5FQ8tXU13FZDeJcL5LSjAVdkg2X3UhWiTTxCw` | no | no | same |

Any blast-radius visualization in the product UI remains a **synthetic** display aid — not an on-chain dependency proof.

---

## 11. Findings

| Finding | Severity | Confidence | Interpretation |
| --- | --- | --- | --- |
| `TEXT_BYTES_CHANGED` | INFO | high | `.text` bytes differ (Level 1) |
| `BYTECODE_CHANGED` | INFO | high | `.text` hash changed (Level 1) |
| `RODATA_BYTES_CHANGED` | INFO | high | `.rodata` bytes differ (Level 1) |
| `LARGE_TEXT_REGION_CHANGED` | MEDIUM | medium | 11,016 chunk churn — observational, not a vulnerability |
| `SBF_INSTRUCTION_DIFF` | MEDIUM | medium | Sequence-alignment observations (Level 2); not semantic proof |
| `RODATA_STRING_CONTEXT` | LOW | low | Supplementary strings only |
| `NEW_32_BYTE_PUBLIC_KEY_CANDIDATE` ×3 | LOW | low | Not proven CPI targets |
| `HISTORICAL_IDL_UNAVAILABLE` | INFO | high | No historical IDL claims for Version A |

**Observed Change Score: 40/100**

This is a weighted measure of observed binary/structural changes. It is **not** a vulnerability probability, security score, or maliciousness assessment. It is listed here for completeness, not as the lead result of the case study.

This report does **not** claim detection of a malicious or high-risk upgrade.

---

## 12. What SolDiff Proves

### Proven by this case study

- Upgrade-pair identity (two real Upgradeable Loader upgrades)
- Same Program and same ProgramData
- Distinct deployment buffers associated with each cycle
- Bounded deployment cycles (`InitializeBuffer` → `Upgrade`)
- Complete reconstructed byte coverage; zero unexpected overlaps
- Reproducible artifact SHA-256 hashes
- ELF structural validity for loadable `.text` / `.rodata` (SolDiff + pyelftools)
- Raw byte differences in `.text` and `.rodata` (Level 1)
- SBF instruction-stream alignment observations (Level 2)
- `.rodata` byte-region differences (Level 1), with strings as context only
- Historical Anchor IDL for Version A unavailable

### Not proven by this case study

See next section.

---

## 13. What SolDiff Does Not Prove

- Semantic / application-level equivalence or inequivalence
- Maliciousness or benign intent
- Vulnerabilities or security impact
- Exact behavioral changes
- Source-level changes
- Verified-build equivalence (`solana-verify`)
- CPI targets from arbitrary 32-byte public-key candidates
- A real on-chain account dependency graph (blast radius is **synthetic**)

---

## 14. Limitations

1. Depends on archival-capable RPC for complete Write history
2. Same-slot write ordering can be ambiguous without transaction index
3. SBF sequence alignment is syntactic — large add/remove regions are alignment output, not proven semantic edits
4. `.rodata` string extraction can concatenate or fragment runs
5. Historical Anchor IDL unavailable unless separately proven
6. No verified-build comparison
7. Observed change score ≠ vulnerability score
8. No Rewind / historical ProgramData snapshot cross-check in this run

---

## 15. Reproduction

```bash
bun run case-study --program endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT \
  --from 5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7 \
  --to 2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD \
  --out /tmp/soldiff-solayer \
  --label "Solayer endoAVS"
```

Or regenerate this root report from a fresh mainnet run:

```bash
bun scripts/generate-root-report.ts
```

### Artifact hashes

- Version A SHA-256: `3b01555e088bb8f3b8c23f0c26c23f5f0cd965ad2c89f194d58d24fb405b84a4`
- Version B SHA-256: `6516c821ba50c4eceebde47f4ed2c73ec02ef658add72f60a2c2de58c49f2e93`

---

## Final Verdict

### READY FOR PUBLIC CASE STUDY

Ready for publication as an **evidence-first on-chain reconstruction and binary-diff case study**.

It should **not** be presented as a vulnerability detector or semantic security analyzer.
