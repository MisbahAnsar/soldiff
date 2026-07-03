import { NextResponse } from "next/server";
import { discoverRecentUpgrades } from "@/lib/recent-upgrades";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    const result = await discoverRecentUpgrades();
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to discover recent upgrades";
    console.error("[/api/recent-upgrades]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
