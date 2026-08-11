/**
 * Independent ELF structural checks via external tools when available.
 * Does not claim verified-build status.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

export type ExternalElfValidation = {
  tool: string | null;
  available: boolean;
  ok: boolean | null;
  summary: string;
  details: string[];
};

async function tryReadelf(elfPath: string, bin: string): Promise<ExternalElfValidation | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, ["-h", "-S", elfPath], {
      timeout: 15_000,
      maxBuffer: 2_000_000,
    });
    const text = `${stdout}\n${stderr}`;
    const details = text
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .slice(0, 80);
    const hasClass = /Class:\s*ELF64/i.test(text) || /ELF64/i.test(text);
    const hasText = /\.text\b/.test(text);
    const hasRodata = /\.rodata\b/.test(text);
    const ok = hasClass && hasText;
    return {
      tool: bin,
      available: true,
      ok,
      summary: ok
        ? `External ${bin}: ELF64 header readable; .text ${hasText ? "present" : "missing"}; .rodata ${hasRodata ? "present" : "missing"}`
        : `External ${bin}: incomplete structural read`,
      details,
    };
  } catch {
    return null;
  }
}

async function tryPyelftools(elfPath: string): Promise<ExternalElfValidation | null> {
  const scriptPath = join(process.cwd(), "scripts", "pyelf_check.py");
  try {
    const { stdout } = await execFileAsync("python", [scriptPath, elfPath], {
      timeout: 20_000,
      maxBuffer: 2_000_000,
    });
    if (stdout.startsWith("UNAVAILABLE:")) return null;
    const details = stdout.split(/\r?\n/).filter(Boolean).slice(0, 80);
    const hasText = details.some((l) => l === "HAS_TEXT:True");
    const hasRodata = details.some((l) => l === "HAS_RODATA:True");
    const is64 = details.some((l) => l === "CLASS:64");
    const padded = details.some((l) => l.startsWith("PADDED_FOR_SHDR:"));
    const ok =
      details.some((l) => l === "OK:True") || (is64 && hasText);
    return {
      tool: "pyelftools",
      available: true,
      ok,
      summary: ok
        ? `External pyelftools: ELF64; .text ${hasText ? "present" : "missing"}; .rodata ${hasRodata ? "present" : "missing"}` +
          (padded
            ? "; trailing sh_table EOF truncation confirmed (zero-padded only for header parse)"
            : "")
        : "External pyelftools: incomplete structural read",
      details,
    };
  } catch {
    return null;
  }
}

/** Validate an ELF buffer with llvm-readelf / readelf / pyelftools when installed. */
export async function validateElfExternal(elf: Buffer): Promise<ExternalElfValidation> {
  const dir = await mkdtemp(join(tmpdir(), "soldiff-elf-"));
  const elfPath = join(dir, "program.so");
  await writeFile(elfPath, elf);
  try {
    for (const bin of ["llvm-readelf", "readelf"]) {
      const hit = await tryReadelf(elfPath, bin);
      if (hit) return hit;
    }
    const py = await tryPyelftools(elfPath);
    if (py) return py;
    return {
      tool: null,
      available: false,
      ok: null,
      summary:
        "No independent ELF tool available (tried llvm-readelf, readelf, pyelftools).",
      details: [],
    };
  } finally {
    await unlink(elfPath).catch(() => undefined);
  }
}
