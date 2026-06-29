import { Connection, PublicKey } from "@solana/web3.js";
import { createConnection } from "./rpc";
import { parseUpgradeTransaction } from "./upgrade-tx";

export interface UpgradeBoundary {
  slot: number;
  signature: string;
}

/** Scan ProgramData tx history for successful BPF Upgrade transactions. */
export async function findUpgradeBoundaries(
  programDataAddress: PublicKey,
  connection: Connection = createConnection()
): Promise<UpgradeBoundary[]> {
  const candidates: UpgradeBoundary[] = [];
  let before: string | undefined;

  for (let page = 0; page < 40; page++) {
    const batch = await connection.getSignaturesForAddress(programDataAddress, {
      limit: 1000,
      before,
    });
    if (batch.length === 0) break;

    for (const entry of batch) {
      if (entry.err) continue;
      candidates.push({ slot: entry.slot, signature: entry.signature });
    }

    before = batch[batch.length - 1].signature;
    if (batch.length < 1000) break;
  }

  const verified: UpgradeBoundary[] = [];
  for (const c of candidates) {
    try {
      const parsed = await parseUpgradeTransaction(connection, c.signature);
      if (parsed.programDataAddress !== programDataAddress.toBase58()) continue;
      verified.push({ slot: parsed.slot, signature: c.signature });
    } catch {
      // Not a BPF Upgrade tx — skip multisig / admin touches on ProgramData.
    }
    if (verified.length >= 50) break;
  }

  return verified;
}

export function findUpgradesBetween(
  upgrades: UpgradeBoundary[],
  fromSlot: number,
  toSlot: number
): UpgradeBoundary[] {
  return upgrades.filter((u) => u.slot > fromSlot && u.slot <= toSlot);
}

export function nearestUpgrades(
  upgrades: UpgradeBoundary[],
  fromSlot: number,
  toSlot: number
): { before: UpgradeBoundary | null; after: UpgradeBoundary | null } {
  let before: UpgradeBoundary | null = null;
  let after: UpgradeBoundary | null = null;

  for (const u of upgrades) {
    if (u.slot <= fromSlot && (!before || u.slot > before.slot)) {
      before = u;
    }
    if (u.slot > toSlot && (!after || u.slot < after.slot)) {
      after = u;
    }
  }

  return { before, after };
}

export function formatSlot(slot: number): string {
  return slot.toLocaleString("en-US");
}

export async function assertUpgradeInRange(
  programDataAddress: PublicKey,
  fromSlot: number,
  toSlot: number
): Promise<void> {
  const upgrades = await findUpgradeBoundaries(programDataAddress);
  const inRange = findUpgradesBetween(upgrades, fromSlot, toSlot);

  if (inRange.length > 0) return;

  const { before, after } = nearestUpgrades(upgrades, fromSlot, toSlot);
  const hints: string[] = [];

  if (before) {
    hints.push(
      `last upgrade before your range: slot ${formatSlot(before.slot)} (try fromSlot ${formatSlot(before.slot - 1)})`
    );
  }
  if (after) {
    hints.push(
      `next upgrade after your range: slot ${formatSlot(after.slot)} (try toSlot ${formatSlot(after.slot + 1)})`
    );
  }

  throw new Error(
    `No program upgrade occurred between slot ${formatSlot(fromSlot)} and ${formatSlot(toSlot)}. ` +
      `SolDiff needs one upgrade inside that window (fromSlot = before upgrade, toSlot = after). ` +
      (hints.length ? hints.join(". ") + "." : "Could not find nearby upgrades in indexed history.")
  );
}
