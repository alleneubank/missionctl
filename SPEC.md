# Typed mission and campaign operating system

## Problem and solution

Fleet activity is not a strategic contract. Sessions, tokens, issue counts, age, and diff size cannot say whether an enduring outcome is green or what a human must do next. Existing `LOOP.md` files also accumulate enduring intent, successive attempts, and iteration logs into one unbounded artifact.

The solution is a committed typed hierarchy: `Mission → Campaign → Work unit → Evidence`. `MISSION.md` owns the measurable outcome and strategic rubric. One `LOOP.md` owns exactly one bounded campaign and targets named rubric identifiers. Evidence reducers update only compatible rubric items, and every consumer projects the same state.

## Domain model

### Mission

A mission is a finite, enduring outcome with schema version `mission_control: 1`, stable identity, title, kind, lifecycle state, owner, rubric, boundaries, and durable evidence. Mission kinds are `delivery`, `operations`, `research`, `maintenance`, `administrative`, and `training`. States are `draft`, `active`, `paused`, `achieved`, and `abandoned`.

Every rubric item has an append-only identifier, dimension, criterion, measure, floor, evaluator, and admissible evidence type. Optional ISO-8601 freshness durations make old evidence stale. Evidence states are `unknown`, `failing`, `passing`, `waived`, and `stale`; there is no universal numeric score.

Kinds require these dimensions:

| Kind | Required dimensions |
|---|---|
| delivery | contract-acceptance, quality-bar, integration-e2e, operability, landing-readiness |
| operations | health, safety, reversibility, observability, post-change-observation |
| research | question-resolution, evidence-quality, alternative-explanations, reproducibility, decision-usefulness |
| maintenance | bounded-inventory, closure-evidence, regression-prevention, recurrence-reduction |
| administrative | outcome-artifact, dependency-deadline-state, privacy-compliance, required-approval |
| training | recall, application, novel-transfer, retention-performance |

Durable mission evidence records rubric ID, campaign ID, evaluator identity, evidence type, result, timestamp, commit or artifact reference, and optional freshness duration. Only `passing`, `failing`, or `waived` are stored results; `unknown` and `stale` are reducer projections.

### Campaign

A campaign has schema version, mission identity, optional external mission source (`repository`, `ref`, `path`), campaign identity, objective, state, phase, iteration and budget, target rubric IDs, attention class, next action, timestamps, source head, review capacity, and current evidence. States are `planned`, `active`, `waiting`, `blocked`, `done`, `budget-exhausted`, and `superseded`. Research campaigns may close as `confirmed`, `refuted`, or `inconclusive`; those conclusions do not change the meaning of `done`.

Attention classes are `decide`, `review`, `publish`, `watch`, `recover`, and `none`. Explicit campaign attention is validated against state and evidence; the reducer never derives strategic priority. One campaign targets only declared mission rubric IDs, and adjacent work advances none unless a mission invariant or safety requirement names it.

### Work unit and evidence

The Markdown `Work plan` carries ordered work units. Frontmatter evidence points to executable machine-readable artifacts or immutable external results; test output, review history, and rollout narration remain in CI, the pull request, and git rather than prose sidecars. Before a completed charter dissolves, admissible evidence is copied into the parent mission so multiple campaigns advance one mission without merging journals.

## Requirements

- REQ-MC-001 — `MISSION.md` validation enforces schema version, mission kind/state, required kind dimensions, unique append-only-shaped rubric IDs, evaluator/evidence declarations, boundaries, ISO time contracts, and evidence compatibility.
- REQ-MC-002 — `LOOP.md` validation enforces one campaign, campaign state, phase, positive bounded iteration budget, iteration within budget, targets, attention consistency, review capacity, external source shape, evidence compatibility, and research conclusion semantics.
- REQ-MC-003 — The reducer projects each required rubric item as `unknown`, `failing`, `passing`, `waived`, or `stale`; only admissible evidence for the exact rubric ID affects state, newest admissible evidence wins, and expired evidence cannot keep a floor green.
- REQ-MC-004 — Campaign completion updates only targeted rubric IDs. Multiple campaign evidence records may advance one mission without merging their journals or making completion imply achievement.
- REQ-MC-005 — `missionctl current` prints the active campaign and parent mission; `mission` prints the enduring rubric even when no campaign charter remains; `portfolio` groups first by attention and then kind; `check` validates schemas, links, IDs, freshness, and consistency; `drill` emits deterministic rehearsal scenarios.
- REQ-MC-006 — Stable text and JSON output preserve mission ID, kind, campaign ID, phase, rubric gaps, attention, and iteration budget. Unrelated mission kinds are never compared through a synthetic score.
- REQ-MC-007 — `portfolio` shows untyped legacy campaigns separately. Missing, malformed, or unavailable external sources remain visible and do not pass validation.
- REQ-MC-008 — `missionctl statusline` emits the compact canonical projection consumed by statusline integrations, and `missionctl prompt` generates canonical resume, decision-review, handoff, and landing prompts.
- REQ-MC-009 — `missionctl --version` matches `package.json`; release packaging emits one platform-independent archive containing only the root `missionctl` executable plus a matching SHA-256 sidecar. The executable supports Node.js 20 or newer and bundles its YAML parser.
- REQ-MC-010 — Codex, Claude, Pi, Sox, and statusline consumers derive their projection from canonical `missionctl` output rather than reimplementing the reducer. Structured consumers use the stable JSON contract; direct human pass-through surfaces may render stable text verbatim.
- REQ-MC-011 — The Sox fixture connects a committed `MISSION.md` rubric through one terminal campaign, captured device JSON, a fresh independent visual-oracle reference, and fleet/statusline projection without retaining rollout narration.

## Invariants

- Artifact files are the authority; no hidden mission database becomes authoritative.
- Rubric IDs are append-only and evidence is referentially valid and type-compatible.
- Mission achievement is never inferred from campaign activity or status.
- `waiting` and `blocked` remain distinct, as do campaign completion and research conclusion.
- Numeric progress exists only when a mission defines a meaningful numerator and denominator.
- External source failure is explicit and fail-closed for `check`.
- Existing VISION, SPEC, and BRIEF content is linked rather than copied.
- Historical untyped campaigns remain unmodified until deliberately adopted.

## Non-goals

- Universal WIP, PR-size, issue-count, or effort-allocation limits.
- Bulk rewriting historical campaign artifacts.
- A global mission priority score or ranking across unrelated kinds.
- Publishing, merging, releasing, injecting live secrets, or performing biometric acceptance without the named boundary authorization.

## Risk tags

- **High risk — schema contract:** committed artifact schema becomes a cross-harness public contract. The user's implementation request authorizes this planned v1 contract; incompatible later revisions require a version bump.
- **High risk — CLI contract:** JSON output is a public consumer interface. Golden contract tests gate every change.
- **High risk — release contract:** mise installs the GitHub release archive by executable name and checksum. Package version, tag, archive shape, and checksum are verified independently before publication.

## Acceptance criteria

- [ ] Every mission kind, mission/campaign state, attention transition, freshness boundary, evidence compatibility rule, and invalid cross-reference has an observed-red then passing test.
- [ ] Representative delivery, operations/auth-live-change, research/prototype, maintenance, and robotics-training fixtures validate.
- [ ] Tests prove incompatible or stale evidence cannot keep a rubric green, completion updates only targets, waiting differs from blocked, and two campaigns do not merge journals.
- [ ] `missionctl current|mission|portfolio|check|drill|statusline|prompt` text and JSON contracts pass.
- [ ] `missionctl mission` evaluates promoted evidence after a terminal `LOOP.md` dissolves.
- [ ] Codex, Claude, Pi, statusline, and Sox projections match the canonical golden.
- [ ] The Sox fixture validates physical-device verdict/pixel JSON and a fresh independent-oracle reference without prose evidence sidecars.
- [ ] `missionctl --version`, the one-executable archive, and its SHA-256 sidecar match the package release version.

## Decisions

- 2026-08-28 — The supplied plan is the ratified requirements source for schema v1 and the CLI command set. **ratified (human)**
- 2026-08-28 — Durable evidence lives in `MISSION.md`; active campaign evidence lives in `LOOP.md` and is promoted before charter dissolution. **provisional (driver)**
- 2026-08-28 — Consumer integrations shell out to canonical `missionctl` output to prevent reducer drift. Structured consumers use JSON; direct human pass-through surfaces may preserve the CLI's stable text verbatim. **provisional (driver)**
- 2026-08-28 — ISO-8601 timestamps and durations are the serialized time contract; evaluators receive an injected clock so fixtures remain deterministic. **provisional (driver)**
- 2026-08-28 — The executable bundles the YAML parser so artifact authors use standard YAML without adding a runtime installation dependency. **provisional (driver)**
- 2026-08-28 — The tool is independently versioned and distributed as a GitHub release for mise; agent-profile remains a doctrine and integration consumer. **ratified (human)**
