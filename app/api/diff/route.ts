import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { runDiffPipeline } from "@/lib/soldiff/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

interface DiffRequestBody {
  programId?: string;
  fromSlot?: number;
  toSlot?: number;
  upgradeSignature?: string;
  upgradeSlot?: number;
  label?: string;
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

    if (upgradeSignature) {
      const report = await runDiffPipeline({
        programId,
        upgradeSignature,
        upgradeSlot: body.upgradeSlot,
        label: body.label,
      });
      return NextResponse.json({ report });
    }

    const fromSlot = Number(body.fromSlot);
    const toSlot = Number(body.toSlot);

    if (!Number.isFinite(fromSlot) || fromSlot < 0) {
      return NextResponse.json({ error: "fromSlot must be a positive number" }, { status: 400 });
    }

    if (!Number.isFinite(toSlot) || toSlot < 0) {
      return NextResponse.json({ error: "toSlot must be a positive number" }, { status: 400 });
    }

    if (fromSlot >= toSlot) {
      return NextResponse.json({ error: "fromSlot must be less than toSlot" }, { status: 400 });
    }

    const report = await runDiffPipeline({
      programId,
      fromSlot,
      toSlot,
      label: body.label,
    });

    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Diff pipeline failed";
    console.error("[/api/diff]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
