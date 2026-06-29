import { PublicKey } from "@solana/web3.js";

/** BPF Upgradeable Loader — all upgradeable Solana programs use this. */
export const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

/** First 45 bytes of a ProgramData account are loader metadata; ELF follows. */
export const PROGRAM_DATA_HEADER_SIZE = 45;

/** Buffer account header before ELF bytes in BPF Upgradeable Loader. */
export const BUFFER_HEADER_SIZE = 37;

/** BPF Upgradeable Loader instruction discriminators (u32 LE). */
export const LOADER_IX_WRITE = 1;
export const LOADER_IX_UPGRADE = 3;

/** Well-known programs — CPI targets outside this set are flagged. */
export const KNOWN_PROGRAM_IDS = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "SysvarRent111111111111111111111111111111111",
  "SysvarC1ock11111111111111111111111111111111",
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58(),
  "BPFLoaderUpgradeab1e11111111111111111111111",
  "Stake11111111111111111111111111111111111111",
  "Vote111111111111111111111111111111111111111",
]);
