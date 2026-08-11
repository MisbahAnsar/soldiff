#!/usr/bin/env python3
"""
Independent ELF structural check via pyelftools.

Not a verified-build claim. If the on-chain artifact truncates the trailing
section-header table by a few bytes (common for Solana SBF uploads), we pad a
temporary copy with zeros solely so pyelftools can parse headers — the original
bytes used for hashing are unchanged.
"""
import sys
import tempfile
import os

try:
    from elftools.elf.elffile import ELFFile
except Exception as e:
    print("UNAVAILABLE:" + str(e))
    sys.exit(2)


def main() -> int:
    path = sys.argv[1]
    data = open(path, "rb").read()
    if len(data) < 64 or data[:4] != b"\x7fELF":
        print("ERROR:not_elf")
        return 1

    # ELF64 little-endian header fields
    shoff = int.from_bytes(data[40:48], "little")
    shentsize = int.from_bytes(data[58:60], "little")
    shnum = int.from_bytes(data[60:62], "little")
    sh_end = shoff + shnum * shentsize
    padded = False
    parse_bytes = data
    if sh_end > len(data):
        pad = sh_end - len(data)
        parse_bytes = data + (b"\x00" * pad)
        padded = True
        print(f"PADDED_FOR_SHDR:{pad}")

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(parse_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            elf = ELFFile(f)
            print("CLASS:" + str(elf.elfclass))
            print("ENTRIES:" + str(elf.num_sections()))
            names = []
            text_ok = False
            rodata_ok = False
            for s in elf.iter_sections():
                names.append(s.name)
                off = int(s["sh_offset"])
                size = int(s["sh_size"])
                # Bounds check against ORIGINAL file length (not padded)
                in_bounds = size == 0 or (off >= 0 and off + size <= len(data))
                print(
                    "SECTION:"
                    + s.name
                    + ":"
                    + str(off)
                    + ":"
                    + str(size)
                    + ":inbounds="
                    + str(in_bounds)
                )
                if s.name == ".text" and size > 0 and in_bounds:
                    text_ok = True
                if s.name == ".rodata" and size > 0 and in_bounds:
                    rodata_ok = True
            print("HAS_TEXT:" + str(text_ok))
            print("HAS_RODATA:" + str(rodata_ok))
            print("ORIGINAL_FILE_LEN:" + str(len(data)))
            print("PADDED:" + str(padded))
            print("OK:" + str(elf.elfclass == 64 and text_ok))
    finally:
        os.unlink(tmp_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
