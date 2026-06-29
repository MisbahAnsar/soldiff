const DEFAULT_REWIND_RPC =
  "https://public.rpc.solanavibestation.com/rewind";

export function getRpcUrl(): string {
  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey && heliusKey !== "your_helius_api_key_here") {
    return `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  }

  const custom = process.env.SOLANA_RPC_URL?.trim();
  if (custom) return custom;

  throw new Error(
    "No RPC configured. Set SOLANA_RPC_URL in .env (e.g. Alchemy mainnet URL)."
  );
}

/** Historical account lookups — requires a Rewind-style endpoint (slot param). */
export function getRewindRpcUrl(): string {
  const custom = process.env.SOLANA_REWIND_RPC_URL?.trim();
  if (custom) return custom;
  return DEFAULT_REWIND_RPC;
}
