import bs58 from "bs58";

function decodeBase58(str: string): Buffer {
  const mod = bs58 as unknown as {
    decode?: (input: string) => Uint8Array;
    default?: { decode: (input: string) => Uint8Array };
  };
  if (typeof mod.decode === "function") {
    return Buffer.from(mod.decode(str));
  }
  if (mod.default?.decode) {
    return Buffer.from(mod.default.decode(str));
  }
  throw new Error("bs58 decode is unavailable");
}

/** Normalize instruction data from getTransaction (base58 string or bytes). */
export function instructionDataToBuffer(data: string | Uint8Array | Buffer): Buffer {
  if (typeof data === "string") {
    return decodeBase58(data);
  }
  return Buffer.from(data);
}
