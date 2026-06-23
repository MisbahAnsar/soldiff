review:
  security_score: A
  quality_score: C
  findings:
    - severity: high
      category: Correctness
      description: The repo markets a full Solana CLI, SDK, and diff pipeline, but the workspace only contains a Next.js UI with static demo data. The advertised on-chain analysis flow is not implemented in this codebase.
      fix: Either add the missing core packages and runtime pipeline (CLI, fetch/decompile, diff engine, report generation) or re-scope the docs and UI to clearly label the app as a prototype/demo.
    - severity: medium
      category: Correctness
      description: The Hero and DemoSection components schedule delayed timers and intervals without cleanup, which can leave pending state updates after unmount and make the demo animations flaky.
      fix: Track timeout and interval IDs in refs and clear them in effect cleanup; cancel the staged loading work when the component unmounts or a new program is selected.
  ready_for_mainnet: false
