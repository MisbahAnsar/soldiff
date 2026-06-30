import { createHash } from "crypto";

/** Hash first 16 hex chars of ELF bytes — for logging / verification. */
export function elfContentHash(elf: Buffer): string {
  return createHash("sha256").update(elf).digest("hex").slice(0, 16);
}

/**
 * Unique key per deployment — buffer alone is NOT sufficient because the same
 * buffer account can accumulate Write txs across multiple upgrade cycles.
 */
export function makeElfCacheKey(
  bufferPubkey: string,
  upgradeSlot: number,
  upgradeSignature: string
): string {
  return `${bufferPubkey}@${upgradeSlot}#${upgradeSignature}`;
}

const elfCache = new Map<string, Buffer>();

export function getCachedElf(cacheKey: string): Buffer | undefined {
  return elfCache.get(cacheKey);
}

export function setCachedElf(cacheKey: string, elf: Buffer): void {
  elfCache.set(cacheKey, elf);
}

export function clearElfCache(): void {
  elfCache.clear();
}
