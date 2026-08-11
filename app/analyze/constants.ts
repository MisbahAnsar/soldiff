/**
 * One-click analyze example — Solayer endoAVS pair from the real mainnet case study
 * (case-study/solayer-endoavs-285208450-302204161). Verified reconstructable via
 * buffer Write replay with coverageComplete=true for both versions.
 */
export const PROVEN_EXAMPLE = {
  label: "Solayer endoAVS",
  programId: "endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT",
  solscanUrl:
    "https://solscan.io/account/endoLNCKTqDn8gSVnN2hDdpgACUPWHZTwoYnnMybpAT",
  /** Version A — older upgrade */
  prevUpgradeSignature:
    "5tE2GLnw9aLSEgbp5wZ7pHRJZYPtoRK9M7KY79eMXzbiE6Ziq4iqJtVvGfH9cUorkXfa9Bx3HYs5mXrUrYtJWkZ7",
  prevUpgradeSlot: 285_208_450,
  /** Version B — newer upgrade */
  upgradeSignature:
    "2AC3FzTyMRr9AkNwPRfmYKPDwcXkSnbuD2w4GhagyuNDHfSc95aiAneSNnddwZbdiKgCrdNnarCr9YgDpR7cbXvD",
  upgradeSlot: 302_204_161,
} as const;
