import { type Connection, type VersionedTransactionResponse } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  LOADER_IX_UPGRADE,
} from "./constants";
import { instructionDataToBuffer } from "./ix-data";
import { rpcGetTransaction } from "./rpc-executor";
import { transactionAccountKeys, transactionTopInstructions } from "./tx-keys";

export interface ParsedUpgradeTx {
  bufferAddress: string;
  programId: string;
  programDataAddress: string;
  slot: number;
  signature: string;
}

function scanInstructions(
  tx: VersionedTransactionResponse,
  keys: string[],
  bpf: string
): ParsedUpgradeTx | null {
  const loader = bpf;

  const tryIx = (ix: {
    programIdIndex: number;
    accounts: number[];
    data: string | Uint8Array | Buffer;
  }): ParsedUpgradeTx | null => {
    if (keys[ix.programIdIndex] !== loader) return null;
    const raw = instructionDataToBuffer(ix.data);
    if (raw.length < 4 || raw.readUInt32LE(0) !== LOADER_IX_UPGRADE) return null;
    if (ix.accounts.length < 3) return null;

    const programDataAddress = keys[ix.accounts[0]];
    const programId = keys[ix.accounts[1]];
    const bufferAddress = keys[ix.accounts[2]];

    return {
      bufferAddress,
      programId,
      programDataAddress,
      slot: tx.slot,
      signature: tx.transaction.signatures[0],
    };
  };

  const top = transactionTopInstructions(tx);
  for (const ix of top) {
    const hit = tryIx(ix);
    if (hit) return hit;
  }

  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      const hit = tryIx(ix);
      if (hit) return hit;
    }
  }

  return null;
}

/** Parse a BPF Upgradeable Loader `Upgrade` instruction from an on-chain tx. */
export async function parseUpgradeTransaction(
  _connection: Connection,
  upgradeSignature: string
): Promise<ParsedUpgradeTx> {
  const tx = await rpcGetTransaction(upgradeSignature);

  if (!tx) {
    throw new Error(`Upgrade transaction not found: ${upgradeSignature}`);
  }

  const keys = transactionAccountKeys(tx);
  const bpf = BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58();
  const parsed = scanInstructions(tx, keys, bpf);

  if (!parsed) {
    throw new Error(
      `No BPF Upgrade instruction found in transaction ${upgradeSignature.slice(0, 12)}…`
    );
  }

  return { ...parsed, signature: upgradeSignature };
}

export function assertProgramMatch(parsed: ParsedUpgradeTx, expectedProgramId: string): void {
  if (parsed.programId !== expectedProgramId) {
    throw new Error(
      `Upgrade tx targets ${parsed.programId}, expected ${expectedProgramId}`
    );
  }
}
