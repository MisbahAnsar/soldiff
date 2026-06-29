import type { VersionedTransactionResponse } from "@solana/web3.js";

/** Flat account key list for a fetched transaction (static + loaded). */
export function transactionAccountKeys(
  tx: VersionedTransactionResponse
): string[] {
  const msg = tx.transaction.message;
  const staticKeys =
    "staticAccountKeys" in msg && msg.staticAccountKeys
      ? msg.staticAccountKeys.map((k) => k.toBase58())
      : msg.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());

  const loadedW = tx.meta?.loadedAddresses?.writable?.map((k) => k.toBase58()) ?? [];
  const loadedR = tx.meta?.loadedAddresses?.readonly?.map((k) => k.toBase58()) ?? [];
  return [...staticKeys, ...loadedW, ...loadedR];
}

/** Top-level compiled instructions from a fetched transaction message. */
export function transactionTopInstructions(
  tx: VersionedTransactionResponse
): Array<{
  programIdIndex: number;
  accounts: number[];
  data: string | Uint8Array | Buffer;
}> {
  const msg = tx.transaction.message;
  if ("compiledInstructions" in msg && msg.compiledInstructions) {
    return msg.compiledInstructions.map((ix) => ({
      programIdIndex: ix.programIdIndex,
      accounts: ix.accountKeyIndexes,
      data: ix.data,
    }));
  }
  if ("instructions" in msg && msg.instructions) {
    return msg.instructions;
  }
  return [];
}
