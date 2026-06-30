const DEFAULT_REWIND_RPC =
  "https://public.rpc.solanavibestation.com/rewind";

export function getRpcUrl(): string {
  return getRpcUrls()[0];
}

export function getRpcUrls(): string[] {
  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey && heliusKey !== "your_helius_api_key_here") {
    return [`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`];
  }

  const urls = [process.env.SOLANA_RPC_URL, process.env.SOLANA_RPC_URL_2]
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u));

  if (urls.length === 0) {
    throw new Error(
      "No RPC configured. Set SOLANA_RPC_URL in .env (e.g. Alchemy mainnet URL)."
    );
  }

  return urls;
}

/** Historical account lookups — requires a Rewind-style endpoint (slot param). */
export function getRewindRpcUrl(): string {
  const custom = process.env.SOLANA_REWIND_RPC_URL?.trim();
  if (custom) return custom;
  return DEFAULT_REWIND_RPC;
}
