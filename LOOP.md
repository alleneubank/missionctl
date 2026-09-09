---
loop: 1
id: remove-statusline-20260909
objective: Retire missionctl statusline while preserving machine context, lifecycle operations, and SessionStart injection; prepare local commits and evidence for the rollout driver.
status: done
phase: BOUNDARY
iteration: 6
iteration_budget: 6
updated_at: 2026-09-09T16:44:36Z
targets:
  spec: [REQ-CTX-001, REQ-CTX-003, REQ-LOOP-005, REQ-LOOP-006, REQ-LIFE-001, REQ-LIFE-003, REQ-LEGACY-001, REQ-LEGACY-002, REQ-HOOK-001, REQ-HOOK-002, REQ-ACTION-001]
  brief: [Bounded projection, Degraded-state honesty, Lossless transitions, Portability, Adapter parity, Reviewability]
gates:
  - id: removal
    run: npm test -- tests/missionctl.test.ts -t 'removed command'
    green: Removed-command refusal and help absence are observed red at base and green after removal.
    state: green
  - id: objective
    run: npm run check
    green: Typecheck, CLI and action build, and every vitest test pass on the candidate.
    state: green
  - id: compatibility
    run: node /Users/allen/.handoffs/statusline-assignments-20260909/missionctl/compatibility.mjs
    green: Baseline and candidate context, check, inspect, lifecycle previews, and SessionStart outputs and read-only file snapshots match on isolated fixtures.
    state: green
  - id: specialist
    run: Fresh native specialist executes the task artifact compatibility-review charter.
    green: One compatibility review plus at most one finding-confirmation round reports no major-or-higher contract regression.
    state: green
  - id: bugbash
    run: Fresh native participant executes the task artifact CLI-bugbash charter against dist/missionctl.
    green: All eight public CLI and SessionStart operator tasks complete without major-or-higher findings on the candidate artifact.
    state: green
units:
  - id: U1
    title: Declare QA design, build the base, and capture preservation baselines.
    targets: [REQ-CTX-001, REQ-LOOP-005, REQ-HOOK-001]
    state: done
  - id: U2
    title: Observe removed-command regression checks red and preserve shared context assertions.
    targets: [REQ-CTX-003, REQ-LOOP-006]
    state: done
  - id: U3
    title: Remove command and rendering, amend approved contracts, regenerate action, and pass focused checks.
    targets: [REQ-CTX-001, REQ-CTX-003, REQ-ACTION-001]
    state: done
  - id: U4
    title: Pass the full harness and assembled baseline comparison, binding evidence to source and bundle digests.
    targets: [REQ-LOOP-005, REQ-LOOP-006, REQ-LIFE-001, REQ-HOOK-001, REQ-HOOK-002]
    state: done
  - id: U5
    title: Complete bounded fresh compatibility review and confirm any fixes with affected verifiers.
    targets: [REQ-CTX-001, REQ-CTX-003, REQ-LIFE-003]
    state: done
  - id: U6
    title: Complete fresh task-based CLI bug bash, bind final evidence, and close or report an honest terminal handoff.
    targets: [REQ-LEGACY-001, REQ-LEGACY-002, REQ-LIFE-001, REQ-LIFE-003, REQ-HOOK-001]
    state: done
decisions: []
blockers: []
boundary: [publish, push, pull-request, merge, tag, install, release, sibling-repository-edits, operator-plugin-or-Sox-mutation, cross-repository-rollout]
---

# Loop: retire missionctl statusline

## Contract and QA design

The operator authorized this removal and local commits in the assigned worktree at base 68aa4135fcc8dfbd944be77017604d08896a4fac. REQ-CTX-002 is retired, REQ-CTX-003 retains context behavior, and unrelated requirement IDs and contracts remain unchanged. No toggle, stub, overlay, timeout change, installation, or shared process is part of the campaign. Historical fixture content remains classification input.

| Risk | Evidence | Reason |
|---|---|---|
| Removed command still dispatches or appears in help | Public CLI refusal/help tests, observed red before source change | Directly exercises parser and assembled executable |
| Surviving JSON, text, exit status or file effects change | Existing golden/lifecycle tests plus byte-exact base/candidate comparison over valid, invalid, absent and legacy fixtures | Objective contract equality detects accidental compatibility drift |
| Generated action retains old behavior | Regenerate through npm run build:action; bundle-parity test in npm run check | Tests shipped bytes against source generation |
| Approved public CLI removal unintentionally retires another contract | Fresh specialist, major blocking floor, one review and one finding-confirmation maximum | Named high-risk CLI compatibility gate, complementary to execution |
| Assembled CLI or SessionStart path fails operator tasks | Fresh participant, eight-task charter, major blocking floor | Uses public entry points without author reasoning or installed plugin changes |

The plan is the six units above; each unit is one substantive iteration. Files in scope are src/missionctl.ts, src/loop/context.ts, tests/missionctl.test.ts, tests/legacy.test.ts, README.md, SPEC.md, BRIEF.md, generated action/index.js, and this branch-local loop. Existing hook, lifecycle and action tests remain gates. Evidence and gate charters live under /Users/allen/.handoffs/statusline-assignments-20260909/missionctl; launcher-owned receipts, transcripts and .lane-state are untouched.

## Terminal contract

Done requires all five gates green on the current artifact and all six units complete; missionctl close then removes this branch-local loop through explicit dispositions. Blocked retains the loop with missing-gate evidence and a proposed driver action. Budget-exhausted retains it after six iterations with required work outstanding, or after three iterations without unit/gate progress. Superseded names the replacement and closes through explicit dispositions. No wall-clock worker deadline is imposed. Cross-repository installation and renderer integration are driver boundary work, not a local done claim.

## State

Iteration 6 completed the fresh native CLI/SessionStart operator gate: green, 8/8 tasks, 103 invocations, 45/45 assessments, no findings or unexpected file effects (CLI-bugbash.md and cli-bugbash-native evidence). The executor independently matched source/CLI/action hashes before and after at 2413751d31d2a69de69a39bd9585cfdbd9ba8dd4. All five gates are green on the same product artifact; every unit is complete within the six-iteration budget. evidence.md records the red/green checks, 159-test full harness, 123 exact baseline comparisons, specialist verdict and task gate. This terminal loop is validated and committed before missionctl close; its execution notes have no additional durable law to route. driver-next-action.md carries the external renderer-first installation and integration boundary, which remains unexecuted here.
