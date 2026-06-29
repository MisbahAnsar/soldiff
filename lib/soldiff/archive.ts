import { getRewindRpcUrl } from "./config";

export interface ArchiveCoverage {
  earliestSlot: number;
  latestSlot?: number;
  gapPercent?: number;
}

let cachedCoverage: ArchiveCoverage | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export async function getArchiveCoverage(): Promise<ArchiveCoverage> {
  if (cachedCoverage && Date.now() - cachedAt < CACHE_MS) {
    return cachedCoverage;
  }

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getRewindCoverage",
    params: [],
  };

  const res = await fetch(getRewindRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    result?: {
      earliestSlot?: number;
      latestSlot?: number;
      gapPercent?: number;
    };
  };

  const earliestSlot = json.result?.earliestSlot ?? 0;
  cachedCoverage = {
    earliestSlot,
    latestSlot: json.result?.latestSlot,
    gapPercent: json.result?.gapPercent,
  };
  cachedAt = Date.now();
  return cachedCoverage;
}

export function isSlotInArchive(slot: number, earliestSlot: number): boolean {
  return earliestSlot > 0 && slot >= earliestSlot;
}

export function formatSlot(slot: number): string {
  return slot.toLocaleString("en-US");
}

export function archiveUnavailableMessage(
  upgradeSlot: number,
  earliestSlot: number
): string {
  return (
    `This upgrade (slot ${formatSlot(upgradeSlot)}) is outside the free historical archive ` +
    `(earliest slot ${formatSlot(earliestSlot)}, roughly the last few days of mainnet). ` +
    `Jupiter was last upgraded at slot ${formatSlot(248_727_791)} — too old for free tier. ` +
    `Options: (1) use a paid deep-archive Rewind RPC (e.g. Triton One) via SOLANA_REWIND_RPC_URL, ` +
    `(2) deploy and upgrade your own program on devnet/mainnet this week to test, ` +
    `(3) use the static demo on the homepage for UI preview.`
  );
}
