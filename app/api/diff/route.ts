import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { runAnalysisPipeline, toDemoProgram } from "@/lib/soldiff/pipeline";
import type { ProvenanceSummary } from "@/app/lib/report-presenter";

export const runtime = "nodejs";
export const maxDuration = 300;

interface DiffRequestBody {
  programId?: string;
  fromSlot?: number;
  toSlot?: number;
  upgradeSignature?: string;
  prevUpgradeSignature?: string;
  upgradeSlot?: number;
  prevUpgradeSlot?: number;
  label?: string;
}

function provenanceSummary(
  v: {
    provenance: {
      upgradeSignature?: string;
      upgradeSlot?: number;
      bufferAddress?: string;
      sha256: string;
      textSha256: string;
      rodataSha256: string;
      byteLength: number;
      writeTransactionCount: number;
      coverageComplete: boolean;
      reconstructionMethod: string;
      reconstructionWarnings: string[];
    };
  }
): ProvenanceSummary {
  const p = v.provenance;
  return {
    upgradeSignature: p.upgradeSignature,
    upgradeSlot: p.upgradeSlot,
    bufferAddress: p.bufferAddress,
    sha256: p.sha256,
    textSha256: p.textSha256,
    rodataSha256: p.rodataSha256,
    byteLength: p.byteLength,
    writeTransactionCount: p.writeTransactionCount,
    coverageComplete: p.coverageComplete,
    reconstructionMethod: p.reconstructionMethod,
    reconstructionWarnings: p.reconstructionWarnings,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DiffRequestBody;

    const programId = body.programId?.trim();
    if (!programId) {
      return NextResponse.json({ error: "programId is required" }, { status: 400 });
    }

    try {
      new PublicKey(programId);
    } catch {
      return NextResponse.json(
        { error: "Invalid program ID (must be base58 public key)" },
        { status: 400 }
      );
    }

    const upgradeSignature = body.upgradeSignature?.trim();

    const analysis = upgradeSignature
      ? await (async () => {
          const prevUpgradeSignature = body.prevUpgradeSignature?.trim();
          if (!prevUpgradeSignature) {
            throw Object.assign(
              new Error(
                "prevUpgradeSignature is required — provide the older BPF Upgrade tx (Version A)."
              ),
              { status: 400 }
            );
          }
          return runAnalysisPipeline({
            programId,
            upgradeSignature,
            prevUpgradeSignature,
            upgradeSlot: body.upgradeSlot,
            prevUpgradeSlot: body.prevUpgradeSlot,
            label: body.label,
          });
        })()
      : await (async () => {
          const fromSlot = Number(body.fromSlot);
          const toSlot = Number(body.toSlot);

          if (!Number.isFinite(fromSlot) || fromSlot < 0) {
            throw Object.assign(new Error("fromSlot must be a positive number"), {
              status: 400,
            });
          }
          if (!Number.isFinite(toSlot) || toSlot < 0) {
            throw Object.assign(new Error("toSlot must be a positive number"), {
              status: 400,
            });
          }
          if (fromSlot >= toSlot) {
            throw Object.assign(new Error("fromSlot must be less than toSlot"), {
              status: 400,
            });
          }

          return runAnalysisPipeline({
            programId,
            fromSlot,
            toSlot,
            label: body.label,
          });
        })();

    const report = toDemoProgram(analysis);

    return NextResponse.json({
      report,
      provenance: {
        versionA: provenanceSummary(analysis.versionA),
        versionB: provenanceSummary(analysis.versionB),
        framework: analysis.program.framework,
        limitations: analysis.limitations,
        programDataAddress: analysis.program.programDataAddress,
      },
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    let message = err instanceof Error ? err.message : "Diff pipeline failed";
    if (/heap out of memory|allocation failed/i.test(message)) {
      message =
        "Node.js ran out of memory during the bytecode diff phase. Reconstruction succeeded; " +
        "retry with NODE_OPTIONS=--max-old-space-size=8192 or use the optimized diff path (already enabled for large programs).";
    }
    console.error("[/api/diff]", message);
    return NextResponse.json({ error: message }, { status });
  }
}
