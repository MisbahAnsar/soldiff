/**
 * Domain types for SolDiff analysis reports.
 * These are the source of truth for the backend; UI demo fixtures may mirror a subset.
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Confidence = "high" | "medium" | "low" | "unknown";
export type ProgramFramework = "anchor" | "non-anchor" | "unknown";
export type Availability = "available" | "unavailable" | "unknown";

export type DiffLine = {
  type: "added" | "removed" | "unchanged" | "context";
  lineA?: number;
  lineB?: number;
  content: string;
};

export type Evidence = {
  summary: string;
  details?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  offsets?: number[];
  hashes?: Record<string, string>;
};

export type Finding = {
  id: string;
  analyzer: string;
  code: string;
  severity: Severity;
  confidence: Confidence;
  description: string;
  recommendation?: string;
  evidence: Evidence;
  /** UI compatibility fields */
  instruction?: string;
  before?: string;
  after?: string;
  affectedVersions?: ("A" | "B")[];
};

export type CoverageGap = {
  offset: number;
  length: number;
};

export type OverlapRecord = {
  offset: number;
  length: number;
  earlierWrite: WriteOrderKey;
  laterWrite: WriteOrderKey;
  bytesDiffer: boolean;
};

export type WriteOrderKey = {
  slot: number;
  /** Transaction index within the slot when known; null if unavailable from RPC. */
  transactionIndex: number | null;
  signature: string;
  instructionIndex: number;
  innerInstructionIndex: number | null;
};

export type OrderedWriteChunk = WriteOrderKey & {
  offset: number;
  bytes: Buffer;
};

export type ReconstructionMethod =
  | "buffer-write-replay"
  | "rewind-slot"
  | "rewind-anchor"
  | "fixture";

export type ArtifactProvenance = {
  programId: string;
  programDataAddress: string;
  bufferAddress?: string;
  upgradeSignature?: string;
  upgradeSlot?: number;
  reconstructionMethod: ReconstructionMethod;
  writeTransactionCount: number;
  writeChunkCount: number;
  byteLength: number;
  sha256: string;
  textSha256: string;
  rodataSha256: string;
  coverageComplete: boolean;
  coverageGaps: CoverageGap[];
  overlapCount: number;
  unexpectedOverlapCount: number;
  reconstructionWarnings: string[];
  rpcProviderMetadata?: Record<string, unknown>;
  deploymentCycle?: {
    startSignature?: string;
    startKind?: "initialize_buffer" | "first_write" | "unknown";
    endSignature: string;
    bounded: boolean;
  };
};

export type VersionArtifact = {
  label: "A" | "B";
  slot: number;
  elf: Buffer;
  textSection: Buffer;
  rodataSection: Buffer;
  provenance: ArtifactProvenance;
  framework: ProgramFramework;
  idl?: {
    status: Availability;
    source?: string;
    normalized?: NormalizedIdl;
    rawJson?: unknown;
  };
  disassembly?: DisassemblyArtifact;
};

export type NormalizedIdlAccount = {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  isOptional?: boolean;
  address?: string;
  docs?: string[];
  pda?: unknown;
  relations?: unknown;
};

export type NormalizedIdlInstruction = {
  name: string;
  discriminator?: number[];
  docs?: string[];
  args: Array<{ name: string; type: unknown }>;
  accounts: NormalizedIdlAccount[];
};

export type NormalizedIdl = {
  address?: string;
  name?: string;
  version?: string;
  metadata?: Record<string, unknown>;
  instructions: NormalizedIdlInstruction[];
  accounts: Array<{ name: string; type: unknown; discriminator?: number[] }>;
  types: Array<{ name: string; type: unknown }>;
  errors: Array<{ code: number; name: string; msg?: string }>;
  events: Array<{ name: string; discriminator?: number[]; fields?: unknown }>;
};

export type DisassemblyInstruction = {
  offset: number;
  opcode: string;
  operands: string[];
  raw: string;
  class?: string;
};

export type DisassemblyFunction = {
  name?: string;
  start: number;
  end: number;
};

export type DisassemblyArtifact = {
  tool: string;
  toolVersion: string;
  instructions: DisassemblyInstruction[];
  functions?: DisassemblyFunction[];
  sections?: Array<{ name: string; offset: number; size: number }>;
  warnings: string[];
  normalized: NormalizedInstruction[];
};

export type NormalizedInstruction = {
  offset: number;
  opcode: string;
  operands: string[];
};

export type InstructionDiffEntry = {
  kind: "added" | "removed" | "replaced" | "unchanged";
  offsetA?: number;
  offsetB?: number;
  before?: NormalizedInstruction;
  after?: NormalizedInstruction;
};

export type DisassemblyDiffResult = {
  analyzer: "sbf-instruction";
  available: boolean;
  reason?: string;
  added: number;
  removed: number;
  replaced: number;
  unchanged: number;
  entries: InstructionDiffEntry[];
  functionRegionsChanged: number;
};

export type IdlDiffResult = {
  analyzer: "anchor-idl";
  status: Availability;
  reason?: string;
  findings: Finding[];
};

export type RawByteDiffResult = {
  analyzer: "raw-byte";
  textUnchanged: boolean;
  rodataUnchanged: boolean;
  changedTextChunks: number;
  textDiff: DiffLine[];
  rodataDiff: DiffLine[];
};

export type AnalysisReport = {
  id: string;
  label: string;
  cluster: string;
  program: {
    programId: string;
    programDataAddress: string;
    framework: ProgramFramework;
  };
  versionA: VersionArtifact;
  versionB: VersionArtifact;
  comparisons: {
    rawByteDiff: RawByteDiffResult;
    disassemblyDiff: DisassemblyDiffResult;
    anchorIdlDiff: IdlDiffResult;
  };
  findings: Finding[];
  riskScore: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    instructionsChanged: number;
    accountsAffected: number;
    newCpiTargets: number;
  };
  limitations: string[];
  /** UI-facing hex diffs (same as comparisons.rawByteDiff) */
  instructionDiff: DiffLine[];
  accountDiff: DiffLine[];
  blastNodes: Array<{
    id: string;
    label: string;
    type: "pda" | "token" | "signer" | "program" | "external";
    changed: boolean;
    risk?: Severity;
    balance?: string;
  }>;
  blastEdges: Array<{
    from: string;
    to: string;
    label: string;
    type: "write" | "read" | "cpi" | "sign";
    isNew?: boolean;
    isRemoved?: boolean;
  }>;
  /** Compatibility aliases used by existing UI */
  name: string;
  programId: string;
  fromSlot: number;
  toSlot: number;
  fromDate: string;
  toDate: string;
  description: string;
};

export type CaseStudyManifest = {
  programId: string;
  cluster: string;
  programDataAddress?: string;
  versionA: {
    upgradeSignature: string;
    slot: number;
    bufferAddress?: string;
  };
  versionB: {
    upgradeSignature: string;
    slot: number;
    bufferAddress?: string;
  };
  artifacts: {
    versionA: {
      sha256: string;
      textSha256: string;
      rodataSha256: string;
      size: number;
      coverageComplete: boolean;
    };
    versionB: {
      sha256: string;
      textSha256: string;
      rodataSha256: string;
      size: number;
      coverageComplete: boolean;
    };
  };
  verification: {
    method: string;
    status: "reconstructed" | "unavailable" | "partial";
    notes?: string[];
  };
  generatedAt: string;
  soldiffVersion?: string;
};
