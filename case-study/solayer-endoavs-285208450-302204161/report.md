# SolDiff Case Study — Solayer endoAVS

**Cluster:** Solana mainnet-beta  
**Generated:** 2026-08-11T01:58:01.729Z  
**Tool:** SolDiff 0.2.0  
**Artifact status:** reconstructed from on-chain transaction history (not solana-verify / verified-build)

---

## Program

| Field | Value |
|---|---|
| Label | Solayer endoAVS |
| Program ID | `endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT` |
| ProgramData | `2GDubXcpGKwpRekN6iWCPXTvfZ7sHoD3WG7MZSWutFzM` |
| Owner | BPF Upgradeable Loader (`BPFLoaderUpgradeab1e11111111111111111111111`) |
| Framework heuristic | `unknown` (no historically matched Anchor IDL) |

### Why this program was selected

Verified from live mainnet RPC (not static demo fixtures):

1. Classic BPF Upgradeable Loader program account.
2. At least six verified historical Upgrade transactions on ProgramData.
3. Versions A and B are **adjacent** verified upgrades (`slotA < slotB`, no verified Upgrade between them in the scanned history).
4. **Distinct buffer addresses** for A and B.
5. Each buffer history contains a clear `InitializeBuffer → Write(s) → Upgrade` deployment cycle.
6. Write coverage complete for both reconstructions (`coverageComplete: true`, zero unexpected overlaps).
7. Binary size is large but fully reconstructable from archival `getTransaction` history on the configured RPC.

---

## Version A

| Field | Value |
|---|---|
| Upgrade signature | `5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7` |
| Slot | `285208450` |
| Buffer | `buf5a19HRXELq7vKcee4qWt4GLq7aQP14WVe19qT2o3` |
| Artifact size | `375716` bytes |
| SHA-256 | `3b01555e088bb8f3b8c23f0c26c23f5f0cd965ad2c89f194d58d24fb405b84a4` |
| `.text` SHA-256 | `062d290f3b6cac1820b67fac44882774337cb5f1a05499c162c657fdff2f9ae2` |
| `.rodata` SHA-256 | `7073ec3b27d4207c6f0ec5fa73649fb9400f7ea78ffa16506edf43cc13ae1056` |
| `.text` size | `331184` bytes |
| `.rodata` size | `12479` bytes |
| Reconstruction method | `buffer-write-replay` |
| Write txs / chunks | `372` / `372` |
| Coverage complete | **true** |
| Unexpected overlaps | `0` |
| Deployment cycle start | `InitializeBuffer` `5EEC7vkbJfNNvn1MRUWPG4oXrVbzftrgwMbPYifXqAysjCtACJMHGxJG98f4mQFnXni4nKRYC1t8fmEW91u1znQF` |

## Version B

| Field | Value |
|---|---|
| Upgrade signature | `2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD` |
| Slot | `302204161` |
| Buffer | `piNr72uHL1jfaSz4EwB3w9VZhL8g6CR9hzMUyd2wRcN` |
| Artifact size | `398228` bytes |
| SHA-256 | `6516c821ba50c4eceebde47f4ed2c73ec02ef658add72f60a2c2de58c49f2e93` |
| `.text` SHA-256 | `d018b83678f9284e016c01a8a061a16be6891928798b38dd7f01940b1bb9726c` |
| `.rodata` SHA-256 | `a2c7033f4f49b8455249016e674b8159ac595ad7c399adfd23daae0d70ed6dc5` |
| `.text` size | `352720` bytes |
| `.rodata` size | `12623` bytes |
| Reconstruction method | `buffer-write-replay` |
| Write txs / chunks | `394` / `394` |
| Coverage complete | **true** |
| Unexpected overlaps | `0` |
| Deployment cycle start | `InitializeBuffer` `3cK9gYRZerVEcgmWzF6MBUPMkJGG2vnrPEbJfedy5NEGW8NRyVSgATQ1mKVgXGu6chupqfVkRJ9WEkjRa4pXo1dh` |

---

## Reconstruction

For each upgrade SolDiff:

1. Parsed the BPF Upgradeable Loader `Upgrade` instruction to obtain Program, ProgramData, and buffer.
2. Collected the buffer address signature history at slots `<=` the upgrade slot (same-slot included).
3. Isolated the deployment cycle ending at the target Upgrade, bounded by `InitializeBuffer`.
4. Sorted Write chunks deterministically (slot → tx index when available → instruction indices).
5. Assembled bytes with a coverage map (no silent gap acceptance).
6. Extracted the ELF at magic `0x7fELF`, validated ELF64/LE structure, and hashed the artifact.

Uploaded buffer images for these versions begin with four zero bytes before ELF magic; SolDiff treats the executable artifact as the bytes from ELF magic onward (consistent with how ProgramData stores executables after its 45-byte header).

---

## Verification

### What was independently checked in this run

| Check | Result |
|---|---|
| Program owned by BPF Upgradeable Loader | yes |
| Same Program ID on both upgrades | yes |
| Same ProgramData on both upgrades | yes |
| `slotA < slotB` | yes (`285208450 < 302204161`) |
| Adjacent in verified ProgramData Upgrade list | yes |
| Distinct buffers | yes |
| `InitializeBuffer` boundary present | yes (both) |
| Write coverage complete | yes (both) |
| Conflicting overlapping writes | none |
| ELF magic / ELF64 / little-endian | yes |
| `.text` / `.rodata` section contents in bounds | yes |
| On-disk `.so` SHA-256 matches `artifact-*.sha256` | yes (re-hashed after write) |

### Historical snapshot cross-check

**Historical snapshot cross-check: unavailable**

No custom deep-archive `SOLANA_REWIND_RPC_URL` was configured. The default public Rewind endpoint did not return usable historical ProgramData for these slots in this run. Therefore SolDiff does **not** claim independent byte-identity against a historical account snapshot.

### Terminology

These artifacts are **reconstructed from on-chain Write transaction history**.  
They are **not** claimed as `solana-verify` / verified-build outputs.

### Reconstruction warnings (honest)

1. Same-slot multi-transaction writes lack RPC transaction index; ordering falls back to signature lexicographic order and may be imperfect for same-slot ties.
2. ELF section-header tables exceed file length by 4 bytes; SolDiff parses available headers and confirms loadable `.text`/`.rodata` contents remain in bounds. This matches observed Solana SBF upload quirks and is recorded as a warning, not ignored silently.

---

## Raw Byte Diff

| Section | Unchanged? | Notes |
|---|---|---|
| `.text` | **no** | `062d290f…` → `d018b836…`; size `331184` → `352720` (+21536) |
| `.rodata` | **no** | `7073ec3b…` → `a2c7033f…`; size `12479` → `12623` (+144) |
| Changed aligned 32-byte `.text` chunks | **11016** | Raw churn metric only |

Both code and read-only data changed. This is **not** a `.rodata`-only upgrade.

---

## SBF Instruction Diff

Offset-aligned instruction-level comparison (ISA decode; not a semantic decompiler):

| Metric | Value |
|---|---|
| Added | 3946 |
| Removed | 1320 |
| Replaced | 38444 |
| Unchanged | 201 |
| Changed regions | 164 |

Interpretation: the `.text` section was heavily rewritten / relocated. Offset-aligned “replaced” counts inflate when code shifts. Treat this as **instruction-level evidence of large churn**, not proof of a specific vulnerability.

---

## Anchor IDL

> Historical Anchor IDL was unavailable for Version A, so no historical IDL comparison was claimed.

Framework heuristic remains `unknown` for this case study.

---

## Findings (evidence-backed)

Only findings with explicit evidence are listed. Heuristics are labeled as such.

### High / medium (supported, non-security-conclusive)

1. **`LARGE_TEXT_REGION_CHANGED`** (HIGH, confidence=medium, analyzer=`raw-byte`)  
   11016 aligned 32-byte `.text` chunks differ. Measures raw region churn only.

2. **`SBF_INSTRUCTION_DIFF`** (MEDIUM, confidence=medium, analyzer=`sbf-instruction`)  
   Large instruction-level delta (+3946 / -1320 / ~38444 replaced; 164 regions).

3. **`NEW_RODATA_STRINGS` / `REMOVED_RODATA_STRINGS`** (MEDIUM, confidence=medium, analyzer=`raw-byte`)  
   Rodata string set changed (including toolchain path strings such as CI `runner` vs local `Users/dmitri` paths). This is consistent with a rebuild/relayout, not by itself a security conclusion.

### Informational

4. **`TEXT_BYTES_CHANGED` / `BYTECODE_CHANGED`** (INFO, high confidence) — `.text` hash changed.  
5. **`HISTORICAL_IDL_UNAVAILABLE`** (INFO, high confidence) — no historical IDL claim.

### Low-confidence heuristics (not CPI proof)

6. **`NEW_32_BYTE_PUBLIC_KEY_CANDIDATE`** (LOW, confidence=low) ×3  
   Sampled 32-byte windows that decode as pubkeys. **Not** proof of new external programs or CPI targets.

**Most interesting real finding (plain English):**  
Between these two adjacent upgrades, the program binary grew and its executable `.text` was extensively rewritten (tens of thousands of offset-aligned instruction differences), with accompanying `.rodata` changes including toolchain/path string churn. SolDiff can prove the reconstructed bytes differ; it cannot prove which high-level behaviors changed without source or a richer semantic layer.

---

## Limitations

- Raw byte and SBF instruction diffs do not prove semantic equivalence or behavioral change.
- Historical Anchor IDL for Version A is unavailable; current IDL is never attributed to past versions.
- Sampled 32-byte public-key candidates are not proven CPI targets.
- Same-slot write ordering may be ambiguous without block transaction indexes.
- No Rewind/historical ProgramData byte-identity cross-check in this run.
- No verified-build / `solana-verify` attestation.
- Blast-radius UI (if viewed in the web app) is synthetic display aid, not an on-chain dependency proof.

---

## Reproduction

```bash
bun run case-study \
  --program endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT \
  --from 5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7 \
  --to 2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD \
  --out case-study/solayer-endoavs-285208450-302204161 \
  --label "Solayer endoAVS"
```

Requires a mainnet RPC with archival transaction history for the buffer Write transactions.

### Output files

```text
case-study/solayer-endoavs-285208450-302204161/
├── manifest.json
├── report.json
├── report.md
├── SUMMARY.md
├── version-a.so
├── version-b.so
├── artifact-a.sha256
└── artifact-b.sha256
```
