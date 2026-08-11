import { describe, expect, test } from "bun:test";
import {
  assembleFromOrderedWrites,
  assertCompleteElf,
  compareWriteOrder,
  ReconstructionError,
  sortWriteChunks,
} from "../assemble";
import {
  reconstructFromWriteChunks,
  selectDeploymentCycleChunks,
} from "../buffer-reconstruct";
import { sha256Hex } from "../hash";
import { buildMinimalElf } from "../test-elf";
import { validateElf } from "../elf";
import {
  applyInstructionDiffSummary,
  buildRuleContext,
  computeRiskScore,
  runRules,
  summarizeFindings,
} from "../rules";
import type { OrderedWriteChunk } from "../types";
import type { FetchedBytecode } from "../rpc";
import {
  compareNormalizedIdls,
  normalizeIdl,
  resolveHistoricalIdl,
  diffAnchorIdls,
} from "../anchor-idl";
import {
  decodeSbfInstructions,
  normalizeInstructions,
  diffNormalizedInstructions,
  disassembleTextSection,
} from "../disassemble";
import { renderMarkdownReport, buildCaseStudyManifest } from "../report-markdown";
import type { AnalysisReport } from "../types";
import { analyzeRodata, classifyRodataString } from "../rodata";

function chunk(
  partial: Partial<OrderedWriteChunk> & { offset: number; bytes: Buffer; signature: string; slot: number }
): OrderedWriteChunk {
  return {
    transactionIndex: partial.transactionIndex ?? null,
    instructionIndex: partial.instructionIndex ?? 0,
    innerInstructionIndex: partial.innerInstructionIndex ?? null,
    ...partial,
  };
}

const META = {
  programId: "Prog111111111111111111111111111111111111111",
  programDataAddress: "Data111111111111111111111111111111111111111",
  bufferAddress: "Buf1111111111111111111111111111111111111111",
  upgradeSignature: "UpgradeSigA",
  upgradeSlot: 1000,
};

describe("write ordering", () => {
  test("sorts by slot ascending regardless of input order", () => {
    const elf = buildMinimalElf();
    const mid = Math.floor(elf.length / 2);
    const chunks = [
      chunk({ slot: 20, signature: "b", offset: mid, bytes: elf.subarray(mid) }),
      chunk({ slot: 10, signature: "a", offset: 0, bytes: elf.subarray(0, mid) }),
    ];
    const sorted = sortWriteChunks(chunks);
    expect(sorted[0].slot).toBe(10);
    expect(sorted[1].slot).toBe(20);
    const result = assembleFromOrderedWrites(chunks);
    expect(result.elf).not.toBeNull();
    expect(sha256Hex(result.elf!)).toBe(sha256Hex(elf));
  });

  test("reversed RPC-return order yields identical hash", () => {
    const elf = buildMinimalElf();
    const parts = [
      chunk({ slot: 1, signature: "w1", offset: 0, bytes: elf.subarray(0, 32), instructionIndex: 0 }),
      chunk({
        slot: 2,
        signature: "w2",
        offset: 32,
        bytes: elf.subarray(32),
        instructionIndex: 0,
      }),
    ];
    const forward = reconstructFromWriteChunks(parts, META);
    const reversed = reconstructFromWriteChunks([...parts].reverse(), META);
    expect(forward.provenance.sha256).toBe(reversed.provenance.sha256);
    expect(forward.provenance.byteLength).toBe(elf.length);
  });

  test("same-slot writes use transactionIndex when available", () => {
    expect(
      compareWriteOrder(
        { slot: 5, transactionIndex: 1, signature: "z", instructionIndex: 0, innerInstructionIndex: null },
        { slot: 5, transactionIndex: 2, signature: "a", instructionIndex: 0, innerInstructionIndex: null }
      )
    ).toBeLessThan(0);
  });
});

describe("coverage and overlaps", () => {
  test("missing chunks mark incomplete and assertCompleteElf throws", () => {
    const elf = buildMinimalElf();
    const chunks = [
      chunk({ slot: 1, signature: "w1", offset: 0, bytes: elf.subarray(0, 16) }),
      chunk({ slot: 2, signature: "w2", offset: 64, bytes: elf.subarray(64) }),
    ];
    const result = assembleFromOrderedWrites(chunks);
    expect(result.coverageComplete).toBe(false);
    expect(result.coverageGaps.length).toBeGreaterThan(0);
    expect(() => assertCompleteElf(result)).toThrow(ReconstructionError);
  });

  test("overlapping differing writes increase unexpectedOverlapCount", () => {
    const elf = buildMinimalElf();
    // Corrupt a byte inside .text (offset 64) so ELF magic remains valid
    const corrupted = Buffer.from(elf);
    corrupted[64] = (corrupted[64] ^ 0xff) & 0xff;
    const chunks = [
      chunk({ slot: 1, signature: "w1", offset: 0, bytes: Buffer.from(elf) }),
      chunk({
        slot: 2,
        signature: "w2",
        offset: 64,
        bytes: corrupted.subarray(64, 65),
      }),
    ];
    const result = assembleFromOrderedWrites(chunks);
    expect(result.unexpectedOverlapCount).toBeGreaterThan(0);
    expect(result.elf).not.toBeNull();
    expect(() => assertCompleteElf(result)).toThrow(/overlapping/);
  });

  test("identical overlapping rewrite is recorded but not unexpected", () => {
    const elf = buildMinimalElf();
    const chunks = [
      chunk({ slot: 1, signature: "w1", offset: 0, bytes: Buffer.from(elf) }),
      chunk({ slot: 2, signature: "w2", offset: 0, bytes: Buffer.from(elf) }),
    ];
    const result = assembleFromOrderedWrites(chunks);
    expect(result.overlaps.length).toBeGreaterThan(0);
    expect(result.unexpectedOverlapCount).toBe(0);
    expect(assertCompleteElf(result).equals(elf)).toBe(true);
  });
});

describe("ELF validation", () => {
  test("valid minimal ELF passes", () => {
    const elf = buildMinimalElf();
    const v = validateElf(elf);
    expect(v.ok).toBe(true);
    expect(v.text?.name).toBe(".text");
  });

  test("invalid ELF magic fails reconstruction", () => {
    const junk = Buffer.alloc(128, 0x41);
    const chunks = [chunk({ slot: 1, signature: "w1", offset: 0, bytes: junk })];
    const result = assembleFromOrderedWrites(chunks);
    expect(result.elf).toBeNull();
    expect(() => assertCompleteElf(result)).toThrow(/invalid ELF/i);
  });
});

describe("deployment cycle isolation", () => {
  test("reused buffer stops at prior Close and excludes older writes", () => {
    const elfNew = buildMinimalElf({
      text: Buffer.from([0xb7, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x95, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    });
    const elfOld = buildMinimalElf({
      text: Buffer.from([0xb7, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x95, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    });

    const classified = [
      {
        signature: "old-init",
        slot: 10,
        transactionIndex: 0,
        kinds: ["initialize_buffer" as const],
        writeChunks: [],
      },
      {
        signature: "old-write",
        slot: 11,
        transactionIndex: 0,
        kinds: ["write" as const],
        writeChunks: [
          chunk({ slot: 11, signature: "old-write", offset: 0, bytes: elfOld }),
        ],
      },
      {
        signature: "old-upgrade",
        slot: 12,
        transactionIndex: 0,
        kinds: ["upgrade" as const],
        writeChunks: [],
      },
      {
        signature: "close",
        slot: 13,
        transactionIndex: 0,
        kinds: ["close" as const],
        writeChunks: [],
      },
      {
        signature: "new-init",
        slot: 20,
        transactionIndex: 0,
        kinds: ["initialize_buffer" as const],
        writeChunks: [],
      },
      {
        signature: "new-write",
        slot: 21,
        transactionIndex: 0,
        kinds: ["write" as const],
        writeChunks: [
          chunk({ slot: 21, signature: "new-write", offset: 0, bytes: elfNew }),
        ],
      },
      {
        signature: "new-upgrade",
        slot: 22,
        transactionIndex: 0,
        kinds: ["upgrade" as const],
        writeChunks: [],
      },
    ];

    const cycle = selectDeploymentCycleChunks(classified, "new-upgrade", 22);
    expect(cycle.bounded).toBe(true);
    expect(cycle.startKind).toBe("initialize_buffer");
    const assembled = assembleFromOrderedWrites(cycle.chunks);
    expect(sha256Hex(assertCompleteElf(assembled))).toBe(sha256Hex(elfNew));
    expect(sha256Hex(assertCompleteElf(assembled))).not.toBe(sha256Hex(elfOld));
  });

  test("incomplete history without boundary fails", () => {
    const elf = buildMinimalElf();
    const classified = [
      {
        signature: "w1",
        slot: 21,
        transactionIndex: null,
        kinds: ["write" as const],
        writeChunks: [chunk({ slot: 21, signature: "w1", offset: 0, bytes: elf })],
      },
      {
        signature: "up",
        slot: 22,
        transactionIndex: null,
        kinds: ["upgrade" as const],
        writeChunks: [],
      },
    ];
    expect(() => selectDeploymentCycleChunks(classified, "up", 22)).toThrow(
      /deployment-cycle boundary/i
    );
  });
});

describe("version ordering rules", () => {
  test("hash consistency across reconstruction", () => {
    const elf = buildMinimalElf();
    const r = reconstructFromWriteChunks(
      [chunk({ slot: 1, signature: "w", offset: 0, bytes: elf })],
      META
    );
    expect(r.provenance.sha256).toBe(sha256Hex(elf));
    expect(r.provenance.textSha256).toHaveLength(64);
    expect(r.provenance.rodataSha256).toHaveLength(64);
  });
});

describe("rules honesty", () => {
  function bin(partial: Partial<FetchedBytecode> & { textSection: Buffer; rodataSection: Buffer }): FetchedBytecode {
    return {
      requestedSlot: 1,
      slot: 1,
      programId: "P",
      programDataAddress: "D",
      elf: Buffer.concat([partial.textSection, partial.rodataSection]),
      textHash: sha256Hex(partial.textSection).slice(0, 16),
      elfSha256: "aa",
      textSha256: sha256Hex(partial.textSection),
      rodataSha256: sha256Hex(partial.rodataSection),
      sizeBytes: 1,
      ...partial,
    };
  }

  test("rodata-only change is not NO_CHANGE", () => {
    const text = Buffer.alloc(32, 1);
    const oldBin = bin({ textSection: text, rodataSection: Buffer.from("aaa"), slot: 1 });
    const newBin = bin({ textSection: text, rodataSection: Buffer.from("bbb"), slot: 2 });
    const findings = runRules(buildRuleContext(oldBin, newBin, 0));
    expect(findings.some((f) => f.code === "NO_CHANGE")).toBe(false);
    expect(findings.some((f) => f.code === "CODE_UNCHANGED_DATA_CHANGED")).toBe(true);
  });

  test("pubkey candidates are not CRITICAL NEW_EXTERNAL_PROGRAM", () => {
    const unknown = Buffer.alloc(32, 7);
    const oldBin = bin({ textSection: Buffer.alloc(64, 1), rodataSection: Buffer.alloc(32, 0), slot: 1 });
    const newBin = bin({
      textSection: Buffer.alloc(64, 2),
      rodataSection: Buffer.from(unknown),
      slot: 2,
    });
    const findings = runRules(buildRuleContext(oldBin, newBin, 30));
    expect(findings.some((f) => f.code === "NEW_EXTERNAL_PROGRAM")).toBe(false);
    expect(findings.some((f) => f.code === "LOGIC_CHANGE")).toBe(false);
    expect(findings.some((f) => f.code === "LARGE_TEXT_REGION_CHANGED")).toBe(true);
  });

  test("LARGE_TEXT_REGION_CHANGED is never HIGH from chunk count alone", () => {
    const textA = Buffer.alloc(64, 1);
    const textB = Buffer.alloc(64, 2);
    const oldBin = bin({ textSection: textA, rodataSection: Buffer.alloc(0), slot: 1 });
    const newBin = bin({ textSection: textB, rodataSection: Buffer.alloc(0), slot: 2 });
    const findings = runRules(buildRuleContext(oldBin, newBin, 11016));
    const large = findings.find((f) => f.code === "LARGE_TEXT_REGION_CHANGED");
    expect(large).toBeDefined();
    expect(large!.severity).toBe("MEDIUM");
    expect(large!.severity).not.toBe("HIGH");
  });

  test("summarizeFindings does not treat bytecode findings as SBF instruction count", () => {
    const findings = [
      {
        id: "1",
        analyzer: "raw-byte",
        code: "TEXT_BYTES_CHANGED",
        severity: "INFO" as const,
        confidence: "high" as const,
        description: "x",
        evidence: { summary: "x" },
      },
      {
        id: "2",
        analyzer: "raw-byte",
        code: "BYTECODE_CHANGED",
        severity: "INFO" as const,
        confidence: "high" as const,
        description: "x",
        evidence: { summary: "x" },
      },
      {
        id: "3",
        analyzer: "raw-byte",
        code: "LARGE_TEXT_REGION_CHANGED",
        severity: "MEDIUM" as const,
        confidence: "medium" as const,
        description: "x",
        evidence: { summary: "x" },
      },
    ];
    const summary = summarizeFindings(findings);
    expect(summary.instructionsChanged).toBe(0);
    const withSbf = applyInstructionDiffSummary(summary, {
      added: 3946,
      removed: 1320,
      replaced: 38444,
    });
    expect(withSbf.instructionsChanged).toBe(3946 + 1320 + 38444);
  });

  test("risk score is not inflated by HIGH for text-chunk churn alone", () => {
    const textA = Buffer.alloc(64, 1);
    const textB = Buffer.alloc(64, 2);
    const oldBin = bin({ textSection: textA, rodataSection: Buffer.alloc(0), slot: 1 });
    const newBin = bin({ textSection: textB, rodataSection: Buffer.alloc(0), slot: 2 });
    const findings = runRules(buildRuleContext(oldBin, newBin, 11016));
    expect(findings.every((f) => f.severity !== "HIGH" && f.severity !== "CRITICAL")).toBe(
      true
    );
    const score = computeRiskScore(findings);
    // TEXT_BYTES + BYTECODE (1+1) + LARGE_TEXT MEDIUM (10) = 12 when no strings/pubkeys
    expect(score).toBeLessThan(20);
  });

  test("TEXT_SECTION_SIZE_CHANGE is never HIGH from size delta alone", () => {
    const textA = Buffer.alloc(100, 1);
    const textB = Buffer.alloc(200, 2);
    const oldBin = bin({ textSection: textA, rodataSection: Buffer.alloc(0), slot: 1 });
    const newBin = bin({ textSection: textB, rodataSection: Buffer.alloc(0), slot: 2 });
    const findings = runRules(buildRuleContext(oldBin, newBin, 10));
    const sizeF = findings.find((f) => f.code === "TEXT_SECTION_SIZE_CHANGE");
    expect(sizeF).toBeDefined();
    expect(sizeF!.severity).toBe("MEDIUM");
  });

  test("rodata findings prioritize bytes over noisy string-set adds", () => {
    const text = Buffer.alloc(32, 1);
    const oldBin = bin({
      textSection: text,
      rodataSection: Buffer.from("hello\0/Users/dmitri/work/platform-tools/x\0"),
      slot: 1,
    });
    const newBin = bin({
      textSection: text,
      rodataSection: Buffer.from("hello\0/home/runner/work/platform-tools/x\0world\0"),
      slot: 2,
    });
    const findings = runRules(buildRuleContext(oldBin, newBin, 0));
    expect(findings.some((f) => f.code === "RODATA_BYTES_CHANGED")).toBe(true);
    expect(findings.some((f) => f.code === "NEW_RODATA_STRINGS")).toBe(false);
    expect(findings.some((f) => f.code === "REMOVED_RODATA_STRINGS")).toBe(false);
  });
});

describe("anchor IDL", () => {
  const baseIdl = {
    address: "Prog111111111111111111111111111111111111111",
    metadata: { name: "demo", version: "0.1.0" },
    instructions: [
      {
        name: "initialize",
        discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
        args: [{ name: "amount", type: "u64" }],
        accounts: [
          { name: "authority", writable: false, signer: true },
          { name: "vault", writable: false, signer: false },
        ],
      },
    ],
    accounts: [],
    types: [],
    errors: [{ code: 6000, name: "BadAmount" }],
    events: [],
  };

  test("instruction added/removed", () => {
    const a = normalizeIdl(baseIdl);
    const b = normalizeIdl({
      ...baseIdl,
      instructions: [
        ...baseIdl.instructions,
        {
          name: "withdraw",
          discriminator: [9, 9, 9, 9, 9, 9, 9, 9],
          args: [],
          accounts: [{ name: "vault", writable: true, signer: false }],
        },
      ],
    });
    const findings = compareNormalizedIdls(a, b);
    expect(findings.some((f) => f.code === "IDL_INSTRUCTION_ADDED")).toBe(true);

    const removed = compareNormalizedIdls(b, a);
    expect(removed.some((f) => f.code === "IDL_INSTRUCTION_REMOVED")).toBe(true);
  });

  test("mutability, signer, discriminator, args", () => {
    const a = normalizeIdl(baseIdl);
    const b = normalizeIdl({
      ...baseIdl,
      instructions: [
        {
          name: "initialize",
          discriminator: [8, 7, 6, 5, 4, 3, 2, 1],
          args: [
            { name: "amount", type: "u64" },
            { name: "memo", type: "string" },
          ],
          accounts: [
            { name: "authority", writable: false, signer: false },
            { name: "vault", writable: true, signer: false },
          ],
        },
      ],
    });
    const findings = compareNormalizedIdls(a, b);
    expect(findings.some((f) => f.code === "IDL_DISCRIMINATOR_CHANGE")).toBe(true);
    expect(findings.some((f) => f.code === "IDL_ARGS_CHANGED")).toBe(true);
    expect(findings.some((f) => f.code === "NEW_MUTABLE_ACCOUNT")).toBe(true);
    expect(findings.some((f) => f.code === "IDL_SIGNER_REMOVED")).toBe(true);
  });

  test("unchanged IDL", () => {
    const a = normalizeIdl(baseIdl);
    const findings = compareNormalizedIdls(a, a);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("IDL_UNCHANGED");
  });

  test("missing historical IDL is unavailable not unchanged", () => {
    const hist = resolveHistoricalIdl({});
    expect(hist.status).toBe("unavailable");
    const cur = {
      status: "available" as const,
      normalized: normalizeIdl(baseIdl),
      rawJson: baseIdl,
      source: "on-chain-current",
    };
    const diff = diffAnchorIdls(hist, cur);
    expect(diff.status).toBe("unavailable");
    expect(diff.findings.some((f) => f.code === "HISTORICAL_IDL_UNAVAILABLE")).toBe(true);
    expect(diff.findings.some((f) => f.code === "IDL_UNCHANGED")).toBe(false);
  });
});

describe("disassembly", () => {
  const movExit = Buffer.from([
    0xb7, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, // mov64 r0, 1
    0x95, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // exit
  ]);

  test("identical versions", () => {
    const a = normalizeInstructions(decodeSbfInstructions(movExit));
    const diff = diffNormalizedInstructions(a, a);
    expect(diff.methodology).toBe("sequence-alignment");
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.replaced).toBe(0);
    expect(diff.unchanged).toBe(2);
    expect(diff.repositioned).toBe(0);
  });

  test("added / removed / changed instruction", () => {
    const a = decodeSbfInstructions(movExit);
    const longer = Buffer.concat([
      movExit,
      Buffer.from([0xb7, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]),
    ]);
    const b = decodeSbfInstructions(longer);
    const diff = diffNormalizedInstructions(
      normalizeInstructions(a),
      normalizeInstructions(b)
    );
    expect(diff.added).toBe(1);
    expect(diff.unchanged).toBe(2);

    const removed = diffNormalizedInstructions(
      normalizeInstructions(b),
      normalizeInstructions(a)
    );
    expect(removed.removed).toBe(1);

    const changedImm = Buffer.from([
      0xb7, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
      0x95, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const ch = diffNormalizedInstructions(
      normalizeInstructions(a),
      normalizeInstructions(decodeSbfInstructions(changedImm))
    );
    expect(ch.replaced).toBe(1);
    expect(ch.unchanged).toBe(1);
  });

  test("insertion does not mark later identical instructions as replaced", () => {
    // A: mov r0,1 ; exit ; mov r1,2 ; exit
    // B: mov r0,1 ; exit ; mov r2,3 ; mov r1,2 ; exit   (insert before trailing pair)
    const insn = (bytes: number[]) => Buffer.from(bytes);
    const mov0 = insn([0xb7, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00]);
    const exit = insn([0x95, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const mov1 = insn([0xb7, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]);
    const mov2 = insn([0xb7, 0x02, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const aBuf = Buffer.concat([mov0, exit, mov1, exit]);
    const bBuf = Buffer.concat([mov0, exit, mov2, mov1, exit]);
    const diff = diffNormalizedInstructions(
      normalizeInstructions(decodeSbfInstructions(aBuf)),
      normalizeInstructions(decodeSbfInstructions(bBuf))
    );
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
    expect(diff.replaced).toBe(0);
    expect(diff.unchanged).toBe(4);
    expect(diff.repositioned).toBeGreaterThan(0);
  });

  test("normalization consistency", () => {
    const d1 = disassembleTextSection(movExit);
    const d2 = disassembleTextSection(movExit);
    expect(d1.normalized).toEqual(d2.normalized);
  });
});

describe("rodata analysis", () => {
  test("classifies build paths and fragmented concatenations as non-product", () => {
    expect(classifyRodataString("/Users/dmitri/work/platform-tools/out/x").kind).toBe(
      "build_path"
    );
    expect(classifyRodataString("memory allocation failed, out of memory").kind).toBe(
      "compiler_runtime"
    );
    const frag =
      "A signer constraint was violatedAn owner constraint was violatedProgramError caused by account:";
    expect(classifyRodataString(frag).kind).toBe("uncertain_fragment");

    const a = Buffer.from("ok\0/Users/dmitri/platform-tools/a\0");
    const b = Buffer.from("ok\0/home/runner/work/platform-tools/a\0");
    const analysis = analyzeRodata(a, b);
    expect(analysis.unchanged).toBe(false);
    expect(analysis.changedRegionBytes).toBeGreaterThan(0);
    expect(analysis.notes.length).toBeGreaterThan(0);
  });
});

describe("ELF section-header truncation", () => {
  test("trailing sh_table overrun is a warning when loadable sections fit", () => {
    // Minimal ELF with e_shoff/e_shnum claiming 4 bytes past EOF; keep sh_offset/sh_size readable.
    const elf = Buffer.alloc(252); // claimed sh_end = 128+2*64 = 256 → overrun 4
    elf[0] = 0x7f;
    elf[1] = 0x45;
    elf[2] = 0x4c;
    elf[3] = 0x46;
    elf[4] = 2; // ELF64
    elf[5] = 1; // LE
    elf.writeUInt16LE(3, 16); // ET_DYN
    elf.writeUInt16LE(247, 18); // EM_BPF
    elf.writeUInt16LE(64, 52); // ehsize
    elf.writeBigUInt64LE(BigInt(128), 40); // shoff
    elf.writeUInt16LE(64, 58); // shentsize
    elf.writeUInt16LE(2, 60); // shnum
    elf.writeUInt16LE(1, 62); // shstrndx
    const sh1 = 128 + 64;
    elf.writeUInt32LE(1, sh1);
    elf.writeUInt32LE(1, sh1 + 4); // SHT_PROGBITS
    elf.writeBigUInt64LE(BigInt(64), sh1 + 24);
    elf.writeBigUInt64LE(BigInt(16), sh1 + 32);
    const v = validateElf(elf);
    expect(v.warnings.some((w) => /Section-header table metadata extends/.test(w))).toBe(
      true
    );
    expect(v.errors.some((e) => /Section header table exceeds/.test(e))).toBe(false);
  });
});

describe("report", () => {
  test("manifest and markdown preserve provenance and unavailable IDL", () => {
    const elf = buildMinimalElf();
    const report = {
      id: "t",
      label: "test",
      name: "test",
      cluster: "mainnet-beta",
      programId: META.programId,
      program: {
        programId: META.programId,
        programDataAddress: META.programDataAddress,
        framework: "unknown" as const,
      },
      versionA: {
        label: "A" as const,
        slot: 1,
        elf,
        textSection: elf,
        rodataSection: Buffer.alloc(0),
        provenance: {
          programId: META.programId,
          programDataAddress: META.programDataAddress,
          bufferAddress: META.bufferAddress,
          upgradeSignature: "sigA",
          upgradeSlot: 1,
          reconstructionMethod: "fixture" as const,
          writeTransactionCount: 1,
          writeChunkCount: 1,
          byteLength: elf.length,
          sha256: sha256Hex(elf),
          textSha256: sha256Hex(elf),
          rodataSha256: sha256Hex(Buffer.alloc(0)),
          coverageComplete: true,
          coverageGaps: [],
          overlapCount: 0,
          unexpectedOverlapCount: 0,
          reconstructionWarnings: [],
        },
        framework: "unknown" as const,
        idl: { status: "unavailable" as const },
      },
      versionB: {
        label: "B" as const,
        slot: 2,
        elf,
        textSection: elf,
        rodataSection: Buffer.alloc(0),
        provenance: {
          programId: META.programId,
          programDataAddress: META.programDataAddress,
          bufferAddress: META.bufferAddress,
          upgradeSignature: "sigB",
          upgradeSlot: 2,
          reconstructionMethod: "fixture" as const,
          writeTransactionCount: 1,
          writeChunkCount: 1,
          byteLength: elf.length,
          sha256: sha256Hex(elf),
          textSha256: sha256Hex(elf),
          rodataSha256: sha256Hex(Buffer.alloc(0)),
          coverageComplete: true,
          coverageGaps: [],
          overlapCount: 0,
          unexpectedOverlapCount: 0,
          reconstructionWarnings: [],
        },
        framework: "unknown" as const,
        idl: { status: "unavailable" as const },
      },
      comparisons: {
        rawByteDiff: {
          analyzer: "raw-byte" as const,
          textUnchanged: true,
          rodataUnchanged: false,
          changedTextChunks: 0,
          textDiff: [],
          rodataDiff: [],
        },
        disassemblyDiff: {
          analyzer: "sbf-instruction" as const,
          methodology: "sequence-alignment" as const,
          available: true,
          added: 0,
          removed: 0,
          replaced: 0,
          unchanged: 0,
          repositioned: 0,
          entries: [],
          functionRegionsChanged: 0,
        },
        anchorIdlDiff: {
          analyzer: "anchor-idl" as const,
          status: "unavailable" as const,
          reason: "historicalIdl: unavailable",
          findings: [],
        },
      },
      findings: [
        {
          id: "1",
          analyzer: "raw-byte",
          code: "CODE_UNCHANGED_DATA_CHANGED",
          severity: "INFO" as const,
          confidence: "high" as const,
          description: "code unchanged data changed",
          evidence: { summary: "rodata changed" },
        },
      ],
      riskScore: 1,
      observedChangeScore: 1,
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 1,
        instructionsChanged: 0,
        accountsAffected: 0,
        newCpiTargets: 0,
      },
      limitations: ["test limitation"],
      instructionDiff: [],
      accountDiff: [],
      blastNodes: [],
      blastEdges: [],
      fromSlot: 1,
      toSlot: 2,
      fromDate: "slot 1",
      toDate: "slot 2",
      description: "test",
    } satisfies AnalysisReport;

    const md = renderMarkdownReport(report);
    expect(md).toContain("Historical Anchor IDL: unavailable");
    expect(md).toContain("code unchanged, data changed");
    expect(md).toContain(sha256Hex(elf));
    expect(md).toContain("test limitation");

    const manifest = buildCaseStudyManifest(report);
    expect(manifest.artifacts.versionA.sha256).toBe(sha256Hex(elf));
    expect(manifest.verification.status).toBe("reconstructed");
  });
});
