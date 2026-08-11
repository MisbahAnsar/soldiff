# Case Study Summary — Solayer endoAVS

### What was analyzed

Solana mainnet program `endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT` (Solayer endoAVS), comparing two adjacent BPF Upgradeable Loader upgrades via Write-transaction ELF reconstruction.

### Why this program was selected

Live RPC verification showed: upgradeable loader ownership, ≥2 historical upgrades, adjacent A/B pair, distinct buffers, `InitializeBuffer → Writes → Upgrade` cycles, complete Write coverage, and reconstructable binaries. Not chosen from static homepage demo data alone (though this program also appears as a UI example).

### Upgrade A

- Signature: `5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7`
- Slot: `285208450`
- Buffer: `buf5a19HRXELq7vKcee4qWt4GLq7aQP14WVe19qT2o3`
- SHA-256: `3b01555e088bb8f3b8c23f0c26c23f5f0cd965ad2c89f194d58d24fb405b84a4`
- Size: 375716 bytes · coverageComplete: true

### Upgrade B

- Signature: `2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD`
- Slot: `302204161`
- Buffer: `piNr72uHL1jfaSz4EwB3w9VZhL8g6CR9hzMUyd2wRcN`
- SHA-256: `6516c821ba50c4eceebde47f4ed2c73ec02ef658add72f60a2c2de58c49f2e93`
- Size: 398228 bytes · coverageComplete: true

### Artifact verification status

- Reconstructed from on-chain Write history for both versions.
- coverageComplete true; unexpected overlaps 0; ELF64 validated with a documented 4-byte section-header truncation warning.
- Historical ProgramData snapshot cross-check: **unavailable** (no deep Rewind coverage in this environment).
- Not claimed as solana-verify / verified-build.

### What SolDiff detected

- `.text` and `.rodata` both changed (size + hash).
- ~11016 changed 32-byte `.text` chunks.
- SBF instruction-level diff shows large churn (+3946 / -1320 / ~38444 replaced).
- Historical Anchor IDL unavailable — no IDL diff claimed.
- Three low-confidence pubkey-window candidates (not CPI proof).

### Most interesting finding

A large, rebuild-scale change to executable `.text` between adjacent upgrades (binary grew; tens of thousands of offset-aligned instruction differences), with `.rodata` string/toolchain-path churn. Proven as byte/instruction evidence only — not a specific exploit claim.

### What SolDiff could NOT determine

- Semantic / behavioral meaning of the code changes
- Historical Anchor IDL differences
- Proven new CPI targets
- Independent historical account-snapshot equality (Rewind unavailable)
- Verified-build reproducibility

### Reproduction command

```bash
bun run case-study \
  --program endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT \
  --from 5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7 \
  --to 2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD \
  --out case-study/solayer-endoavs-285208450-302204161 \
  --label "Solayer endoAVS"
```

### Final confidence / caveats

**Reconstruction confidence: high** for deployment-cycle isolation + full Write coverage.  
**Publication confidence: needs manual review** before calling this “independently snapshot-verified,” because Rewind cross-check was unavailable and same-slot write ordering can be ambiguous. Suitable as a technical reconstruction case study with the limitations stated above.
