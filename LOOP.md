---
loop: 1
id: discovery-bugbash
objective: "Resolve GitHub issues #4, #5, and #6 by keeping campaign discovery bounded and deterministic in file-heavy repositories, around repo-local Zig caches, and around unrelated dangling symlinks without hiding broken contract artifacts."
status: active
phase: BOUNDARY
iteration: 7
iteration_budget: 8
updated_at: 2026-09-02T01:00:50Z
mission:
  id: mission-control-arc
targets:
  spec:
    - REQ-MISSION-001
  brief:
    - Bounded projection
    - Degraded-state honesty
  mission:
    - ISSUE-004
    - ISSUE-005
    - ISSUE-006
gates:
  - id: discovery
    run: npm run build && npm test -- tests/missionctl.test.ts
    green: The discovery regression scenarios pass, including file-heavy and ignored-cache success, the unignored-directory bound, unrelated-symlink tolerance, and broken-contract failures.
    state: green
  - id: check
    run: npm run check
    green: Typecheck, build, and every test pass.
    state: green
  - id: review
    run: rl review (fresh-context, briefed with SPEC.md, BRIEF.md, issues 4 through 6, verifier output, and declared deferrals)
    green: No major-or-higher finding against the discovery acceptance criteria and standing brief.
    state: green
units:
  - id: U1
    title: "Codify issues #4, #5, and #6 as discovery requirements and an observable test matrix in SPEC.md."
    targets:
      - REQ-MISSION-001
      - ISSUE-004
      - ISSUE-005
      - ISSUE-006
    state: done
  - id: U2
    title: "Add hermetic discovery fixtures and tests; observe the expected pre-fix red for issues #5 and #6 and probe issue #4 without manufacturing a failure."
    targets:
      - REQ-MISSION-001
      - ISSUE-004
      - ISSUE-005
      - ISSUE-006
    state: done
  - id: U3
    title: "Fix issues #5 and #6 by pruning .zig-global-cache and bounding entered directories at 10000 without counting files or symlinks."
    targets:
      - REQ-MISSION-001
      - ISSUE-005
      - ISSUE-006
    state: done
  - id: U4
    title: "Close any issue #4 behavior gap exposed by the fixtures while preserving deterministic ordering, the 10000-directory bound, and visible broken artifacts."
    targets:
      - REQ-MISSION-001
      - ISSUE-004
    state: done
  - id: U5
    title: Run the full harness and one fresh-context review, fix major findings within one re-review round, and prepare the human boundary handoff.
    targets:
      - ISSUE-004
      - ISSUE-005
      - ISSUE-006
    state: done
  - id: U6
    title: "Human boundary: publish the reviewed branch, merge the tracked ref, and close GitHub issues #4 through #6 before campaign closure."
    targets:
      - ISSUE-004
      - ISSUE-005
      - ISSUE-006
    state: current
decisions:
  - date: 2026-09-01
    call: The bugbash runs as subsystem campaigns; discovery issues 4 through 6 precede the separate lifecycle campaign for issues 2 and 3.
    status: provisional
  - date: 2026-09-02
    call: Review capacity extends through one final iteration-6 verdict because successive below-floor findings exposed distinct verifier and contract gaps; no further fix-up round exists within this campaign budget.
    status: provisional
  - date: 2026-09-02
    call: The attended instruction to execute the mission to completion extends the agent-authored budget from 6 to 8 solely for discriminating discovery fixtures, corrected diagnostics, one final review, and terminal writeback.
    status: ratified
blockers: []
boundary:
  - publish
  - merge-tracked-ref
  - release-tag
---

# Loop: discovery bugbash — `fix/discovery-bugbash-4-6`

## State

- Iteration 7 terminal review evidence: the structured `rl` route became unavailable after the configured Claude reviewer lost authorization and the Codex reviewer rungs exhausted capacity. The fail-closed fallback was a fresh-context, disinterested in-session reviewer briefed with the discovery contract, issue acceptance, verifier evidence, and diff. It approved commit `1cd90261ea6e8f7ae90ddbcc3493dc02c380b8f0` with no major-or-higher findings after independently running typecheck, the 48/48 targeted gate, the 135/135 full suite, and `git diff --check`; its sole minor finding was the stale `1000-entry` wording in U4, corrected in this terminal writeback.
- Iteration 7 fix evidence: the file-heavy and ignored-cache fixtures each exceed 10000 entries. Removing `.zig-global-cache` from the ignore set made the focused cache test fail at the expected mission exit-status assertion; restoring it yields 48/48 targeted tests and `npm run check` yields 135/135 tests. The unreadable-campaign diagnostic now describes the actual unreadable target condition.
- Iteration 6 review evidence: structured review job `review-1788309529327-fhe6oy` found one major verifier gap and one minor diagnostic mismatch. The file-heavy and ignored-cache fixtures now exceed the 10000-directory bound, so they discriminate both fixes; the unreadable-campaign message now states that the symlink target is not a readable loop file. The attended completion order extends the agent-authored budget to 8, with iteration 8 reserved for terminal writeback.
- Iteration 5 review evidence: structured review job `review-1788308489714-3tt2u7` found two minor contract inconsistencies and no major-or-higher finding. Normal commands now preserve strict `LOOP.md` precedence while `adopt` has an explicit readable-source evaluation path; mission discovery accepts an exact loop symlink only when its target is a readable file and never descends through symlink directories. The touched suites pass 64/64 and `npm run check` passes 135/135 tests.
- Iteration 4 re-review evidence: structured review job `review-1788307696526-62ehm1` found no major-or-higher production defect and one minor verifier defect: unrelated symlinks were created in a temp fixture, but `check` and `inspect` targeted the pristine fixture. Both now target the temp loop and a dangling symlink lives in that loop directory. The targeted gate passes 46/46 and `npm run check` passes 133/133 tests.
- Iteration 3 review evidence: structured review job `review-1788306847250-pnyduc` rejected commit `f68f6a7` with one major and two minor findings. The fix-up guards dangling external mission sources before `realpathSync`, reports discovered `LOOP.md` symlinks as `mission.campaign-unreadable`, and limits unreadable wrapping to `readFileSync`. New regressions pass in the 46-test targeted suite; `npm run check` passes typecheck, build, and 133/133 tests across 8 files.
- Iteration 2 implementation evidence: the targeted discovery gate passed 44/44 tests. The first `npm run check` found an adoption regression where a dangling primary target masked a readable legacy fallback; readable candidates now win before an unreadable exact entry is surfaced. The rerun passed typecheck, build, and 131/131 tests across 8 files.
- Iteration 1 TDD evidence: `npm run build && npm test -- tests/missionctl.test.ts` ran 44 tests with 7 expected failures. File-heavy, ignored-cache, and below-bound directory trees tripped the old entry counter; the bound message still named 1000 entries; dangling loop contracts passed as absent; and a dangling mission contract returned no `mission.unreadable` issue. Unrelated dangling symlinks passed.
- Live kickoff snapshot: `alleneubank/missionctl` has five open issues, numbered 2 through 6; no issue has dependency metadata, an assignee, or a milestone.
- This campaign covers only discovery issues 4 through 6. Mission rubric items ISSUE-002 and ISSUE-003 reserve the later lifecycle campaign without pulling it into this loop.
- Base is `main` at `2ad26e3`; the tree was clean before the mission and loop artifacts were authored. Nothing has been pushed.
- Review capacity is exhausted after one final iteration-7 review. Iteration 8 is reserved for terminal writeback only; any new blocking finding ends the campaign `budget-exhausted`.

## Test strategy

- Contract integration: exercise the built CLI against hermetic filesystem fixtures through `mission`, `check`, and `inspect`; assert exit status, stable issue codes, and discovered campaign identities rather than internal traversal calls.
- Boundary coverage: prove ordinary files do not spend the budget, ignored descendants are never entered, and more than 10000 entered directories still fail closed.
- Symlink coverage: distinguish unrelated dangling file and directory symlinks from dangling `LOOP.md` and `.mission/mission.yaml` contract artifacts.

## Test matrix

| ID | Scenario | Expected |
|---|---|---|
| DISC-01 | Valid mission and loop with more than 10000 directories under `.zig-global-cache` | `mission --json` succeeds and discovers the loop. |
| DISC-02 | Valid mission and loop with more than 10000 genuinely unignored directories | `mission --json` fails with `mission.discovery-bounded` while retaining campaigns found before the bound. |
| DISC-03 | Valid artifacts plus unrelated dangling file and directory symlinks | `check`, `inspect`, and `mission` resolve the real artifacts without following the links. |
| DISC-04 | `LOOP.md` or `.mission/mission.yaml` is a dangling symlink | The relevant command fails visibly; unrelated-link tolerance never converts the broken contract into absence or success. |
| DISC-05 | Valid mission and loop plus more than 10000 ordinary source files | `mission --json` succeeds and discovers the loop. |

## Known pre-existing failures — do not chase

- None recorded; any waiver requires a base-commit reproduction and cited output.
