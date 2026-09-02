---
loop: 1
id: lifecycle-bugbash
objective: "Resolve GitHub issues #2 and #3 by making routed Decisions byte-preserving in mixed-ending standing documents and surfacing conservative paraphrase warnings before compact or close dispositions are chosen."
status: active
phase: TDD
iteration: 1
iteration_budget: 6
updated_at: 2026-09-02T01:05:13Z
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
    state: red
  - id: check
    run: npm run check
    green: Typecheck, build, and every test pass.
    state: red
  - id: review
    run: fresh-context review briefed with SPEC.md, BRIEF.md, issues 2 and 3, verifier output, and declared deferrals
    green: No major-or-higher finding against REQ-LIFE-004 and the standing brief.
    state: red
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
    state: current
  - id: U3
    title: Replace whole-document newline normalization with a section-local byte splice and preserve retry idempotence.
    targets:
      - REQ-LIFE-004
      - ISSUE-002
    state: pending
  - id: U4
    title: Annotate proposed route items with deterministic materially-similar warnings while leaving neighboring decisions unwarned.
    targets:
      - REQ-LIFE-004
      - ISSUE-003
    state: pending
  - id: U5
    title: Run the targeted and full harnesses, obtain a fresh-context review, and prepare the human boundary handoff.
    targets:
      - ISSUE-002
      - ISSUE-003
    state: pending
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
