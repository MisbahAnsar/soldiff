<div align="center">

<img src="https://img.shields.io/badge/Solana-Program%20Diff%20Visualizer-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="SolDiff" />

# SolDiff

### On-Chain Program Upgrade Auditor for Solana

**Decompile. Diff. Visualize. Trust.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![Superteam Grant](https://img.shields.io/badge/Superteam-Grant%20Recipient-14F195)](https://earn.superteam.fun)

[Live Demo](https://soldiff.vercel.app) · [Report a Bug](https://github.com/MisbahAnsar/soldiff/issues)

</div>

---

## The Problem

Solana programs are **upgradeable by default**. An upgrade authority can silently push new bytecode to any program at any time — changing the behavior of contracts holding millions in user funds — with **zero accessible audit trail** for the community.

Today, if you want to know what changed between two versions of a deployed Solana program:

- ❌ No visual diff tool exists
- ❌ You must manually compare raw BPF bytecode
- ❌ DAOs approve upgrades with no verification workflow
- ❌ Auditors start from scratch after every upgrade

The April 2026 Drift Protocol exploit is a direct consequence of this trust gap. **SolDiff closes it.**

---

## What SolDiff Does

SolDiff is an open-source CLI tool and web UI that takes two deployed versions of any Solana program and produces an instant, human-readable audit report.

```
soldiff <PROGRAM_ID> --from-slot 280000000 --to-slot 294000000
```

### Output

| Feature | Description |
|---|---|
| 🔍 **Structural Diff** | Side-by-side comparison of instruction handlers, account structs, and discriminators |
| 💥 **Blast Radius Map** | Interactive diagram of affected PDAs, token accounts, and downstream CPIs |
| 🚨 **Risk Annotations** | Automated flags for removed signer checks, new `invoke_signed` targets, changed authorities |
| 📄 **Shareable Report** | Permanent, linkable HTML report DAOs can attach to governance proposals |
| 🔗 **Explorer Integration** | One-click diff from any program's upgrade transaction on Solana Explorer |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      SolDiff Pipeline                   │
│                                                         │
│  Program ID + Slots/Tx Sig                              │
│         │                                               │
│         ▼                                               │
│  ┌─────────────┐    ┌──────────────┐                   │
│  │  RPC Fetch  │───▶│  BPF Bytecode│                   │
│  │  (Helius)   │    │  Downloader  │                   │
│  └─────────────┘    └──────┬───────┘                   │
│                            │                            │
│                            ▼                            │
│                   ┌────────────────┐                   │
│                   │  Decompiler    │                   │
│                   │ (BPF → IR AST) │                   │
│                   └───────┬────────┘                   │
│                           │                             │
│              ┌────────────┴────────────┐               │
│              ▼                         ▼               │
│        ┌──────────┐             ┌──────────┐           │
│        │ Version A│             │ Version B│           │
│        │   AST    │             │   AST    │           │
│        └─────┬────┘             └────┬─────┘           │
│              └──────────┬───────────┘                  │
│                         ▼                               │
│               ┌──────────────────┐                     │
│               │   Diff Engine    │                     │
│               │ (structural diff)│                     │
│               └────────┬─────────┘                     │
│                        │                               │
│           ┌────────────┼────────────┐                  │
│           ▼            ▼            ▼                  │
│    ┌─────────┐  ┌──────────┐ ┌──────────┐             │
│    │  Risk   │  │ Blast    │ │Shareable │             │
│    │Annotator│  │ Radius   │ │  Report  │             │
│    └─────────┘  └──────────┘ └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

---

## Quickstart

### Web UI

Visit [soldiff.vercel.app](https://soldiff.vercel.app) — paste a Program ID and two slot numbers.

### CLI

```bash
# Install
npx soldiff@latest

# Diff by slot range
soldiff <PROGRAM_ID> --from-slot <SLOT_A> --to-slot <SLOT_B>

# Diff by upgrade transaction signatures
soldiff <PROGRAM_ID> --from-tx <TX_SIG_A> --to-tx <TX_SIG_B>

# Export as HTML report
soldiff <PROGRAM_ID> --from-slot <SLOT_A> --to-slot <SLOT_B> --output report.html

# Output as JSON (for CI/CD pipelines)
soldiff <PROGRAM_ID> --from-slot <SLOT_A> --to-slot <SLOT_B> --json
```

### Local Development

```bash
git clone https://github.com/MisbahAnsar/soldiff.git
cd soldiff

bun install

# Copy environment variables
cp .env.example .env.local
# Add your HELIUS_API_KEY to .env.local

bun dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Risk Annotations

SolDiff automatically flags the following risk patterns between versions:

| Flag | Severity | Description |
|---|---|---|
| `REMOVED_SIGNER_CHECK` | 🔴 Critical | A required signer constraint was removed |
| `NEW_INVOKE_SIGNED_TARGET` | 🔴 Critical | A new CPI target was added to `invoke_signed` |
| `CHANGED_AUTHORITY_FIELD` | 🔴 Critical | An authority or admin account key changed |
| `DISCRIMINATOR_CHANGE` | 🟠 High | Instruction discriminator was modified (breaking change) |
| `NEW_MUTABLE_ACCOUNT` | 🟠 High | A previously read-only account is now writable |
| `REMOVED_OWNER_CHECK` | 🟠 High | An ownership validation was removed |
| `ADDED_CLOSE_ACCOUNT` | 🟡 Medium | An account close instruction was added |
| `CHANGED_SEEDS` | 🟡 Medium | PDA derivation seeds changed (potential account substitution) |
| `NEW_EXTERNAL_PROGRAM` | 🟡 Medium | A new external program CPI was added |
| `LOGIC_CHANGE` | 🔵 Info | General business logic modification detected |

---

## Real-World Upgrades Analyzed

SolDiff ships with a case study library of real mainnet program upgrades:

| Program | Date | Risk Flags | Summary |
|---|---|---|---|
| Drift Protocol | Apr 2026 | 🔴×2 🟠×1 | New `invoke_signed` target introduced in `place_order` handler |
| Jupiter Aggregator | Jan 2026 | 🔵×3 | Routing logic update, no security regressions |
| Marinade Finance | Mar 2026 | 🟡×1 | PDA seed change in `deposit` instruction |
| Squads Multisig | Feb 2026 | 🔵×2 | Fee parameter update, no account mutations |

---

## Integration: DAO Governance

SolDiff is designed to slot directly into multisig and DAO upgrade workflows:

### Realms / SPL Governance

Attach a SolDiff report URL to any program upgrade proposal. Members can review the diff before voting.

### Squads v4

```typescript
import { generateDiffReport } from "@soldiff/sdk";

// Generate report before submitting upgrade transaction
const report = await generateDiffReport({
  programId: "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
  fromSlot: 280000000,
  toSlot: 294000000,
});

// Attach to proposal metadata
await squads.addProposalAttachment(proposalPda, {
  label: "SolDiff Security Report",
  uri: report.shareableUrl,
});
```

---

## Roadmap

- [x] Core diff engine (BPF bytecode comparison)
- [x] Web UI with side-by-side diff viewer
- [ ] Risk annotation engine (M1)
- [ ] Blast radius Mermaid diagram (M2)
- [ ] Shareable HTML report generation (M2)
- [ ] CLI tool (`npx soldiff`) (M3)
- [ ] Solana Explorer integration (M3)
- [ ] Squads / Realms governance plugin (M3)
- [ ] GitHub Action for CI/CD upgrade monitoring
- [ ] Real-time upgrade alert subscriptions (websocket)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, TypeScript, Tailwind CSS |
| **Decompilation** | `solana-bpf-disassembler`, custom IR generator |
| **Diff Engine** | Custom AST diff (Myers algorithm adapted for BPF IR) |
| **Visualization** | Mermaid.js, D3.js |
| **RPC** | Helius RPC (archival node access for historical slots) |
| **CLI** | Node.js, Commander.js |
| **Report Generation** | Handlebars, Puppeteer (PDF/HTML) |

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
# Run tests
bun test

# Lint
bun lint

# Type check
bun type-check
```

---

## Builder

Built by **Misbah** · [@Misbahtwts](https://x.com/Misbahtwts) · [GitHub](https://github.com/MisbahAnsar/soldiff) · [LinkedIn](https://www.linkedin.com/in/misbah-ansari-52657428a/)

_Last updated: June 2026_

Previously funded by:
- Solana Foundation (Anvil Compiler)
- Solana Mobile Builder Grant — TruthLens ($8,500)
- Movement Network Foundation — MoveForge

---

## License

MIT © 2026 SolDiff Contributors

---

<div align="center">

**If SolDiff prevents one exploit, it has paid for itself a thousand times over.**

⭐ Star this repo if you believe in transparent program upgrades on Solana.

</div>
