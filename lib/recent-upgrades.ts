import { PublicKey } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  PROGRAM_DATA_HEADER_SIZE,
} from "@/lib/soldiff/constants";
import { createConnection } from "@/lib/soldiff/rpc";
import {
  resetRpcSession,
  rpcGetAccountInfo,
  rpcGetProgramAccounts,
  rpcGetSignaturesForAddress,
  rpcGetSlot,
} from "@/lib/soldiff/rpc-executor";
import { parseUpgradeTransaction } from "@/lib/soldiff/upgrade-tx";

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LOOKBACK_SLOTS = 2_000_000;
const DEFAULT_MAX_PROGRAM_SIZE = 300_000;
const DEFAULT_RESULT_LIMIT = 20;
const MAX_SIGNATURE_SCAN = 1200;

type UpgradeHit = {
  signature: string;
  slot: number;
};

export interface RecentUpgradeProgram {
  programId: string;
  label?: string;
  programSizeBytes: number;
  lastDeployedSlot: number;
  upgradeSignatures: string[]; // oldest -> newest
  previousUpgradeSignature: string; // Version A
  latestUpgradeSignature: string; // Version B
  previousUpgradeSlot: number;
  latestUpgradeSlot: number;
}

export interface RecentUpgradeDiscoveryResult {
  generatedAt: number;
  currentSlot: number;
  minSlot: number;
  cached: boolean;
  scannedSignatures: number;
  upgradeCandidates: number;
  programs: RecentUpgradeProgram[];
}

let cachedResult: { expiresAt: number; value: RecentUpgradeDiscoveryResult } | null =
  null;

function formatLabel(programId: string): string {
  return `Program ${programId.slice(0, 6)}…${programId.slice(-4)}`;
}

export async function discoverRecentUpgrades(): Promise<RecentUpgradeDiscoveryResult> {
  const now = Date.now();
  if (cachedResult && cachedResult.expiresAt > now) {
    return { ...cachedResult.value, cached: true };
  }

  resetRpcSession();
  const connection = createConnection();

  const currentSlot = await rpcGetSlot();
  const minSlot = Math.max(0, currentSlot - DEFAULT_LOOKBACK_SLOTS);

  const signatures: string[] = [];
  let before: string | undefined;
  let stop = false;

  while (signatures.length < MAX_SIGNATURE_SCAN && !stop) {
    const page = await rpcGetSignaturesForAddress(
      BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
      {
        limit: Math.min(1000, MAX_SIGNATURE_SCAN - signatures.length),
        before,
      }
    );
    if (page.length === 0) break;

    for (const row of page) {
      if (row.err) continue;
      if (row.slot < minSlot) {
        stop = true;
        break;
      }
      signatures.push(row.signature);
    }

    before = page[page.length - 1]?.signature;
    if (!before) break;
  }

  const byProgram = new Map<string, UpgradeHit[]>();

  // Parse in bounded chunks; rpc executor enforces concurrency.
  const chunkSize = 50;
  if (signatures.length > 0) {
    for (let i = 0; i < signatures.length; i += chunkSize) {
      const chunk = signatures.slice(i, i + chunkSize);
      const parsed = await Promise.allSettled(
        chunk.map((sig) => parseUpgradeTransaction(connection, sig))
      );

      for (const r of parsed) {
        if (r.status !== "fulfilled") continue;
        const row = r.value;
        if (row.slot < minSlot) continue;

        const list = byProgram.get(row.programId) ?? [];
        list.push({ signature: row.signature, slot: row.slot });
        byProgram.set(row.programId, list);
      }
    }
  } else {
    try {
      await fallbackScanRecentPrograms(byProgram, minSlot);
    } catch (err) {
      console.warn(
        `[recent-upgrades] fallback scan failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const candidates = Array.from(byProgram.entries()).filter(
    ([, hits]) => hits.length >= 2
  );

  const hydrated = await Promise.all(
    candidates.map(async ([programId, hits]) => {
      const sorted = hits.sort((a, b) => a.slot - b.slot); // oldest -> newest
      const latest = sorted[sorted.length - 1];
      const previous = sorted[sorted.length - 2];

      if (!latest || !previous) return null;
      if (latest.slot < minSlot) return null;

      const programPk = new PublicKey(programId);
      const programAccount = await rpcGetAccountInfo(programPk);
      if (!programAccount) return null;
      if (!programAccount.executable) return null;
      if (!programAccount.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) return null;

      // Program account stores ProgramData pubkey at bytes [4..36].
      if (programAccount.data.length < 36) return null;
      const tag = programAccount.data.readUInt32LE(0);
      if (tag !== 2) return null;
      const programDataPk = new PublicKey(programAccount.data.subarray(4, 36));
      const programData = await rpcGetAccountInfo(programDataPk);
      if (!programData) return null;

      const programSizeBytes = Math.max(
        0,
        programData.data.length - PROGRAM_DATA_HEADER_SIZE
      );
      if (programSizeBytes > DEFAULT_MAX_PROGRAM_SIZE) return null;

      return {
        programId,
        label: formatLabel(programId),
        programSizeBytes,
        lastDeployedSlot: latest.slot,
        upgradeSignatures: sorted.map((x) => x.signature),
        previousUpgradeSignature: previous.signature,
        latestUpgradeSignature: latest.signature,
        previousUpgradeSlot: previous.slot,
        latestUpgradeSlot: latest.slot,
      } satisfies RecentUpgradeProgram;
    })
  );

  const programs = hydrated
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.lastDeployedSlot - a.lastDeployedSlot)
    .slice(0, DEFAULT_RESULT_LIMIT);

  const value: RecentUpgradeDiscoveryResult = {
    generatedAt: Date.now(),
    currentSlot,
    minSlot,
    cached: false,
    scannedSignatures: signatures.length,
    upgradeCandidates: candidates.length,
    programs,
  };

  const ttl = programs.length > 0 ? CACHE_TTL_MS : 30_000;
  cachedResult = { value, expiresAt: now + ttl };
  return value;
}

async function fallbackScanRecentPrograms(
  byProgram: Map<string, UpgradeHit[]>,
  minSlot: number
) {
  const connection = createConnection();
  const programTag2 = "3"; // bs58([2,0,0,0]) => "3"
  const rows = await rpcGetProgramAccounts(BPF_LOADER_UPGRADEABLE_PROGRAM_ID, {
    filters: [
      { dataSize: 36 },
      { memcmp: { offset: 0, bytes: programTag2 } },
    ],
    dataSlice: { offset: 0, length: 36 },
  });

  // sample a bounded subset so helper stays responsive
  const sample = rows.slice(0, 400);
  for (const row of sample) {
    const data = row.account.data as Buffer;
    if (!Buffer.isBuffer(data) || data.length < 36) continue;
    const programId = row.pubkey.toBase58();
    const programDataPk = new PublicKey(data.subarray(4, 36));

    const sigs = await rpcGetSignaturesForAddress(programDataPk, { limit: 8 });
    const upgrades: UpgradeHit[] = [];
    for (const s of sigs) {
      if (s.err || s.slot < minSlot) continue;
      try {
        const parsed = await parseUpgradeTransaction(connection, s.signature);
        if (parsed.programId !== programId) continue;
        upgrades.push({ signature: s.signature, slot: s.slot });
      } catch {
        // ignore non-upgrade txs
      }
    }

    if (upgrades.length >= 2) {
      byProgram.set(programId, upgrades.sort((a, b) => a.slot - b.slot));
      if (byProgram.size >= DEFAULT_RESULT_LIMIT * 2) break;
    }
  }
}
