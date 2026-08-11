/**
 * SBF instruction decode using the published eBPF/SBF 64-bit instruction format.
 *
 * Choice rationale (see docs/disassembly.md):
 * - No maintained pure-JS Solana disassembler npm package exists for server use.
 * - `sbpf-disassembler` (Rust/WASM) and `llvm-objdump` are preferred when available
 *   via SOLDIFF_DISASSEMBLER / PATH, but are optional external tools.
 * - Fallback decoder implements the standard 8-byte eBPF encoding documented by
 *   Linux BPF / solana_rbpf (opcode classes ALU/ALU64/JMP/LD/ST/STX), not a
 *   custom architecture invention.
 *
 * This is an **instruction-level** decoder, not a semantic decompiler.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type {
  DisassemblyArtifact,
  DisassemblyDiffResult,
  DisassemblyInstruction,
  InstructionDiffEntry,
  NormalizedInstruction,
} from "./types";

const execFileAsync = promisify(execFile);

const BPF_CLASS_LD = 0x00;
const BPF_CLASS_LDX = 0x01;
const BPF_CLASS_ST = 0x02;
const BPF_CLASS_STX = 0x03;
const BPF_CLASS_ALU = 0x04;
const BPF_CLASS_JMP = 0x05;
const BPF_CLASS_JMP32 = 0x06;
const BPF_CLASS_ALU64 = 0x07;

const ALU_OPS: Record<number, string> = {
  0x00: "add",
  0x10: "sub",
  0x20: "mul",
  0x30: "div",
  0x40: "or",
  0x50: "and",
  0x60: "lsh",
  0x70: "rsh",
  0x80: "neg",
  0x90: "mod",
  0xa0: "xor",
  0xb0: "mov",
  0xc0: "arsh",
  0xd0: "end",
};

const JMP_OPS: Record<number, string> = {
  0x00: "ja",
  0x10: "jeq",
  0x20: "jgt",
  0x30: "jge",
  0x40: "jset",
  0x50: "jne",
  0x60: "jsgt",
  0x70: "jsge",
  0x80: "call",
  0x90: "exit",
  0xa0: "jlt",
  0xb0: "jle",
  0xc0: "jslt",
  0xd0: "jsle",
};

const SIZE_NAMES: Record<number, string> = {
  0x00: "w",
  0x08: "h",
  0x10: "b",
  0x18: "dw",
};

export function decodeSbfInstructions(text: Buffer): DisassemblyInstruction[] {
  const out: DisassemblyInstruction[] = [];
  let offset = 0;
  while (offset + 8 <= text.length) {
    const opcode = text[offset];
    const regs = text[offset + 1];
    const dst = regs & 0xf;
    const src = (regs >> 4) & 0xf;
    const off = text.readInt16LE(offset + 2);
    const imm = text.readInt32LE(offset + 4);
    const cls = opcode & 0x07;
    const raw = text.subarray(offset, offset + 8).toString("hex");

    let name = `op_${opcode.toString(16)}`;
    const operands: string[] = [];
    let size = 8;

    if (cls === BPF_CLASS_ALU || cls === BPF_CLASS_ALU64) {
      const op = opcode & 0xf0;
      const srcImm = (opcode & 0x08) === 0;
      const base = ALU_OPS[op] ?? `alu_${op.toString(16)}`;
      name = cls === BPF_CLASS_ALU64 ? `${base}64` : base;
      if (op === 0x80) {
        operands.push(`r${dst}`);
      } else if (srcImm) {
        operands.push(`r${dst}`, `${imm}`);
      } else {
        operands.push(`r${dst}`, `r${src}`);
      }
    } else if (cls === BPF_CLASS_JMP || cls === BPF_CLASS_JMP32) {
      const op = opcode & 0xf0;
      const srcImm = (opcode & 0x08) === 0;
      const base = JMP_OPS[op] ?? `jmp_${op.toString(16)}`;
      name = cls === BPF_CLASS_JMP32 ? `${base}32` : base;
      if (op === 0x90) {
        // exit
      } else if (op === 0x80) {
        operands.push(`${imm}`);
      } else if (op === 0x00) {
        operands.push(`+${off}`);
      } else if (srcImm) {
        operands.push(`r${dst}`, `${imm}`, `+${off}`);
      } else {
        operands.push(`r${dst}`, `r${src}`, `+${off}`);
      }
    } else if (cls === BPF_CLASS_LD || cls === BPF_CLASS_LDX) {
      const sizeBits = opcode & 0x18;
      const mode = opcode & 0xe0;
      const sz = SIZE_NAMES[sizeBits] ?? "x";
      if (mode === 0x00 && cls === BPF_CLASS_LD && sizeBits === 0x18) {
        // LDDW — 16-byte
        name = "lddw";
        let hi = 0;
        if (offset + 16 <= text.length) {
          hi = text.readUInt32LE(offset + 12);
          size = 16;
        }
        const imm64 = (BigInt(hi) << BigInt(32)) | BigInt(imm >>> 0);
        operands.push(`r${dst}`, `0x${imm64.toString(16)}`);
      } else if (cls === BPF_CLASS_LDX) {
        name = `ldx${sz}`;
        operands.push(`r${dst}`, `[r${src}+${off}]`);
      } else {
        name = `ld${sz}`;
        operands.push(`r${dst}`, `${imm}`);
      }
    } else if (cls === BPF_CLASS_ST || cls === BPF_CLASS_STX) {
      const sizeBits = opcode & 0x18;
      const sz = SIZE_NAMES[sizeBits] ?? "x";
      if (cls === BPF_CLASS_STX) {
        name = `stx${sz}`;
        operands.push(`[r${dst}+${off}]`, `r${src}`);
      } else {
        name = `st${sz}`;
        operands.push(`[r${dst}+${off}]`, `${imm}`);
      }
    }

    out.push({
      offset,
      opcode: name,
      operands,
      raw,
      class: className(cls),
    });
    offset += size;
  }

  if (offset < text.length) {
    // trailing partial instruction ignored; caller may warn
  }

  return out;
}

function className(cls: number): string {
  switch (cls) {
    case BPF_CLASS_LD:
      return "ld";
    case BPF_CLASS_LDX:
      return "ldx";
    case BPF_CLASS_ST:
      return "st";
    case BPF_CLASS_STX:
      return "stx";
    case BPF_CLASS_ALU:
      return "alu";
    case BPF_CLASS_JMP:
      return "jmp";
    case BPF_CLASS_JMP32:
      return "jmp32";
    case BPF_CLASS_ALU64:
      return "alu64";
    default:
      return "unknown";
  }
}

/**
 * Normalization rules (deterministic; see docs/disassembly.md):
 * 1. Keep byte offset, opcode mnemonic, operand list.
 * 2. Drop raw hex (unstable for presentation only).
 * 3. Normalize whitespace; operands already structured.
 * 4. Do not relocate offsets or invent symbols.
 */
export function normalizeInstructions(
  instructions: DisassemblyInstruction[]
): NormalizedInstruction[] {
  return instructions.map((ix) => ({
    offset: ix.offset,
    opcode: ix.opcode.toLowerCase(),
    operands: ix.operands.map((o) => o.trim()),
  }));
}

export function disassembleTextSection(text: Buffer): DisassemblyArtifact {
  const instructions = decodeSbfInstructions(text);
  const warnings: string[] = [];
  if (text.length % 8 !== 0) {
    warnings.push(`.text length ${text.length} is not a multiple of 8`);
  }
  if (instructions.length === 0 && text.length > 0) {
    warnings.push("No instructions decoded from .text");
  }

  return {
    tool: "soldiff-ebpf-isa",
    toolVersion: "1.0.0-isa-table",
    instructions,
    warnings,
    normalized: normalizeInstructions(instructions),
  };
}

/** Optional external tool: SOLDIFF_DISASSEMBLER=sbpf|llvm-objdump */
export async function disassembleWithExternalTool(
  elf: Buffer
): Promise<DisassemblyArtifact | null> {
  const tool = process.env.SOLDIFF_DISASSEMBLER?.trim();
  if (!tool) return null;

  const dir = await mkdtemp(join(tmpdir(), "soldiff-disasm-"));
  const elfPath = join(dir, "program.so");
  try {
    await writeFile(elfPath, elf);
    if (tool === "sbpf" || tool.endsWith("sbpf")) {
      const { stdout } = await execFileAsync(tool === "sbpf" ? "sbpf" : tool, [
        "disassemble",
        elfPath,
      ]);
      return parseExternalListing(stdout, tool, "sbpf");
    }
    if (tool === "llvm-objdump" || tool.includes("objdump")) {
      const bin = tool === "llvm-objdump" ? "llvm-objdump" : tool;
      const { stdout } = await execFileAsync(bin, ["-d", "--no-show-raw-insn", elfPath]);
      return parseExternalListing(stdout, bin, "llvm-objdump");
    }
  } catch {
    return null;
  } finally {
    await unlink(elfPath).catch(() => undefined);
  }
  return null;
}

function parseExternalListing(
  text: string,
  tool: string,
  kind: string
): DisassemblyArtifact {
  const instructions: DisassemblyInstruction[] = [];
  const warnings = [
    `Parsed external ${kind} listing; operand fidelity depends on tool output format`,
  ];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([0-9a-fA-F]+):\s+(\S+)\s*(.*)$/);
    if (!m) continue;
    const offset = parseInt(m[1], 16);
    const opcode = m[2];
    const operands = m[3]
      ? m[3].split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    instructions.push({
      offset,
      opcode,
      operands,
      raw: "",
    });
  }
  return {
    tool,
    toolVersion: kind,
    instructions,
    warnings,
    normalized: normalizeInstructions(instructions),
  };
}

export async function disassembleArtifact(
  text: Buffer,
  elf?: Buffer
): Promise<DisassemblyArtifact> {
  if (elf) {
    const external = await disassembleWithExternalTool(elf);
    if (external && external.instructions.length > 0) return external;
  }
  return disassembleTextSection(text);
}

/**
 * Offset-aligned instruction diff. Insertions shift subsequent offsets;
 * we match by offset identity first, then report replacements at shared offsets.
 */
export function diffNormalizedInstructions(
  a: NormalizedInstruction[],
  b: NormalizedInstruction[]
): DisassemblyDiffResult {
  const mapA = new Map(a.map((ix) => [ix.offset, ix]));
  const mapB = new Map(b.map((ix) => [ix.offset, ix]));
  const offsets = [...new Set([...mapA.keys(), ...mapB.keys()])].sort((x, y) => x - y);

  const entries: InstructionDiffEntry[] = [];
  let added = 0;
  let removed = 0;
  let replaced = 0;
  let unchanged = 0;

  for (const off of offsets) {
    const left = mapA.get(off);
    const right = mapB.get(off);
    if (left && right) {
      const same =
        left.opcode === right.opcode &&
        left.operands.length === right.operands.length &&
        left.operands.every((o, i) => o === right.operands[i]);
      if (same) {
        unchanged++;
        entries.push({ kind: "unchanged", offsetA: off, offsetB: off, before: left, after: right });
      } else {
        replaced++;
        entries.push({ kind: "replaced", offsetA: off, offsetB: off, before: left, after: right });
      }
    } else if (right) {
      added++;
      entries.push({ kind: "added", offsetB: off, after: right });
    } else if (left) {
      removed++;
      entries.push({ kind: "removed", offsetA: off, before: left });
    }
  }

  // Heuristic: contiguous replaced/added/removed runs count as function-region changes
  let functionRegionsChanged = 0;
  let inRun = false;
  for (const e of entries) {
    if (e.kind !== "unchanged") {
      if (!inRun) {
        functionRegionsChanged++;
        inRun = true;
      }
    } else {
      inRun = false;
    }
  }

  return {
    analyzer: "sbf-instruction",
    available: true,
    added,
    removed,
    replaced,
    unchanged,
    entries: entries.filter((e) => e.kind !== "unchanged").slice(0, 500),
    functionRegionsChanged,
  };
}
