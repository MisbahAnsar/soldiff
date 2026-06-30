/** Format low-level fetch / RPC errors for API responses. */
export function formatRpcError(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? err.cause.message : String(err.cause ?? "");
    const base = err.message;
    if (cause && !base.includes(cause)) {
      return `${base} (${cause})`;
    }
    return base;
  }
  return String(err);
}

export async function withRpcRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw new Error(
    `${label}: ${formatRpcError(lastErr)}. ` +
      `Check SOLANA_RPC_URL in .env and your network connection.`
  );
}

/** BPF Upgradeable Loader account type tags. */
export const BPF_ACCOUNT_TAG = {
  UNINITIALIZED: 0,
  BUFFER: 1,
  PROGRAM: 2,
  PROGRAM_DATA: 3,
} as const;

export function programAccountTypeError(pubkey: string, tag: number): string {
  if (tag === BPF_ACCOUNT_TAG.PROGRAM_DATA) {
    return (
      `"${pubkey}" is a ProgramData account (type tag 3), not a Program ID. ` +
      `On Solscan, copy the address from the Program tab — not the ProgramData account. ` +
      `ProgramData holds bytecode metadata; the Program account is what you invoke.`
    );
  }
  if (tag === BPF_ACCOUNT_TAG.BUFFER) {
    return `"${pubkey}" is a buffer account (type tag 1), not a Program ID.`;
  }
  return `Unexpected BPF account type tag ${tag} for "${pubkey}" (expected tag 2 = Program).`;
}
