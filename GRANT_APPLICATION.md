# SolDiff — Superteam Grant Application

> **Platform:** [earn.superteam.fun](https://earn.superteam.fun)
> **Grant Type:** Developer / Infrastructure Grant
> **Status:** Ready to Submit

---

## PAGE 1 — BASICS

| Field | Response |
|---|---|
| **Project Title** | SolDiff — On-Chain Program Upgrade Auditor |
| **One-Liner Description** | Open-source tool to decompile, diff & visualize Solana program upgrades—so devs, DAOs & auditors see exactly what changed before trusting code. |
| **Total Grant Amount** | $5,000 USDG |
| **Token** | USDG |
| **Telegram Username** | t.me/`<your_handle>` |
| **Solana Wallet Address** | `<your_USDG_compatible_wallet>` |

---

## PAGE 2 — DETAILS

### Project Details

#### What is the problem you're trying to solve?

Solana programs are upgradeable by default. An upgrade authority can silently push new bytecode to any program — at any time — changing the behavior of contracts that hold millions in user funds. Today, there is **no accessible tool** that lets developers, DAOs, or auditors inspect what actually changed between two deployed versions of a program.

This is not a theoretical concern. Program upgrade authority mismanagement is a documented attack vector across the Solana ecosystem — from rug pulls to compromised deployer keys. Most Solana protocols use a simple cold wallet or under-secured multisig to manage their upgrade authority; if that key is stolen or an insider is compromised, the program can be silently redeployed to drain user funds with no on-chain warning. A structural diff between the pre- and post-upgrade binaries gives DAOs, auditors, and users the one thing they currently lack: evidence of what actually changed before they trust the new code. The community has no such tool today.

The core failure modes this creates are:

1. **DAO governance is blind** — Multisig members (Squads, Realms) vote to approve upgrades without any way to inspect the bytecode they're approving. It's "approve on faith," not "approve on evidence."

2. **Auditors start from scratch** — After every upgrade, auditors must re-audit the entire program because they cannot scope their review to what actually changed.

3. **Users have zero visibility** — Power users, protocol integrators, and LPs have no way to independently verify that a program upgrade was non-malicious.

4. **The only alternative is raw BPF bytecode** — Comparing raw ELF binaries requires deep, specialized knowledge most ecosystem participants don't have.

#### How are you going to solve it?

**SolDiff** is an open-source CLI tool and web UI that takes two deployed versions of any Solana program (identified by Program ID + slot number, or upgrade transaction signature) and produces an instant, human-readable audit report in three layers:

**Layer 1 — Structural Diff**
SolDiff fetches the historical program bytecode from an archival RPC node (Helius), decompiles both ELF binaries to a Intermediate Representation (IR) capturing instruction handlers, account constraints, PDA derivations, and CPI calls, then performs a semantic-aware diff using a Myers algorithm adapted for tree structures. Output is a side-by-side diff of every instruction handler that changed.

**Layer 2 — Risk Annotations**
A rule-based engine scans the diff for 10 known-dangerous patterns: removed signer checks, new `invoke_signed` targets, changed authorities, discriminator changes, new mutable accounts, removed owner checks, added account-close instructions, changed PDA seeds, new unknown CPI targets, and general logic mutations. Each finding is severity-graded (CRITICAL / HIGH / MEDIUM / LOW / INFO) with a plain-English description and recommendation.

**Layer 3 — Blast Radius Map**
SolDiff constructs a directed account dependency graph from the program IR and highlights which PDAs, token accounts, and downstream programs are affected by the detected changes. Rendered as an interactive Mermaid diagram, this gives auditors and DAO members an immediate visual sense of the attack surface.

**Deliverables:**
- `soldiff` CLI — `npx soldiff <PROGRAM_ID> --from-slot X --to-slot Y`
- Web UI at soldiff.vercel.app — paste a Program ID and two slots for an instant report
- Shareable, content-addressed HTML reports for DAO governance attachments
- SDK (`@soldiff/sdk`) for Squads and Realms governance plugin integration
- GitHub Action for automated upgrade monitoring with Slack/webhook alerts
- 10+ real-world case studies (Jupiter, Marinade, Squads, Drift, etc.)

Everything is open-source, MIT licensed, and designed as a permanent public good for the Solana ecosystem.

---

### Deadline

**2026-07-21** *(3 months from application date)*

---

### Proof of Work (NOTE: submit your pow here - not this one)

Links to best work demonstrating ability to execute:

1. **Anvil Compiler** *(Solana Foundation Funded)*
   - Production-grade Solidity → Solana (Anchor) transpiler with AI-assisted compilation pipeline, structural validation, deterministic output validator, and a full developer workbench UI.
   - Directly relevant: same BPF output analysis and Anchor IR understanding required by SolDiff.
   - 🔗 [github.com/MisbahAnsar](https://github.com/MisbahAnsar)

2. **MoveForge** *(Movement Network Foundation Grant)*
   - AI-assisted Solidity → Move transpiler with interactive playground, accepted for a Movement Network Foundation grant.
   - Demonstrates cross-chain language analysis and grant execution track record.

3. **TruthLens** *(Solana Mobile Builder Grant — $8,500)*
   - TEEPIN-based hardware-attested content verification for the Solana Seeker device.
   - Demonstrates Solana-native infrastructure building and successful grant delivery.

4. **CorePlayground** *(Metaplex Grant Application)*
   - Interactive Metaplex Core plugin composition playground with live code generation, built for a grant application.
   - Demonstrates the front-end visualization and tooling UX skills directly applicable to SolDiff's web UI.

5. **AI Agent Skills Suite** *(Open Source)*
   - Published `solana-audit` (smart contract security auditing), `git-architect` (diff visualization), and `dep-risk-scanner` skills for the Agent Skills open standard.
   - The `solana-audit` skill directly prefigures SolDiff's risk annotation engine; `git-architect` directly prefigures the blast radius visualization.
   - 🔗 Published under the Agent Skills open standard on GitHub.

---

### Personal X Profile

`x.com/Misbahtwts`

---

### Personal GitHub Profile

`github.com/MisbahAnsar`

---

### Loom Video Pitch

> *(Record a 2–3 minute Loom covering:)*
> 1. Open any Solana Explorer upgrade transaction (e.g., Jupiter, Marinade)
> 2. Show how the current experience gives zero information about what changed
> 3. Show a SolDiff mockup / demo UI running locally
> 4. Walk through one real finding (removed signer check) and the blast radius diagram
> 5. Close with your builder track record and the 3-milestone delivery plan

(or you can summarise the problem and solution as we mentioned above and show the landing page on screen with your facecam(optional - but better))

`loom.com/share/<your_link>` (youtube bhi chalega)

---

### Fund Breakdown

| Category | Amount | Justification |
|---|---|---|
| **Core Engine Development** | $2,000 | Archival RPC fetcher, ELF parser, BPF IR generator, Myers diff on AST |
| **Web UI & Interactive Visualizer** | $1,500 | Side-by-side diff viewer (Next.js), Mermaid blast-radius diagram, shareable HTML report generator |
| **CLI Tool, SDK & Integrations** | $800 | `npx soldiff` CLI, `@soldiff/sdk`, Squads/Realms plugin prototype, Solana Explorer embed |
| **Documentation & Open-Source Infra** | $400 | Full README, WHITEPAPER, contribution guide, GitHub Actions CI/CD, npm/cargo publish |
| **Testing & Real-World Validation** | $300 | End-to-end tests against 10+ real mainnet upgrades; false positive/negative rate benchmarking |
| **Total** | **$5,000 USDG** | |

---

## PAGE 3 — MILESTONES & KPIs

### Milestones

---

#### Milestone 1 — Core Diff Engine
**Timeline:** Weeks 1–4
**Payout:** $2,000 USDG

**Description:**
Build the foundational pipeline: archival bytecode fetcher → ELF parser → BPF IR generator → Myers diff engine → risk annotation rule engine.

**Deliverables:**
- `soldiff-core` TypeScript library (open-source, MIT)
- `fetchProgramBytecode(programId, slot, rpcUrl)` — fetches historical ELF from archival Helius RPC
- `decompileToIR(elfBinary)` — lifts ELF to structured IR (instruction handlers, account schemas, PDA derivations, CPI calls)
- `diffIR(ir_a, ir_b)` — produces typed `ChangeSet` using Myers algorithm on AST
- `annotateRisks(changeset)` — v1 rule engine: 10 risk rules, severity-graded `Finding[]` output
- Unit tests covering all 10 risk rules with synthetic program fixtures
- Successfully diff 5 real mainnet upgrades (Jupiter, Marinade, Squads, and two others)

**KPIs:**
- 0% false negative rate on CRITICAL findings (validated against known upgrade patterns)
- < 5 second end-to-end time for a full diff on a standard program
- All 10 risk rules passing unit tests

---

#### Milestone 2 — Web UI, Blast Radius & Reports
**Timeline:** Weeks 5–8
**Payout:** $1,500 USDG

**Description:**
Build the web application and report generation system. Users can paste a Program ID + two slots and receive a full interactive diff view with risk annotations and blast radius diagram.

**Deliverables:**
- Next.js 15 web app deployed at `soldiff.vercel.app`
- Side-by-side diff viewer UI with syntax highlighting and risk badge overlays
- Interactive Mermaid blast radius diagram (color-coded by severity)
- Shareable HTML report generator (content-addressed by SHA-256 of diff output)
- Permanent report URLs: `soldiff.vercel.app/report/<hash>`
- Successfully demonstrated on 5 additional real mainnet upgrades (10 total)
- Full screenshot/screencast walkthrough published

**KPIs:**
- Reports render correctly for all tested programs
- Blast radius diagram accurately reflects account dependency graph
- Shareable URL produces identical report on any device (content-addressed)
- Web UI Lighthouse performance score > 85

---

#### Milestone 3 — CLI, SDK, Integrations & Documentation
**Timeline:** Weeks 9–12
**Payout:** $1,500 USDG

**Description:**
Publish the CLI tool and SDK, implement Solana Explorer integration prototype, produce full documentation, and create the real-world case study library.

**Deliverables:**
- `soldiff` CLI published to npm (`npx soldiff@latest`)
  - Supports `--from-slot`, `--to-slot`, `--from-tx`, `--to-tx`, `--output`, `--json` flags
- `@soldiff/sdk` npm package published
  - `generateDiffReport()` function with TypeScript types
- Squads v4 governance integration example (code + docs)
- Realms / SPL Governance plugin prototype (attach report to proposal metadata)
- GitHub Action: `MisbahAnsar/soldiff-action@v1` published
- Full project documentation: README, WHITEPAPER, CONTRIBUTING, API reference
- Case study library: 10+ real mainnet upgrades analyzed, findings documented in `/case-studies/`
- Final public announcement post (Twitter/X thread + Superteam community post)

**KPIs:**
- CLI: 100+ npm installs in first month post-launch
- SDK: successfully integrated into at least 1 external project (DAO or auditor)
- GitHub: 50+ stars within 30 days of launch
- Case studies: at least 2 referenced in DAO governance discussions or auditor reports
- Community: at least 1 security auditor or protocol team formally endorses the tool

---

### Summary KPI Table

| KPI | Target | Timeline |
|---|---|---|
| Programs diffed in testing | 10+ real mainnet upgrades | By M2 completion |
| False negative rate (CRITICAL findings) | 0% | By M1 completion |
| End-to-end diff latency | < 5 seconds | By M1 completion |
| npm CLI installs (first month) | 100+ | 30 days post-M3 |
| GitHub stars (first month) | 50+ | 30 days post-M3 |
| DAO governance references | 2+ proposals cite SolDiff report | 60 days post-M3 |
| External SDK integrations | 1+ projects adopt `@soldiff/sdk` | 60 days post-M3 |
| Audit report citations | 1+ auditor firm references SolDiff | 90 days post-M3 |

---

## SUPPORTING MATERIALS

| Document | Link |
|---|---|
| Technical Whitepaper | [`WHITEPAPER.md`](./WHITEPAPER.md) |
| Project README | [`README.md`](./README.md) |
| GitHub Repository | [github.com/MisbahAnsar/soldiff](https://github.com/MisbahAnsar/soldiff) |
| LinkedIn | [linkedin.com/in/misbah-ansari](https://www.linkedin.com/in/misbah-ansari-52657428a/) |
| X / Twitter | [x.com/Misbahtwts](https://x.com/Misbahtwts) |

---

## WHY THIS GRANT MAKES SENSE FOR SUPERTEAM

1. **It's a public good with no monetization conflict** — SolDiff is pure infrastructure. It doesn't compete with any Solana protocol. It makes every protocol safer.

2. **The problem is proven, not theoretical** — Program upgrade authority mismanagement is a documented, recurring vulnerability across the Solana ecosystem. The absence of any diff tooling means every DAO upgrade vote is made blind. SolDiff directly fills this gap.

3. **The builder has a track record of shipping** — Three prior Solana-adjacent grants (Solana Foundation, Solana Mobile, Movement Network), all with shipped deliverables. This is not a first attempt.

4. **The scope is tightly scoped to $5K** — No overhead, no hires, no runway. Three milestones, 12 weeks, one builder, full delivery.

5. **Long-term ecosystem leverage** — Every DAO upgrade proposal, every auditor engagement, every protocol integration that uses SolDiff is a compounding return on the $5,000 grant investment.

---

*Application prepared April 2026 | SolDiff v0.1.0-pre*