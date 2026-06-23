export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface DiffLine {
  type: "added" | "removed" | "unchanged" | "context";
  lineA?: number;
  lineB?: number;
  content: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  code: string;
  instruction: string;
  description: string;
  recommendation: string;
  before?: string;
  after?: string;
}

export interface AccountNode {
  id: string;
  label: string;
  type: "pda" | "token" | "signer" | "program" | "external";
  changed: boolean;
  risk?: Severity;
  balance?: string;
}

export interface AccountEdge {
  from: string;
  to: string;
  label: string;
  type: "write" | "read" | "cpi" | "sign";
  isNew?: boolean;
  isRemoved?: boolean;
}

export interface DemoProgram {
  id: string;
  name: string;
  programId: string;
  fromSlot: number;
  toSlot: number;
  fromDate: string;
  toDate: string;
  description: string;
  riskScore: number;
  findings: Finding[];
  instructionDiff: DiffLine[];
  accountDiff: DiffLine[];
  blastNodes: AccountNode[];
  blastEdges: AccountEdge[];
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
}

export const DEMO_PROGRAMS: DemoProgram[] = [
  {
    id: "drift",
    name: "Drift Protocol",
    programId: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    fromSlot: 292_000_000,
    toSlot: 294_500_000,
    fromDate: "Apr 3, 2026",
    toDate: "Apr 7, 2026",
    description: "Critical exploit — unauthorized liquidation via removed signer check",
    riskScore: 97,
    summary: {
      critical: 2,
      high: 1,
      medium: 0,
      low: 1,
      info: 3,
      instructionsChanged: 3,
      accountsAffected: 7,
      newCpiTargets: 1,
    },
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        code: "REMOVED_SIGNER_CHECK",
        instruction: "liquidate_perp",
        description:
          "The `liquidator` signer constraint was removed from the `liquidate_perp` instruction handler. Any caller can now invoke liquidation without authorization.",
        recommendation:
          "Immediately restore the `#[account(signer)]` constraint on the `liquidator` account. Audit all other liquidation handlers for similar regressions.",
        before: `#[account(mut, signer)]\npub liquidator: AccountInfo<'info>,`,
        after: `#[account(mut)]\npub liquidator: AccountInfo<'info>,`,
      },
      {
        id: "f2",
        severity: "CRITICAL",
        code: "NEW_INVOKE_SIGNED_TARGET",
        instruction: "place_order",
        description:
          "A new `invoke_signed` CPI target was added: `xYz3...kP9m` — an unverified external program not present in the prior version. The vault PDA authority is used to sign.",
        recommendation:
          "Audit program `xYz3...kP9m` immediately. If this is unintentional, roll back the upgrade. If intentional, verify the target program is audited and add its ID to program constants.",
        before: `// No external CPI call`,
        after: `invoke_signed(\n  &Instruction {\n    program_id: Pubkey::from_str("xYz3...kP9m").unwrap(),\n    ...\n  },\n  &[vault_authority.clone()],\n  &[vault_seeds],\n)?;`,
      },
      {
        id: "f3",
        severity: "HIGH",
        code: "NEW_MUTABLE_ACCOUNT",
        instruction: "settle_pnl",
        description:
          "`insurance_fund_vault` changed from read-only to writable. The insurance fund can now be drained during PnL settlement.",
        recommendation:
          "Revert the mutability change unless there is a specific audited reason for write access. Add proper bounds checks if write is required.",
        before: `#[account(address = insurance_fund.vault)]\npub insurance_fund_vault: Account<'info, TokenAccount>,`,
        after: `#[account(mut, address = insurance_fund.vault)]\npub insurance_fund_vault: Account<'info, TokenAccount>,`,
      },
      {
        id: "f4",
        severity: "LOW",
        code: "LOGIC_CHANGE",
        instruction: "update_amm",
        description: "Minor arithmetic update to AMM spread calculation. No security regressions detected.",
        recommendation: "Review the spread formula change for economic soundness.",
      },
      {
        id: "f5",
        severity: "INFO",
        code: "LOGIC_CHANGE",
        instruction: "deposit",
        description: "Deposit instruction logic unchanged. No findings.",
        recommendation: "No action required.",
      },
    ],
    instructionDiff: [
      { type: "context", lineA: 1, lineB: 1, content: "pub fn liquidate_perp(" },
      { type: "context", lineA: 2, lineB: 2, content: "    ctx: Context<LiquidatePerp>," },
      { type: "context", lineA: 3, lineB: 3, content: "    market_index: u16," },
      { type: "context", lineA: 4, lineB: 4, content: "    liquidator_max_base: u64," },
      { type: "context", lineA: 5, lineB: 5, content: ") -> Result<()> {" },
      { type: "removed", lineA: 6, content: "    let liquidator = &ctx.accounts.liquidator;" },
      { type: "removed", lineA: 7, content: "    require!(liquidator.is_signer, ErrorCode::Unauthorized);" },
      { type: "added", lineB: 6, content: "    // signer check removed" },
      { type: "context", lineA: 8, lineB: 7, content: "    let user = &mut ctx.accounts.user;" },
      { type: "context", lineA: 9, lineB: 8, content: "    let user_stats = &mut ctx.accounts.user_stats;" },
      { type: "context", lineA: 10, lineB: 9, content: " " },
    ],
    accountDiff: [
      { type: "context", lineA: 1, lineB: 1, content: "#[derive(Accounts)]" },
      { type: "context", lineA: 2, lineB: 2, content: "pub struct LiquidatePerp<'info> {" },
      { type: "removed", lineA: 3, content: "    #[account(mut, signer)]" },
      { type: "added", lineB: 3, content: "    #[account(mut)]" },
      { type: "context", lineA: 4, lineB: 4, content: "    pub liquidator: AccountInfo<'info>," },
      { type: "context", lineA: 5, lineB: 5, content: "    #[account(mut)]" },
      { type: "context", lineA: 6, lineB: 6, content: "    pub user: AccountLoader<'info, User>," },
      { type: "removed", lineA: 7, content: "    #[account(address = insurance_fund.vault)]" },
      { type: "added", lineB: 7, content: "    #[account(mut, address = insurance_fund.vault)]" },
      { type: "context", lineA: 8, lineB: 8, content: "    pub insurance_fund_vault: Account<'info, TokenAccount>," },
      { type: "context", lineA: 9, lineB: 9, content: "}" },
    ],
    blastNodes: [
      { id: "user", label: "User Wallet", type: "signer", changed: false },
      { id: "liquidator", label: "Liquidator (ANY)", type: "signer", changed: true, risk: "CRITICAL" },
      { id: "user_acc", label: "User PDA", type: "pda", changed: false },
      { id: "perp_market", label: "Perp Market", type: "pda", changed: false },
      { id: "vault", label: "Vault Authority PDA", type: "pda", changed: true, risk: "CRITICAL" },
      { id: "insurance", label: "Insurance Fund Vault", type: "token", changed: true, risk: "HIGH", balance: "$3.2M" },
      { id: "external", label: "Unknown Program\nxYz3...kP9m", type: "external", changed: true, risk: "CRITICAL" },
      { id: "token_prog", label: "Token Program", type: "program", changed: false },
    ],
    blastEdges: [
      { from: "liquidator", to: "user_acc", label: "liquidate_perp", type: "write" },
      { from: "vault", to: "insurance", label: "settle_pnl (now writable)", type: "write", isNew: true },
      { from: "vault", to: "external", label: "invoke_signed NEW CPI", type: "cpi", isNew: true },
      { from: "user", to: "user_acc", label: "deposit", type: "write" },
      { from: "external", to: "token_prog", label: "transfer?", type: "cpi", isNew: true },
    ],
  },
  {
    id: "jupiter",
    name: "Jupiter Aggregator",
    programId: "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
    fromSlot: 280_000_000,
    toSlot: 284_500_000,
    fromDate: "Jan 12, 2026",
    toDate: "Jan 19, 2026",
    description: "Routing algorithm update — no security regressions",
    riskScore: 12,
    summary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 1,
      info: 5,
      instructionsChanged: 2,
      accountsAffected: 0,
      newCpiTargets: 0,
    },
    findings: [
      {
        id: "j1",
        severity: "LOW",
        code: "LOGIC_CHANGE",
        instruction: "route_exact_in",
        description: "Routing weight calculation updated with adjusted fee basis points. No signer, account, or authority changes detected.",
        recommendation: "Verify the new fee basis points are correct per governance proposal. No security action required.",
        before: `let fee_bps = 30u64;`,
        after: `let fee_bps = 25u64; // governance proposal #1247`,
      },
      {
        id: "j2",
        severity: "INFO",
        code: "LOGIC_CHANGE",
        instruction: "route_exact_out",
        description: "Slippage tolerance check refactored for readability. Functionally equivalent.",
        recommendation: "No action required.",
      },
      {
        id: "j3",
        severity: "INFO",
        code: "LOGIC_CHANGE",
        instruction: "set_token_ledger",
        description: "Internal memo field added for off-chain indexing. Read-only data, no security implications.",
        recommendation: "No action required.",
      },
    ],
    instructionDiff: [
      { type: "context", lineA: 1, lineB: 1, content: "pub fn route_exact_in(" },
      { type: "context", lineA: 2, lineB: 2, content: "    ctx: Context<RouteExactIn>," },
      { type: "context", lineA: 3, lineB: 3, content: "    route_plan: Vec<RoutePlanStep>," },
      { type: "context", lineA: 4, lineB: 4, content: ") -> Result<()> {" },
      { type: "removed", lineA: 5, content: "    let fee_bps = 30u64;" },
      { type: "added", lineB: 5, content: "    let fee_bps = 25u64; // governance proposal #1247" },
      { type: "context", lineA: 6, lineB: 6, content: "    let fee_amount = amount_in" },
      { type: "context", lineA: 7, lineB: 7, content: "        .checked_mul(fee_bps)" },
      { type: "context", lineA: 8, lineB: 8, content: "        .ok_or(ErrorCode::MathOverflow)?" },
      { type: "context", lineA: 9, lineB: 9, content: "        .checked_div(10_000)" },
      { type: "context", lineA: 10, lineB: 10, content: "        .ok_or(ErrorCode::MathOverflow)?;" },
    ],
    accountDiff: [
      { type: "context", lineA: 1, lineB: 1, content: "#[derive(Accounts)]" },
      { type: "context", lineA: 2, lineB: 2, content: "pub struct RouteExactIn<'info> {" },
      { type: "context", lineA: 3, lineB: 3, content: "    #[account(signer)]" },
      { type: "context", lineA: 4, lineB: 4, content: "    pub user: Signer<'info>," },
      { type: "context", lineA: 5, lineB: 5, content: "    #[account(mut)]" },
      { type: "context", lineA: 6, lineB: 6, content: "    pub in_account: Account<'info, TokenAccount>," },
      { type: "context", lineA: 7, lineB: 7, content: "    #[account(mut)]" },
      { type: "context", lineA: 8, lineB: 8, content: "    pub out_account: Account<'info, TokenAccount>," },
      { type: "context", lineA: 9, lineB: 9, content: "    pub token_program: Program<'info, Token>," },
      { type: "context", lineA: 10, lineB: 10, content: "}" },
    ],
    blastNodes: [
      { id: "user", label: "User Wallet", type: "signer", changed: false },
      { id: "in_acc", label: "Input Token Account", type: "token", changed: false },
      { id: "out_acc", label: "Output Token Account", type: "token", changed: false },
      { id: "fee_acc", label: "Fee Account", type: "token", changed: false },
      { id: "token_prog", label: "Token Program", type: "program", changed: false },
    ],
    blastEdges: [
      { from: "user", to: "in_acc", label: "sign", type: "sign" },
      { from: "in_acc", to: "out_acc", label: "route_exact_in (fee: 25bps)", type: "write" },
      { from: "in_acc", to: "fee_acc", label: "fee collection", type: "write" },
      { from: "out_acc", to: "token_prog", label: "transfer", type: "cpi" },
    ],
  },
  {
    id: "marinade",
    name: "Marinade Finance",
    programId: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
    fromSlot: 286_000_000,
    toSlot: 288_200_000,
    fromDate: "Mar 5, 2026",
    toDate: "Mar 9, 2026",
    description: "PDA seed migration to v2 naming scheme",
    riskScore: 34,
    summary: {
      critical: 0,
      high: 0,
      medium: 1,
      low: 0,
      info: 2,
      instructionsChanged: 1,
      accountsAffected: 2,
      newCpiTargets: 0,
    },
    findings: [
      {
        id: "m1",
        severity: "MEDIUM",
        code: "CHANGED_SEEDS",
        instruction: "deposit",
        description:
          "PDA seeds for `stake_account_record` changed from `[\"marinade\", user_pubkey, stake_pubkey]` to `[\"marinade-v2\", user_pubkey, stake_pubkey]`. Old records are inaccessible via the new derivation.",
        recommendation:
          "Ensure migration tooling exists for users with existing stake records under the old seed. Document the breaking change in the upgrade notes.",
        before: `seeds = [b"marinade", user.key().as_ref(), stake.key().as_ref()]`,
        after: `seeds = [b"marinade-v2", user.key().as_ref(), stake.key().as_ref()]`,
      },
      {
        id: "m2",
        severity: "INFO",
        code: "LOGIC_CHANGE",
        instruction: "liquid_unstake",
        description: "Unstaking fee recalculation refactored. Functionally equivalent, improved precision.",
        recommendation: "No action required.",
      },
    ],
    instructionDiff: [
      { type: "context", lineA: 1, lineB: 1, content: "pub fn deposit(" },
      { type: "context", lineA: 2, lineB: 2, content: "    ctx: Context<Deposit>," },
      { type: "context", lineA: 3, lineB: 3, content: "    lamports: u64," },
      { type: "context", lineA: 4, lineB: 4, content: ") -> Result<()> {" },
      { type: "context", lineA: 5, lineB: 5, content: "    let stake_record = &mut ctx.accounts.stake_account_record;" },
      { type: "removed", lineA: 6, content: `    // seeds: ["marinade", user, stake]` },
      { type: "added", lineB: 6, content: `    // seeds: ["marinade-v2", user, stake]  <- BREAKING MIGRATION` },
      { type: "context", lineA: 7, lineB: 7, content: "    stake_record.lamports = lamports;" },
      { type: "context", lineA: 8, lineB: 8, content: "    stake_record.user = ctx.accounts.user.key();" },
    ],
    accountDiff: [
      { type: "context", lineA: 1, lineB: 1, content: "#[account(" },
      { type: "context", lineA: 2, lineB: 2, content: "    init_if_needed," },
      { type: "context", lineA: 3, lineB: 3, content: "    payer = user," },
      { type: "removed", lineA: 4, content: `    seeds = [b"marinade", user.key().as_ref(), stake.key().as_ref()],` },
      { type: "added", lineB: 4, content: `    seeds = [b"marinade-v2", user.key().as_ref(), stake.key().as_ref()],` },
      { type: "context", lineA: 5, lineB: 5, content: "    bump," },
      { type: "context", lineA: 6, lineB: 6, content: ")]" },
      { type: "context", lineA: 7, lineB: 7, content: "pub stake_account_record: Account<'info, StakeAccountRecord>," },
    ],
    blastNodes: [
      { id: "user", label: "User Wallet", type: "signer", changed: false },
      { id: "old_pda", label: "Old Stake Record PDA\n[marinade, user, stake]", type: "pda", changed: false },
      { id: "new_pda", label: "New Stake Record PDA\n[marinade-v2, user, stake]", type: "pda", changed: true, risk: "MEDIUM" },
      { id: "stake_pool", label: "Stake Pool", type: "pda", changed: false },
      { id: "token_prog", label: "Token Program", type: "program", changed: false },
    ],
    blastEdges: [
      { from: "user", to: "new_pda", label: "deposit (new seed)", type: "write", isNew: true },
      { from: "old_pda", to: "new_pda", label: "seed migration required", type: "read" },
      { from: "new_pda", to: "stake_pool", label: "credit stake", type: "write" },
    ],
  },
];
