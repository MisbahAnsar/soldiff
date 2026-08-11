/**
 * ELF64 validation and section extraction for Solana SBF programs.
 * Does not accept an artifact merely because it contains ELF magic.
 */

export type ElfSection = {
  name: string;
  type: number;
  flags: bigint;
  addr: number;
  offset: number;
  size: number;
};

export type ElfValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  sections: ElfSection[];
  text?: ElfSection;
  rodata?: ElfSection;
};

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const EI_CLASS_64 = 2;
const EI_DATA_LE = 1;
const ET_REL = 1;
const ET_DYN = 3;
const ET_EXEC = 2;
const EM_BPF = 247;
const EM_SBPF = 263; // some toolchains
const SHT_NULL = 0;

export function validateElf(elf: Buffer): ElfValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections: ElfSection[] = [];

  if (elf.length < 64) {
    return { ok: false, errors: ["ELF too short for ELF64 header"], warnings, sections };
  }

  if (!elf.subarray(0, 4).equals(ELF_MAGIC)) {
    return { ok: false, errors: ["Missing ELF magic (0x7fELF)"], warnings, sections };
  }

  if (elf[4] !== EI_CLASS_64) {
    errors.push(`Expected 64-bit ELF (EI_CLASS=2), got ${elf[4]}`);
  }
  if (elf[5] !== EI_DATA_LE) {
    errors.push(`Expected little-endian ELF (EI_DATA=1), got ${elf[5]}`);
  }

  const eType = elf.readUInt16LE(16);
  const eMachine = elf.readUInt16LE(18);
  if (eType !== ET_DYN && eType !== ET_EXEC && eType !== ET_REL) {
    warnings.push(`Unusual e_type=${eType} (expected ET_DYN/ET_EXEC/ET_REL)`);
  }
  if (eMachine !== EM_BPF && eMachine !== EM_SBPF && eMachine !== 0) {
    warnings.push(`Unusual e_machine=${eMachine} (expected BPF/SBPF)`);
  }

  const phoff = Number(elf.readBigUInt64LE(32));
  const shoff = Number(elf.readBigUInt64LE(40));
  const ehsize = elf.readUInt16LE(52);
  const phentsize = elf.readUInt16LE(54);
  const phnum = elf.readUInt16LE(56);
  const shentsize = elf.readUInt16LE(58);
  const shnum = elf.readUInt16LE(60);
  const shstrndx = elf.readUInt16LE(62);

  if (ehsize < 64) {
    errors.push(`Invalid e_ehsize=${ehsize}`);
  }

  if (phnum > 0) {
    if (phentsize < 56) {
      errors.push(`Invalid program header entry size ${phentsize}`);
    }
    const phEnd = phoff + phnum * phentsize;
    if (phoff < 0 || phEnd > elf.length) {
      errors.push("Program header table exceeds file bounds");
    } else {
      for (let i = 0; i < phnum; i++) {
        const base = phoff + i * phentsize;
        const pOffset = Number(elf.readBigUInt64LE(base + 8));
        const pFilesz = Number(elf.readBigUInt64LE(base + 32));
        if (pOffset < 0 || pFilesz < 0 || pOffset + pFilesz > elf.length) {
          errors.push(`Program header ${i} filesz/offset out of bounds`);
        }
      }
    }
  }

  if (shoff === 0 || shnum === 0) {
    warnings.push("No section header table — .text/.rodata extraction will fall back to whole file");
    return { ok: errors.length === 0, errors, warnings, sections };
  }

  if (shentsize < 64) {
    errors.push(`Invalid section header entry size ${shentsize}`);
  }

  const shEnd = shoff + shnum * shentsize;
  if (shoff < 0 || shoff >= elf.length) {
    errors.push("Section header table offset out of bounds");
    return { ok: false, errors, warnings, sections };
  }

  // Real Solana SBF uploads occasionally end a few bytes short of the full
  // section-header table while loadable section *contents* remain intact.
  // Require at least offset/size fields (40 bytes) per header; warn on truncation.
  if (shEnd > elf.length) {
    warnings.push(
      `Section header table exceeds file bounds by ${shEnd - elf.length} byte(s); ` +
        `parsing headers with available bytes`
    );
  }

  if (shstrndx >= shnum) {
    errors.push(`Invalid e_shstrndx=${shstrndx}`);
  }

  for (let i = 0; i < shnum; i++) {
    const base = shoff + i * shentsize;
    // Need through sh_size (byte 39) to validate section contents.
    if (base + 40 > elf.length) {
      warnings.push(`Section header ${i} truncated; stopping parse`);
      break;
    }

    const nameOffset = elf.readUInt32LE(base);
    const type = elf.readUInt32LE(base + 4);
    const flags =
      base + 16 <= elf.length ? elf.readBigUInt64LE(base + 8) : BigInt(0);
    const addr =
      base + 24 <= elf.length ? Number(elf.readBigUInt64LE(base + 16)) : 0;
    const offset = Number(elf.readBigUInt64LE(base + 24));
    const size = Number(elf.readBigUInt64LE(base + 32));

    if (type !== SHT_NULL && size > 0) {
      if (offset < 0 || size < 0 || offset + size > elf.length) {
        errors.push(`Section ${i} offset/size out of bounds (off=${offset} size=${size})`);
      }
    }

    const name =
      shstrndx < shnum && shoff + shstrndx * shentsize + 40 <= elf.length
        ? readSectionName(elf, shstrndx, shoff, shentsize, nameOffset)
        : "";

    sections.push({ name, type, flags, addr, offset, size });
  }

  const text = sections.find((s) => s.name === ".text");
  const rodata = sections.find((s) => s.name === ".rodata");

  if (text) {
    if (text.size === 0) warnings.push(".text section has zero size");
    if (text.offset + text.size > elf.length) {
      errors.push(".text section exceeds file bounds");
    }
  } else {
    warnings.push("No .text section found");
  }

  if (rodata) {
    if (rodata.offset + rodata.size > elf.length) {
      errors.push(".rodata section exceeds file bounds");
    }
  }

  // Solana SBF programs are typically ET_DYN with a non-trivial .text
  if (text && text.size > 0 && text.size < 8) {
    warnings.push(".text shorter than one SBF instruction (8 bytes)");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sections,
    text,
    rodata,
  };
}

export function parseElfSections(elf: Buffer): {
  text: Buffer;
  rodata: Buffer;
  validation: ElfValidationResult;
} {
  const validation = validateElf(elf);
  if (!validation.ok) {
    throw new Error(`Invalid ELF: ${validation.errors.join("; ")}`);
  }

  const textSec = validation.text;
  const rodataSec = validation.rodata;

  const text =
    textSec && textSec.size > 0
      ? elf.subarray(textSec.offset, textSec.offset + textSec.size)
      : elf;

  const rodata =
    rodataSec && rodataSec.size > 0
      ? elf.subarray(rodataSec.offset, rodataSec.offset + rodataSec.size)
      : Buffer.alloc(0);

  return { text, rodata, validation };
}

function readSectionName(
  elf: Buffer,
  shstrndx: number,
  shoff: number,
  shentsize: number,
  nameOffset: number
): string {
  const strBase = shoff + shstrndx * shentsize;
  if (strBase + 40 > elf.length) return "";
  const strOffset = Number(elf.readBigUInt64LE(strBase + 24));
  const start = strOffset + nameOffset;
  if (start < 0 || start >= elf.length) return "";
  let end = start;
  while (end < elf.length && elf[end] !== 0) end++;
  return elf.toString("utf8", start, end);
}
