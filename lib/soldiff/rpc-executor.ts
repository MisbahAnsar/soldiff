import pLimit from "p-limit";
import {
  type AccountInfo,
  type ConfirmedSignatureInfo,
  type PublicKey,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import { getRpcPool } from "./rpc-pool";
import { clearElfCache } from "./elf-cache";

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const JITTER_MAX_MS = 200;
const MAX_CONCURRENT_RPC = 2;

const TX_CONFIG = {
  maxSupportedTransactionVersion: 0 as const,
  commitment: "confirmed" as const,
};

let concurrencyLimit: ReturnType<typeof pLimit> | null = null;
let sessionStartedAt = 0;
let retryCount = 0;
let activeCount = 0;
let queuedCount = 0;

const txCache = new Map<string, VersionedTransactionResponse | null>();

export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("compute units per second") ||
    msg.includes("Too Many Requests") ||
    msg.includes("throughput")
  );
}

export function resetRpcSession(): void {
  concurrencyLimit = pLimit(MAX_CONCURRENT_RPC);
  txCache.clear();
  clearElfCache();
  sessionStartedAt = Date.now();
  retryCount = 0;
  activeCount = 0;
  queuedCount = 0;
}

function getLimit(): ReturnType<typeof pLimit> {
  if (!concurrencyLimit) resetRpcSession();
  return concurrencyLimit!;
}

function elapsedSec(): string {
  return ((Date.now() - sessionStartedAt) / 1000).toFixed(1);
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * JITTER_MAX_MS);
}

function parseRetryAfterMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const headerMatch = msg.match(/retry-after[:\s]+(\d+)/i);
  if (headerMatch) return Number(headerMatch[1]) * 1000;
  const secMatch = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (secMatch) return Math.ceil(Number(secMatch[1]) * 1000);
  return null;
}

async function executeRpc<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const limit = getLimit();
  queuedCount++;

  return limit(async () => {
    queuedCount--;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      activeCount++;
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err) || attempt >= RETRY_DELAYS_MS.length) {
          throw err;
        }

        retryCount++;
        const retryAfter = parseRetryAfterMs(err);
        const delay = jitter(retryAfter ?? RETRY_DELAYS_MS[attempt]);
        console.info(`[soldiff] Retrying ${label} because of 429...`);
        console.info(`[soldiff] Waiting ${(delay / 1000).toFixed(1)}s...`);
        await new Promise((r) => setTimeout(r, delay));
      } finally {
        activeCount--;
      }
    }

    throw lastErr;
  });
}

export function getRpcStats(): {
  retryCount: number;
  activeCount: number;
  queuedCount: number;
  elapsedSec: string;
} {
  return {
    retryCount,
    activeCount,
    queuedCount,
    elapsedSec: elapsedSec(),
  };
}

/** Cached getTransaction — deduplicates repeated signature fetches. */
export async function rpcGetTransaction(
  signature: string
): Promise<VersionedTransactionResponse | null> {
  if (txCache.has(signature)) {
    return txCache.get(signature) ?? null;
  }

  const tx = await executeRpc(`getTransaction ${signature.slice(0, 8)}…`, () =>
    getRpcPool().connection().getTransaction(signature, TX_CONFIG)
  );

  txCache.set(signature, tx);
  return tx;
}

export async function rpcGetSignaturesForAddress(
  address: PublicKey,
  options: { limit?: number; before?: string }
): Promise<ConfirmedSignatureInfo[]> {
  return executeRpc(`getSignaturesForAddress ${address.toBase58().slice(0, 8)}…`, () =>
    getRpcPool().connection().getSignaturesForAddress(address, options)
  );
}

export async function rpcGetAccountInfo(
  pubkey: PublicKey
): Promise<AccountInfo<Buffer> | null> {
  return executeRpc(`getAccountInfo ${pubkey.toBase58().slice(0, 8)}…`, () =>
    getRpcPool().connection().getAccountInfo(pubkey)
  );
}
