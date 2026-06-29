import type { AccountEdge, AccountNode, Severity } from "@/app/data/demos";
import type { FetchedBytecode } from "./rpc";
import { KNOWN_PROGRAM_IDS } from "./constants";
import { extractPubkeys } from "./diff";

export function buildBlastRadius(
  oldBin: FetchedBytecode,
  newBin: FetchedBytecode,
  newExternalPrograms: string[]
): { nodes: AccountNode[]; edges: AccountEdge[] } {
  const programNode: AccountNode = {
    id: "program",
    label: shorten(newBin.programId),
    type: "program",
    changed: oldBin.textHash !== newBin.textHash,
    risk: oldBin.textHash !== newBin.textHash ? "HIGH" : undefined,
  };

  const nodes: AccountNode[] = [programNode];
  const edges: AccountEdge[] = [];

  const allPubkeys = new Set([
    ...extractPubkeys(newBin.textSection),
    ...extractPubkeys(newBin.rodataSection),
  ]);

  // Upgrade authority from program data header isn't parsed here — add programdata node
  nodes.push({
    id: "programdata",
    label: `ProgramData\n${shorten(newBin.programDataAddress)}`,
    type: "pda",
    changed: oldBin.textHash !== newBin.textHash,
    risk: "MEDIUM",
  });
  edges.push({
    from: "program",
    to: "programdata",
    label: "upgradeable loader",
    type: "read",
  });

  let idx = 0;
  for (const pubkey of allPubkeys) {
    if (pubkey === newBin.programId || pubkey === newBin.programDataAddress) continue;
    const isNew = newExternalPrograms.includes(pubkey);
    const isKnown = KNOWN_PROGRAM_IDS.has(pubkey);
    const id = `ref_${idx++}`;

    nodes.push({
      id,
      label: shorten(pubkey),
      type: isKnown ? "program" : "external",
      changed: isNew,
      risk: isNew ? "CRITICAL" : isKnown ? undefined : "MEDIUM",
    });

    edges.push({
      from: "program",
      to: id,
      label: isNew ? "new CPI ref" : "CPI ref",
      type: isNew ? "cpi" : "read",
      isNew,
    });
  }

  // Cap nodes for UI
  return {
    nodes: nodes.slice(0, 12),
    edges: edges.slice(0, 14),
  };
}

function shorten(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}
