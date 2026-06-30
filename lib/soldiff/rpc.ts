import { createHash } from "crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  PROGRAM_DATA_HEADER_SIZE,
} from "./constants";
import { getRpcUrl, getRewindRpcUrl } from "./config";
import { archiveUnavailableMessage, getArchiveCoverage } from "./archive";
import { getRpcPool } from "./rpc-pool";
import {
  BPF_ACCOUNT_TAG,
  programAccountTypeError,
} from "./rpc-errors";
import { rpcGetAccountInfo } from "./rpc-executor";

export interface FetchedBytecode {
  /** Slot the caller asked for (slot mode) or resolved rewind slot. */
  requestedSlot: number;
  /** Slot of the account version returned (from Rewind archive). */
  slot: number;
  programId: string;
  programDataAddress: string;
  elf: Buffer;
  textSection: Buffer;
  rodataSection: Buffer;
  textHash: string;
  sizeBytes: number;
  /** Set when fetched via upgrade-transaction anchor. */
  anchorSignature?: string;
  anchorPosition?: "before" | "after";
}

interface RewindAccountValue {
  data: [string, string];
  rewindSlot?: number;
}

interface RewindAccountResponse {
  result?: {
    context: { slot: number };
    value: RewindAccountValue | null;
  };
  error?: { code: number; message: string };
}

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** Resolve ProgramData PDA from an upgradeable program ID. */
export async function resolveProgramDataAddress(
  _connection: Connection,
  programId: PublicKey
): Promise<PublicKey> {
  const info = await rpcGetAccountInfo(programId);

  if (!info?.data) {
    throw new Error(`Program account not found: ${programId.toBase58()}`);
  }

  if (!info.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) {
    throw new Error(
      `Account ${programId.toBase58()} is not owned by BPF Upgradeable Loader (owner: ${info.owner.toBase58()}). ` +
        `Only upgradeable BPF programs are supported.`
    );
  }

  if (info.data.length < 36) {
    throw new Error(`Account ${programId.toBase58()} data too short to be a program account`);
  }

  const tag = info.data.readUInt32LE(0);
  if (tag !== BPF_ACCOUNT_TAG.PROGRAM) {
    throw new Error(programAccountTypeError(programId.toBase58(), tag));
  }

  return new PublicKey(info.data.subarray(4, 36));
}

/** Build a FetchedBytecode struct from raw ELF bytes (Write-tx reconstruction path). */
export function elfToFetchedBytecode(params: {
  elf: Buffer;
  programId: string;
  programDataAddress: string;
  slot: number;
  requestedSlot?: number;
  anchorSignature?: string;
}): FetchedBytecode {
  const { text, rodata } = parseElfSections(params.elf);
  return {
    requestedSlot: params.requestedSlot ?? params.slot,
    slot: params.slot,
    programId: params.programId,
    programDataAddress: params.programDataAddress,
    elf: params.elf,
    textSection: text,
    rodataSection: rodata,
    textHash: hashBuffer(text),
    sizeBytes: params.elf.length,
    anchorSignature: params.anchorSignature,
  };
}

export async function fetchBytecodeAtSlot(
  programIdStr: string,
  slot: number
): Promise<FetchedBytecode> {
  const connection = new Connection(getRpcUrl(), "confirmed");
  const programId = new PublicKey(programIdStr);
  const programDataAddress = await resolveProgramDataAddress(connection, programId);

  const response = await fetchHistoricalAccount(programDataAddress.toBase58(), {
    type: "slot",
    slot,
  });

  if (!response.value?.data?.[0]) {
    throw new Error(
      `No program data at slot ${slot}. The program may not have been deployed yet.`
    );
  }

  const raw = Buffer.from(response.value.data[0], "base64");
  if (raw.length <= PROGRAM_DATA_HEADER_SIZE) {
    throw new Error("Program data account is empty or too small");
  }

  const elf = raw.subarray(PROGRAM_DATA_HEADER_SIZE);
  const { text, rodata } = parseElfSections(elf);
  const servedSlot = response.value.rewindSlot ?? response.contextSlot;

  return {
    requestedSlot: slot,
    slot: servedSlot,
    programId: programIdStr,
    programDataAddress: programDataAddress.toBase58(),
    elf,
    textSection: text,
    rodataSection: rodata,
    textHash: hashBuffer(text),
    sizeBytes: elf.length,
  };
}

/** Fetch bytecode immediately before/after an upgrade transaction (Rewind anchor API). */
export async function fetchBytecodeAtAnchor(
  programIdStr: string,
  upgradeSignature: string,
  position: "before" | "after",
  upgradeSlot?: number
): Promise<FetchedBytecode> {
  const connection = new Connection(getRpcUrl(), "confirmed");
  const programId = new PublicKey(programIdStr);
  const programDataAddress = await resolveProgramDataAddress(connection, programId);

  const response = await fetchHistoricalAccount(programDataAddress.toBase58(), {
    type: "anchor",
    signature: upgradeSignature,
    position,
    upgradeSlot,
  });

  if (!response.value?.data?.[0]) {
    throw new Error(
      `No program data ${position} upgrade tx ${upgradeSignature.slice(0, 12)}…`
    );
  }

  const raw = Buffer.from(response.value.data[0], "base64");
  if (raw.length <= PROGRAM_DATA_HEADER_SIZE) {
    throw new Error("Program data account is empty or too small");
  }

  const elf = raw.subarray(PROGRAM_DATA_HEADER_SIZE);
  const { text, rodata } = parseElfSections(elf);
  const servedSlot = response.value.rewindSlot ?? response.contextSlot;

  return {
    requestedSlot: servedSlot,
    slot: servedSlot,
    programId: programIdStr,
    programDataAddress: programDataAddress.toBase58(),
    elf,
    textSection: text,
    rodataSection: rodata,
    textHash: hashBuffer(text),
    sizeBytes: elf.length,
    anchorSignature: upgradeSignature,
    anchorPosition: position,
  };
}

type HistoricalQuery =
  | { type: "slot"; slot: number }
  | { type: "anchor"; signature: string; position: "before" | "after"; upgradeSlot?: number };

async function fetchHistoricalAccount(
  pubkey: string,
  query: HistoricalQuery
): Promise<{ contextSlot: number; value: RewindAccountValue | null }> {
  const config =
    query.type === "slot"
      ? { slot: query.slot, encoding: "base64" as const }
      : {
          anchor: { signature: query.signature, position: query.position },
          encoding: "base64" as const,
        };

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [pubkey, config],
  };

  const res = await fetch(getRewindRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as RewindAccountResponse;

  if (json.error) {
    const msg = json.error.message;
    if (json.error.code === -32015 || msg.includes("before archive")) {
      throw new Error(
        `This upgrade is older than the free historical archive (roughly the last few days of mainnet). ` +
          `Use a deep-archive RPC (e.g. Triton One) via SOLANA_REWIND_RPC_URL, or pick a more recent upgrade. ` +
          `Archive error: ${msg}`
      );
    }
    if (json.error.code === -32016 || msg.includes("not indexed")) {
      const coverage = await getArchiveCoverage().catch(() => null);
      const slotHint =
        query.type === "anchor"
          ? query.upgradeSlot
          : query.slot;
      const extra =
        coverage && slotHint !== undefined
          ? " " + archiveUnavailableMessage(slotHint, coverage.earliestSlot)
          : coverage
            ? ` Free archive starts at slot ${coverage.earliestSlot.toLocaleString("en-US")} (~last few days). ` +
              `Older upgrades need SOLANA_REWIND_RPC_URL with a deep-archive provider (e.g. Triton One).`
            : "";
      throw new Error(
        `Upgrade transaction is not in the free Rewind archive.${extra} Detail: ${msg}`
      );
    }
    if (json.error.code === -32014) {
      throw new Error(`Slot is in the future. Wait for the chain to reach that slot.`);
    }
    throw new Error(`Historical RPC error: ${msg}`);
  }

  return {
    contextSlot: json.result?.context.slot ?? (query.type === "slot" ? query.slot : 0),
    value: json.result?.value ?? null,
  };
}

/** Minimal ELF64 parser — extracts .text and .rodata for BPF programs. */
function parseElfSections(elf: Buffer): { text: Buffer; rodata: Buffer } {
  if (elf.length < 64 || elf.toString("ascii", 0, 4) !== "\x7fELF") {
    throw new Error("Invalid ELF: missing magic bytes");
  }

  const is64 = elf[4] === 2;
  if (!is64) throw new Error("Only ELF64 supported");

  const sectionHeaderOffset = Number(elf.readBigUInt64LE(40));
  const sectionHeaderEntrySize = elf.readUInt16LE(58);
  const sectionHeaderCount = elf.readUInt16LE(60);
  const sectionNameStringIndex = elf.readUInt16LE(62);

  if (sectionHeaderOffset === 0 || sectionHeaderCount === 0) {
    return { text: elf, rodata: Buffer.alloc(0) };
  }

  const sections: { name: string; offset: number; size: number }[] = [];

  for (let i = 0; i < sectionHeaderCount; i++) {
    const base = sectionHeaderOffset + i * sectionHeaderEntrySize;
    if (base + 64 > elf.length) break;

    const nameOffset = elf.readUInt32LE(base);
    const offset = Number(elf.readBigUInt64LE(base + 24));
    const size = Number(elf.readBigUInt64LE(base + 32));

    const name = readSectionName(
      elf,
      sectionNameStringIndex,
      sectionHeaderOffset,
      sectionHeaderEntrySize,
      sectionHeaderCount,
      nameOffset
    );
    sections.push({ name, offset, size });
  }

  const textSec = sections.find((s) => s.name === ".text");
  const rodataSec = sections.find((s) => s.name === ".rodata");

  const text =
    textSec && textSec.size > 0
      ? elf.subarray(textSec.offset, textSec.offset + textSec.size)
      : elf;

  const rodata =
    rodataSec && rodataSec.size > 0
      ? elf.subarray(rodataSec.offset, rodataSec.offset + rodataSec.size)
      : Buffer.alloc(0);

  return { text, rodata };
}

function readSectionName(
  elf: Buffer,
  shstrndx: number,
  shoff: number,
  shentsize: number,
  shnum: number,
  nameOffset: number
): string {
  if (shstrndx >= shnum) return "";
  const strBase = shoff + shstrndx * shentsize;
  const strOffset = Number(elf.readBigUInt64LE(strBase + 24));
  let end = strOffset;
  while (end < elf.length && elf[end] !== 0) end++;
  return elf.toString("utf8", strOffset, end);
}

export function createConnection(): Connection {
  return getRpcPool().connection();
}
