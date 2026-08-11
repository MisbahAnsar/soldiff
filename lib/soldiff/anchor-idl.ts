/**
 * Anchor IDL acquisition, normalization, and diff.
 *
 * IDL address (canonical Anchor):
 *   base = findProgramAddressSync([], programId)
 *   idl  = createWithSeed(base, "anchor:idl", programId)
 *
 * On-chain account layout (legacy IdlAccount):
 *   8-byte discriminator + 32-byte authority + 4-byte len + zlib(JSON)
 *
 * Historical versions: never reuse the current IDL for Version A unless
 * it was fetched at a proven historical slot/anchor. Otherwise status=unavailable.
 */

import { createHash } from "crypto";
import { inflateSync } from "zlib";
import { PublicKey } from "@solana/web3.js";
import { rpcGetAccountInfo } from "./rpc-executor";
import type {
  Availability,
  Finding,
  IdlDiffResult,
  NormalizedIdl,
  NormalizedIdlAccount,
  NormalizedIdlInstruction,
  ProgramFramework,
} from "./types";

const ANCHOR_IDL_SEED = "anchor:idl";

/** Well-known Anchor "idl" account discriminator prefix often present in account data. */
const ANCHOR_DISCRIMINATOR_HINT = Buffer.from("anchor:", "utf8");

/** Sync equivalent of PublicKey.createWithSeed: sha256(base || seed || owner). */
function createWithSeedSync(base: PublicKey, seed: string, owner: PublicKey): PublicKey {
  if (seed.length > 32) {
    throw new Error("Seed exceeds 32 bytes");
  }
  const hash = createHash("sha256")
    .update(base.toBytes())
    .update(Buffer.from(seed, "utf8"))
    .update(owner.toBytes())
    .digest();
  return new PublicKey(hash);
}

export function deriveAnchorIdlAddress(programId: PublicKey): PublicKey {
  const [base] = PublicKey.findProgramAddressSync([], programId);
  return createWithSeedSync(base, ANCHOR_IDL_SEED, programId);
}

export type IdlFetchResult = {
  status: Availability;
  address?: string;
  source?: string;
  rawJson?: unknown;
  normalized?: NormalizedIdl;
  reason?: string;
};

export function detectProgramFramework(params: {
  idl?: IdlFetchResult | null;
  textSection?: Buffer;
  rodataSection?: Buffer;
}): ProgramFramework {
  if (params.idl?.status === "available" && params.idl.normalized) {
    return "anchor";
  }

  // Discriminator alone is insufficient — require multiple Anchor markers.
  const ro = params.rodataSection ?? Buffer.alloc(0);
  const text = params.textSection ?? Buffer.alloc(0);
  const hay = Buffer.concat([ro, text.subarray(0, Math.min(text.length, 4096))]);

  const hasAnchorStr = hay.includes(ANCHOR_DISCRIMINATOR_HINT);
  const hasErrorPrefix =
    hay.includes(Buffer.from("InstructionFallbackNotFound", "utf8")) ||
    hay.includes(Buffer.from("InstructionDidNotDeserialize", "utf8")) ||
    hay.includes(Buffer.from("ConstraintMut", "utf8"));

  if (hasAnchorStr && hasErrorPrefix) return "anchor";
  if (hasAnchorStr || hasErrorPrefix) return "unknown";
  return "non-anchor";
}

/** Decode on-chain IDL account bytes to JSON. */
export function decodeIdlAccountData(data: Buffer): unknown {
  if (data.length < 44) {
    throw new Error("IDL account too short");
  }
  // Skip 8-byte disc + 32-byte authority
  const len = data.readUInt32LE(40);
  const compressed = data.subarray(44, 44 + len);
  if (compressed.length < len) {
    throw new Error("IDL account length field exceeds data");
  }
  const jsonBytes = inflateSync(compressed);
  return JSON.parse(jsonBytes.toString("utf8"));
}

export function normalizeIdl(raw: unknown): NormalizedIdl {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const metadata = (obj.metadata as Record<string, unknown> | undefined) ?? undefined;

  const instructionsRaw = (obj.instructions as unknown[]) ?? [];
  const instructions: NormalizedIdlInstruction[] = instructionsRaw.map((ix) => {
    const i = ix as Record<string, unknown>;
    return {
      name: String(i.name ?? ""),
      discriminator: Array.isArray(i.discriminator)
        ? (i.discriminator as number[])
        : undefined,
      docs: Array.isArray(i.docs) ? (i.docs as string[]) : undefined,
      args: Array.isArray(i.args)
        ? (i.args as Array<{ name: string; type: unknown }>).map((a) => ({
            name: String(a.name ?? ""),
            type: a.type,
          }))
        : [],
      accounts: normalizeAccounts((i.accounts as unknown[]) ?? []),
    };
  });

  const accounts = Array.isArray(obj.accounts)
    ? (obj.accounts as Array<Record<string, unknown>>).map((a) => ({
        name: String(a.name ?? ""),
        type: a.type,
        discriminator: Array.isArray(a.discriminator)
          ? (a.discriminator as number[])
          : undefined,
      }))
    : [];

  const types = Array.isArray(obj.types)
    ? (obj.types as Array<Record<string, unknown>>).map((t) => ({
        name: String(t.name ?? ""),
        type: t.type,
      }))
    : [];

  const errors = Array.isArray(obj.errors)
    ? (obj.errors as Array<Record<string, unknown>>).map((e) => ({
        code: Number(e.code ?? 0),
        name: String(e.name ?? ""),
        msg: e.msg !== undefined ? String(e.msg) : undefined,
      }))
    : [];

  const events = Array.isArray(obj.events)
    ? (obj.events as Array<Record<string, unknown>>).map((e) => ({
        name: String(e.name ?? ""),
        discriminator: Array.isArray(e.discriminator)
          ? (e.discriminator as number[])
          : undefined,
        fields: e.fields,
      }))
    : [];

  return {
    address: typeof obj.address === "string" ? obj.address : undefined,
    name:
      typeof obj.name === "string"
        ? obj.name
        : typeof metadata?.name === "string"
          ? (metadata.name as string)
          : undefined,
    version:
      typeof obj.version === "string"
        ? obj.version
        : typeof metadata?.version === "string"
          ? (metadata.version as string)
          : undefined,
    metadata,
    instructions,
    accounts,
    types,
    errors,
    events,
  };
}

function normalizeAccounts(items: unknown[]): NormalizedIdlAccount[] {
  const out: NormalizedIdlAccount[] = [];
  for (const item of items) {
    const a = item as Record<string, unknown>;
    if (Array.isArray(a.accounts)) {
      // Nested account group — flatten with prefix
      const nested = normalizeAccounts(a.accounts);
      for (const n of nested) {
        out.push({
          ...n,
          name: a.name ? `${String(a.name)}.${n.name}` : n.name,
        });
      }
      continue;
    }
    out.push({
      name: String(a.name ?? ""),
      isMut: Boolean(a.writable ?? a.isMut),
      isSigner: Boolean(a.signer ?? a.isSigner),
      isOptional: a.optional !== undefined ? Boolean(a.optional) : undefined,
      address: typeof a.address === "string" ? a.address : undefined,
      docs: Array.isArray(a.docs) ? (a.docs as string[]) : undefined,
      pda: a.pda,
      relations: a.relations,
    });
  }
  return out;
}

/** Fetch the *current* on-chain IDL. Not valid as historical Version A by itself. */
export async function fetchCurrentAnchorIdl(
  programIdStr: string
): Promise<IdlFetchResult> {
  try {
    const programId = new PublicKey(programIdStr);
    const address = deriveAnchorIdlAddress(programId);
    const info = await rpcGetAccountInfo(address);
    if (!info?.data) {
      return {
        status: "unavailable",
        address: address.toBase58(),
        reason: "IDL account not found on-chain",
      };
    }
    const rawJson = decodeIdlAccountData(Buffer.from(info.data));
    return {
      status: "available",
      address: address.toBase58(),
      source: "on-chain-current",
      rawJson,
      normalized: normalizeIdl(rawJson),
    };
  } catch (err) {
    return {
      status: "unavailable",
      reason: err instanceof Error ? err.message : "IDL fetch failed",
    };
  }
}

/**
 * Historical IDL for a version. Without a proven historical fetch, returns unavailable.
 * Slot/rewind integration can be passed in via `historicalJson` when proven.
 */
export function resolveHistoricalIdl(params: {
  historicalJson?: unknown;
  historicalSource?: string;
}): IdlFetchResult {
  if (params.historicalJson === undefined) {
    return {
      status: "unavailable",
      reason:
        "Historical Anchor IDL unavailable — current on-chain IDL must not be used for past versions",
    };
  }
  try {
    return {
      status: "available",
      source: params.historicalSource ?? "historical-proven",
      rawJson: params.historicalJson,
      normalized: normalizeIdl(params.historicalJson),
    };
  } catch (err) {
    return {
      status: "unavailable",
      reason: err instanceof Error ? err.message : "Historical IDL decode failed",
    };
  }
}

export function diffAnchorIdls(
  idlA: IdlFetchResult | null | undefined,
  idlB: IdlFetchResult | null | undefined
): IdlDiffResult {
  if (!idlA || idlA.status !== "available" || !idlA.normalized) {
    return {
      analyzer: "anchor-idl",
      status: "unavailable",
      reason: "historicalIdl: unavailable",
      findings: [
        {
          id: "idl-hist-unavailable",
          analyzer: "anchor-idl",
          code: "HISTORICAL_IDL_UNAVAILABLE",
          severity: "INFO",
          confidence: "high",
          description:
            "Historical Anchor IDL for Version A is unavailable. No IDL unchanged/changed claims are made.",
          evidence: {
            summary: "historicalIdl: unavailable",
            details: { reason: idlA?.reason ?? "not provided" },
          },
          instruction: "idl",
        },
      ],
    };
  }

  if (!idlB || idlB.status !== "available" || !idlB.normalized) {
    return {
      analyzer: "anchor-idl",
      status: "unavailable",
      reason: "versionB IDL unavailable",
      findings: [
        {
          id: "idl-b-unavailable",
          analyzer: "anchor-idl",
          code: "IDL_UNAVAILABLE",
          severity: "INFO",
          confidence: "high",
          description: "Anchor IDL for Version B is unavailable.",
          evidence: { summary: "idlB: unavailable" },
          instruction: "idl",
        },
      ],
    };
  }

  const findings = compareNormalizedIdls(idlA.normalized, idlB.normalized);
  return {
    analyzer: "anchor-idl",
    status: "available",
    findings,
  };
}

export function compareNormalizedIdls(a: NormalizedIdl, b: NormalizedIdl): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const nextId = () => `idl-${++n}`;

  const aIx = new Map(a.instructions.map((i) => [i.name, i]));
  const bIx = new Map(b.instructions.map((i) => [i.name, i]));

  for (const [name, ix] of bIx) {
    if (!aIx.has(name)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_INSTRUCTION_ADDED",
        severity: "MEDIUM",
        confidence: "high",
        description: `Instruction \`${name}\` was added in the IDL.`,
        evidence: {
          summary: `Instruction added: ${name}`,
          after: { name, discriminator: ix.discriminator, args: ix.args },
        },
        instruction: name,
        affectedVersions: ["B"],
      });
    }
  }

  for (const [name, ix] of aIx) {
    if (!bIx.has(name)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_INSTRUCTION_REMOVED",
        severity: "HIGH",
        confidence: "high",
        description: `Instruction \`${name}\` was removed from the IDL.`,
        evidence: {
          summary: `Instruction removed: ${name}`,
          before: { name, discriminator: ix.discriminator, args: ix.args },
        },
        instruction: name,
        affectedVersions: ["A"],
      });
    }
  }

  for (const [name, left] of aIx) {
    const right = bIx.get(name);
    if (!right) continue;

    if (
      left.discriminator &&
      right.discriminator &&
      JSON.stringify(left.discriminator) !== JSON.stringify(right.discriminator)
    ) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_DISCRIMINATOR_CHANGE",
        severity: "HIGH",
        confidence: "high",
        description: `Discriminator changed for instruction \`${name}\`.`,
        evidence: {
          summary: "Discriminator bytes differ",
          before: left.discriminator,
          after: right.discriminator,
        },
        instruction: name,
        before: JSON.stringify(left.discriminator),
        after: JSON.stringify(right.discriminator),
        affectedVersions: ["A", "B"],
      });
    }

    if (JSON.stringify(left.args) !== JSON.stringify(right.args)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_ARGS_CHANGED",
        severity: "MEDIUM",
        confidence: "high",
        description: `Arguments changed for instruction \`${name}\`.`,
        evidence: {
          summary: "Instruction args differ",
          before: left.args,
          after: right.args,
        },
        instruction: name,
        affectedVersions: ["A", "B"],
      });
    }

    const aAcc = left.accounts;
    const bAcc = right.accounts;
    const max = Math.max(aAcc.length, bAcc.length);
    for (let i = 0; i < max; i++) {
      const la = aAcc[i];
      const ra = bAcc[i];
      if (!la && ra) {
        findings.push({
          id: nextId(),
          analyzer: "anchor-idl",
          code: "IDL_ACCOUNT_ADDED",
          severity: "MEDIUM",
          confidence: "high",
          description: `Account \`${ra.name}\` added to \`${name}\` at index ${i}.`,
          evidence: {
            summary: "Account added",
            details: { instruction: name, index: i },
            after: ra,
          },
          instruction: name,
          affectedVersions: ["B"],
        });
        continue;
      }
      if (la && !ra) {
        findings.push({
          id: nextId(),
          analyzer: "anchor-idl",
          code: "IDL_ACCOUNT_REMOVED",
          severity: "HIGH",
          confidence: "high",
          description: `Account \`${la.name}\` removed from \`${name}\` at index ${i}.`,
          evidence: {
            summary: "Account removed",
            details: { instruction: name, index: i },
            before: la,
          },
          instruction: name,
          affectedVersions: ["A"],
        });
        continue;
      }
      if (!la || !ra) continue;

      if (la.name !== ra.name) {
        findings.push({
          id: nextId(),
          analyzer: "anchor-idl",
          code: "IDL_ACCOUNT_ORDER_OR_RENAME",
          severity: "MEDIUM",
          confidence: "medium",
          description: `Account at index ${i} in \`${name}\` changed name \`${la.name}\` → \`${ra.name}\` (rename or reorder).`,
          evidence: {
            summary: "Account name/order change",
            before: la,
            after: ra,
            details: { instruction: name, index: i },
          },
          instruction: name,
          affectedVersions: ["A", "B"],
        });
      }
      if (la.isMut !== ra.isMut) {
        findings.push({
          id: nextId(),
          analyzer: "anchor-idl",
          code: ra.isMut ? "NEW_MUTABLE_ACCOUNT" : "IDL_ACCOUNT_MUTABILITY_REMOVED",
          severity: ra.isMut ? "MEDIUM" : "LOW",
          confidence: "high",
          description: `Account \`${ra.name}\` mutability changed in \`${name}\` (${la.isMut} → ${ra.isMut}).`,
          evidence: {
            summary: "Mutability change",
            before: { name: la.name, isMut: la.isMut },
            after: { name: ra.name, isMut: ra.isMut },
            details: { instruction: name },
          },
          instruction: name,
          before: String(la.isMut),
          after: String(ra.isMut),
          affectedVersions: ["A", "B"],
        });
      }
      if (la.isSigner !== ra.isSigner) {
        findings.push({
          id: nextId(),
          analyzer: "anchor-idl",
          code: ra.isSigner ? "IDL_SIGNER_ADDED" : "IDL_SIGNER_REMOVED",
          severity: ra.isSigner ? "MEDIUM" : "HIGH",
          confidence: "high",
          description: `Account \`${ra.name}\` signer flag changed in \`${name}\` (${la.isSigner} → ${ra.isSigner}).`,
          evidence: {
            summary: "Signer flag change",
            before: { name: la.name, isSigner: la.isSigner },
            after: { name: ra.name, isSigner: ra.isSigner },
            details: { instruction: name },
          },
          instruction: name,
          before: String(la.isSigner),
          after: String(ra.isSigner),
          affectedVersions: ["A", "B"],
        });
      }
      if (JSON.stringify(la.pda) !== JSON.stringify(ra.pda) && (la.pda || ra.pda)) {
        findings.push({
          id: nextId(),
          analyzer: "anchor-idl",
          code: "IDL_PDA_SEEDS_CHANGED",
          severity: "MEDIUM",
          confidence: "medium",
          description: `PDA/seeds metadata changed for \`${ra.name}\` in \`${name}\`.`,
          evidence: {
            summary: "PDA change",
            before: la.pda,
            after: ra.pda,
            details: { instruction: name, account: ra.name },
          },
          instruction: name,
          affectedVersions: ["A", "B"],
        });
      }
      if (la.address !== ra.address && (la.address || ra.address)) {
        findings.push({
          id: nextId(),
          analyzer: "anchor-idl",
          code: "IDL_ACCOUNT_ADDRESS_CHANGED",
          severity: "MEDIUM",
          confidence: "high",
          description: `Fixed address changed for \`${ra.name}\` in \`${name}\`.`,
          evidence: {
            summary: "Address constraint change",
            before: la.address,
            after: ra.address,
          },
          instruction: name,
          affectedVersions: ["A", "B"],
        });
      }
    }
  }

  // Errors / events / types
  const aErr = new Set(a.errors.map((e) => e.name));
  const bErr = new Set(b.errors.map((e) => e.name));
  for (const name of bErr) {
    if (!aErr.has(name)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_ERROR_ADDED",
        severity: "INFO",
        confidence: "high",
        description: `Error \`${name}\` added to IDL.`,
        evidence: { summary: `Error added: ${name}` },
        instruction: "errors",
      });
    }
  }
  for (const name of aErr) {
    if (!bErr.has(name)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_ERROR_REMOVED",
        severity: "LOW",
        confidence: "high",
        description: `Error \`${name}\` removed from IDL.`,
        evidence: { summary: `Error removed: ${name}` },
        instruction: "errors",
      });
    }
  }

  const aEv = new Set(a.events.map((e) => e.name));
  const bEv = new Set(b.events.map((e) => e.name));
  for (const name of bEv) {
    if (!aEv.has(name)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_EVENT_ADDED",
        severity: "INFO",
        confidence: "high",
        description: `Event \`${name}\` added to IDL.`,
        evidence: { summary: `Event added: ${name}` },
        instruction: "events",
      });
    }
  }
  for (const name of aEv) {
    if (!bEv.has(name)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_EVENT_REMOVED",
        severity: "LOW",
        confidence: "high",
        description: `Event \`${name}\` removed from IDL.`,
        evidence: { summary: `Event removed: ${name}` },
        instruction: "events",
      });
    }
  }

  const aTypes = new Map(a.types.map((t) => [t.name, t]));
  for (const t of b.types) {
    const prev = aTypes.get(t.name);
    if (!prev) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_TYPE_ADDED",
        severity: "INFO",
        confidence: "high",
        description: `Type \`${t.name}\` added to IDL.`,
        evidence: { summary: `Type added: ${t.name}`, after: t.type },
        instruction: "types",
      });
    } else if (JSON.stringify(prev.type) !== JSON.stringify(t.type)) {
      findings.push({
        id: nextId(),
        analyzer: "anchor-idl",
        code: "IDL_TYPE_CHANGED",
        severity: "MEDIUM",
        confidence: "high",
        description: `Type \`${t.name}\` definition changed.`,
        evidence: { summary: "Type changed", before: prev.type, after: t.type },
        instruction: "types",
        affectedVersions: ["A", "B"],
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: nextId(),
      analyzer: "anchor-idl",
      code: "IDL_UNCHANGED",
      severity: "INFO",
      confidence: "high",
      description: "Normalized Anchor IDLs are identical for compared versions.",
      evidence: { summary: "No IDL differences" },
      instruction: "idl",
    });
  }

  return findings;
}
