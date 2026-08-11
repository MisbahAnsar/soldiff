/**
 * Build a minimal little-endian ELF64 with .text and .rodata for fixtures/tests.
 * Not a full linker — just enough to pass validateElf() and section extraction.
 */

export function buildMinimalElf(opts?: {
  text?: Buffer;
  rodata?: Buffer;
  machine?: number;
}): Buffer {
  const text = opts?.text ?? Buffer.from([0xb7, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x95, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const rodata = opts?.rodata ?? Buffer.from("soldiff\0", "utf8");
  const machine = opts?.machine ?? 247; // EM_BPF

  // Layout:
  // [0, 64) ELF header
  // [64, 64+text) .text
  // then .rodata
  // then section headers (4 entries: null, .text, .rodata, .shstrtab)
  // then .shstrtab

  const shstrtab = Buffer.from("\0.text\0.rodata\0.shstrtab\0", "utf8");
  const textOffset = 64;
  const rodataOffset = textOffset + text.length;
  const shstrtabOffset = rodataOffset + rodata.length;
  const shoff = shstrtabOffset + shstrtab.length;
  const shentsize = 64;
  const shnum = 4;
  const total = shoff + shnum * shentsize;

  const elf = Buffer.alloc(total);
  // e_ident
  elf[0] = 0x7f;
  elf[1] = 0x45;
  elf[2] = 0x4c;
  elf[3] = 0x46;
  elf[4] = 2; // ELFCLASS64
  elf[5] = 1; // ELFDATA2LSB
  elf[6] = 1; // EV_CURRENT
  elf.writeUInt16LE(3, 16); // ET_DYN
  elf.writeUInt16LE(machine, 18);
  elf.writeUInt32LE(1, 20); // EV_CURRENT
  elf.writeBigUInt64LE(BigInt(0), 24); // e_entry
  elf.writeBigUInt64LE(BigInt(0), 32); // e_phoff
  elf.writeBigUInt64LE(BigInt(shoff), 40);
  elf.writeUInt32LE(0, 48); // e_flags
  elf.writeUInt16LE(64, 52); // e_ehsize
  elf.writeUInt16LE(0, 54); // e_phentsize
  elf.writeUInt16LE(0, 56); // e_phnum
  elf.writeUInt16LE(shentsize, 58);
  elf.writeUInt16LE(shnum, 60);
  elf.writeUInt16LE(3, 62); // e_shstrndx = .shstrtab

  text.copy(elf, textOffset);
  rodata.copy(elf, rodataOffset);
  shstrtab.copy(elf, shstrtabOffset);

  writeSectionHeader(elf, shoff + 0 * shentsize, {
    nameOffset: 0,
    type: 0,
    flags: BigInt(0),
    addr: 0,
    offset: 0,
    size: 0,
  });
  writeSectionHeader(elf, shoff + 1 * shentsize, {
    nameOffset: 1, // .text
    type: 1, // SHT_PROGBITS
    flags: BigInt(6), // SHF_ALLOC|SHF_EXECINSTR
    addr: 0,
    offset: textOffset,
    size: text.length,
  });
  writeSectionHeader(elf, shoff + 2 * shentsize, {
    nameOffset: 7, // .rodata
    type: 1,
    flags: BigInt(2), // SHF_ALLOC
    addr: 0,
    offset: rodataOffset,
    size: rodata.length,
  });
  writeSectionHeader(elf, shoff + 3 * shentsize, {
    nameOffset: 15, // .shstrtab
    type: 3, // SHT_STRTAB
    flags: BigInt(0),
    addr: 0,
    offset: shstrtabOffset,
    size: shstrtab.length,
  });

  return elf;
}

function writeSectionHeader(
  elf: Buffer,
  base: number,
  s: {
    nameOffset: number;
    type: number;
    flags: bigint;
    addr: number;
    offset: number;
    size: number;
  }
): void {
  elf.writeUInt32LE(s.nameOffset, base);
  elf.writeUInt32LE(s.type, base + 4);
  elf.writeBigUInt64LE(s.flags, base + 8);
  elf.writeBigUInt64LE(BigInt(s.addr), base + 16);
  elf.writeBigUInt64LE(BigInt(s.offset), base + 24);
  elf.writeBigUInt64LE(BigInt(s.size), base + 32);
  elf.writeUInt32LE(0, base + 40); // sh_link
  elf.writeUInt32LE(0, base + 44); // sh_info
  elf.writeBigUInt64LE(BigInt(1), base + 48); // sh_addralign
  elf.writeBigUInt64LE(BigInt(0), base + 56); // sh_entsize
}
