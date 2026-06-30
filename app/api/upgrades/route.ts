import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  createConnection,
  resolveProgramDataAddress,
} from "@/lib/soldiff/rpc";
import { findUpgradeBoundaries } from "@/lib/soldiff/upgrades";
import { getArchiveCoverage } from "@/lib/soldiff/archive";
import { resetRpcSession } from "@/lib/soldiff/rpc-executor";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const programId = new URL(request.url).searchParams.get("programId")?.trim();
    if (!programId) {
      return NextResponse.json({ error: "programId query param is required" }, { status: 400 });
    }

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(programId);
    } catch {
      return NextResponse.json({ error: "Invalid program ID" }, { status: 400 });
    }

    resetRpcSession();

    const connection = createConnection();
    const programData = await resolveProgramDataAddress(connection, pubkey);
    const upgrades = await findUpgradeBoundaries(programData, connection);
    const archive = await getArchiveCoverage().catch(() => ({
      earliestSlot: 0,
      latestSlot: undefined,
      gapPercent: undefined,
    }));

    return NextResponse.json({
      programId,
      programDataAddress: programData.toBase58(),
      archiveEarliestSlot: archive.earliestSlot,
      archiveLatestSlot: archive.latestSlot,
      upgrades: upgrades.slice(0, 25).map((u) => {
        const fullIdx = upgrades.findIndex((x) => x.signature === u.signature);
        return {
          slot: u.slot,
          signature: u.signature,
          suggestedFromSlot: u.slot - 1,
          suggestedToSlot: u.slot + 1,
          diffable: fullIdx >= 0 && fullIdx < upgrades.length - 1,
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list upgrades";
    console.error("[/api/upgrades]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
