---
loop: 1
id: lifecycle-bugbash
objective: "Resolve GitHub issues #2 and #3 by making routed Decisions byte-preserving in mixed-ending standing documents and surfacing conservative paraphrase warnings before compact or close dispositions are chosen."
status: active
phase: BOUNDARY
iteration: 4
iteration_budget: 6
updated_at: 2026-09-02T01:14:01Z
mission:
  id: mission-control-arc
targets:
  spec:
    - REQ-LIFE-004
  brief:
    - Lossless transitions
    - Reviewability
  mission:
    - ISSUE-002
    - ISSUE-003
gates:
  - id: lifecycle
    run: npm run build && npm test -- tests/lifecycle.test.ts
    green: Mixed-ending routing preserves every byte outside the Decisions insertion, and compact plus close preparation emit only the specified similarity warnings.
    state: green
  - id: check
    run: npm run check
    green: Typecheck, build, and every test pass.
    state: green
  - id: review
    run: fresh-context review briefed with SPEC.md, BRIEF.md, issues 2 and 3, verifier output, and declared deferrals
    green: No major-or-higher finding against REQ-LIFE-004 and the standing brief.
    state: green
units:
  - id: U1
    title: "Codify issues #2 and #3 as byte-splice and conservative-similarity contracts with an observable test matrix."
    targets:
      - REQ-LIFE-004
      - ISSUE-002
      - ISSUE-003
    state: done
  - id: U2
    title: Add mixed-ending and paraphrase-warning regressions and observe them fail against the pre-fix implementation.
    targets:
      - REQ-LIFE-004
      - ISSUE-002
      - ISSUE-003
    state: done
  - id: U3
    title: Replace whole-document newline normalization with a section-local byte splice and preserve retry idempotence.
    targets:
      - REQ-LIFE-004
      - ISSUE-002
    state: done
  - id: U4
    title: Annotate proposed route items with deterministic materially-similar warnings while leaving neighboring decisions unwarned.
    targets:
      - REQ-LIFE-004
      - ISSUE-003
    state: done
  - id: U5
    title: Run the targeted and full harnesses, obtain a fresh-context review, and prepare the human boundary handoff.
    targets:
      - ISSUE-002
      - ISSUE-003
    state: done
  - id: U6
    title: "Human boundary: publish the reviewed branch, merge the tracked ref, and close GitHub issues #2 and #3 before campaign closure."
    targets:
      - ISSUE-002
      - ISSUE-003
    state: current
decisions:
  - date: 2026-09-02
    call: Similarity warnings use a conservative four-token and eighty-percent smaller-set containment floor so a shared domain noun cannot manufacture a warning.
    status: provisional
  - date: 2026-09-02
    call: The attended instruction executes the mission's reserved lifecycle campaign to interior green while publication, tracked-ref merge, and GitHub issue closure remain human boundaries.
    status: ratified
blockers: []
boundary:
  - publish
  - merge-tracked-ref
  - close-github-issues
---

# Loop: lifecycle bugbash — `fix/discovery-bugbash-4-6`

## State

- Iteration 3 review evidence: a fresh-context, disinterested reviewer approved commit `4cfbbc1a9866bec82833bc85037424cf6ea772c8` with no major-or-higher findings. The reviewer independently passed typecheck, 27/27 lifecycle tests, the 138/138 full harness, lifecycle `check`/`context`, and worktree plus commit-range diff checks; it confirmed byte-splice preservation, exact-entry idempotence, conservative compact/close warnings, text rendering, and unchanged disposition semantics.
- Iteration 3 full-harness evidence: `npm run check` passed typecheck, build, and 138/138 tests across eight files. The lifecycle suite contributes 27/27 passing cases; the existing discovery suite remains 48/48 green.
- Iteration 2 implementation evidence: routing now locates the exact Decisions section on preserved source lines and splices entries with that section's terminator, without normalizing any existing byte. Proposed route items scan only the exact target section and carry advisory warnings at the four-token/eighty-percent floor; compact text renders the same warning. After correcting the close fixture to seed its actual SPEC target, the lifecycle gate passes 27/27 tests.
- Iteration 1 TDD evidence: `npm run build && npm test -- tests/lifecycle.test.ts` ran 27 tests with exactly three expected failures. The mixed-ending apply rewrote every LF after the initial CRLF to CRLF; compact and close prepare returned no `warnings` for their paraphrased standing decisions. The other 24 lifecycle tests passed.
- SPEC/PLAN gate: REQ-LIFE-004 now fixes the byte-splice rule, additive warning surface, deterministic similarity threshold, and false-positive boundary. GitHub issue #3 supplies the requested `route.similar-entry` warning contract; the attended mission instruction authorizes its implementation while the loop retains publication and issue closure as boundaries.
- Discovery campaign `discovery-bugbash` is independently approved at its human boundary on commit `cb9268edef3f270a5ea415ac0e8653ce4594fd7f`.
- Live GitHub issue #2 reports that `appendDecisions` normalizes an entire mixed-ending standing document; issue #3 reports that `prepare` silently proposes routing when a paraphrased durable decision already exists.
- The lifecycle plan JSON change is additive: only proposed route items with a match gain an optional `warnings` list. Validation and explicit disposition semantics remain unchanged.

## Test strategy

- Byte preservation: build a mixed document whose first line is CRLF and whose Decisions section is LF, route one decision, and compare exact prefix/suffix bytes around the inserted line.
- Similarity: exercise both `compact prepare` and `close prepare` through the built CLI, assert the stable `route.similar-entry` warning on the matching item in JSON and text, and prove a neighboring decision below either threshold is not warned.
- Retry safety: retain the exact-entry idempotence regression and the all-CRLF routing regression.

## Test matrix

| ID | Scenario | Expected |
|---|---|---|
| LIFE-01 | First standing-doc line is CRLF; Decisions section and remaining document are LF | Routing inserts LF bytes inside Decisions and preserves every pre-existing byte elsewhere. |
| LIFE-02 | Proposed SPEC route paraphrases an existing exact Decisions entry | Both compact and close prepare attach `route.similar-entry` to that decision item and render it in text. |
| LIFE-03 | Existing neighboring decision shares fewer than four meaningful tokens or less than 80% containment | Prepare emits no similarity warning. |
| LIFE-04 | Exact routed entry already exists | Apply remains idempotent and appends nothing. |

## Known pre-existing failures — do not chase

- None recorded; any waiver requires a base-commit reproduction and cited output.
