import { createHash } from "crypto";

/** Full SHA-256 hex digest. */
export function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Short prefix used in legacy UI labels (not for identity). */
export function sha256Short(buf: Buffer | Uint8Array, chars = 16): string {
  return sha256Hex(buf).slice(0, chars);
}
