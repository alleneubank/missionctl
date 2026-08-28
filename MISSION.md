---
mission_control: 1
id: portable-typed-mission-command
title: Portable typed mission command
kind: delivery
status: active
owner: allen
rubric:
  - id: OUTCOME-001
    dimension: contract-acceptance
    criterion: Typed mission and campaign artifacts validate consistently across supported harnesses.
    measure: Schema, reducer, and cross-reference fixtures pass in the repository harness.
    floor: Every required mission kind, lifecycle state, attention transition, freshness rule, and invalid cross-reference has a passing fixture.
    evaluator: harness
    evidence_type: verifier-run
  - id: QUALITY-001
    dimension: quality-bar
    criterion: The mission-control surfaces satisfy the project quality law without conflating strategic and surface rubrics.
    measure: BRIEF.md floors and an independent severity-scaled review.
    floor: Every BRIEF.md floor passes and the review reports no major-or-higher findings.
    evaluator: harness-and-independent-oracle
    evidence_type: review-verdict
  - id: INTEGRATION-001
    dimension: integration-e2e
    criterion: CLI consumers and the Sox pilot project the same declared state from one versioned executable contract.
    measure: Cross-harness golden projection and pilot end-to-end verifier.
    floor: All consumers agree on mission kind, campaign phase, rubric state, attention, and iteration budget.
    evaluator: harness
    evidence_type: verifier-run
  - id: OPERABILITY-001
    dimension: operability
    criterion: Invalid, stale, unavailable, and legacy state is visible and actionable.
    measure: Failure-mode fixtures and command exit status.
    floor: No malformed or unavailable source passes silently; legacy campaigns remain explicitly untyped.
    evaluator: harness
    evidence_type: verifier-run
  - id: LANDING-001
    dimension: landing-readiness
    criterion: Each repository is locally green and its concrete publish boundary is named.
    measure: Repository-native validation output and a boundary handoff.
    floor: Every touched repository has current verifier evidence and no artifact is published without per-ref authorization.
    evaluator: harness-and-human-boundary
    evidence_type: boundary-disposition
  - id: ADOPTION-001
    dimension: adoption-outcome
    criterion: Typed missions improve operator attention and evidence-backed completion in real sessions.
    measure: Recall evaluation after one to two weeks of fleet use.
    floor: The post-rollout evaluation shows improved scope stability, campaign fidelity, evidence-backed done claims, gate latency, early stops, and attention identification, or records an explicit refutation and amendment.
    evaluator: recall-eval
    evidence_type: evaluation-report
    freshness: P14D
boundaries:
  - publish
  - merge-tracked-ref
  - live-secret
  - biometric-device-check
evidence:
  - rubric_id: OUTCOME-001
    campaign_id: mission-control-v1-rollout
    evaluator: harness
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T19:33:02Z
    artifact_ref: package.json#scripts.check
  - rubric_id: QUALITY-001
    campaign_id: mission-control-v1-rollout
    evaluator: harness-and-independent-oracle
    evidence_type: review-verdict
    result: passing
    timestamp: 2026-08-28T19:54:49Z
    artifact_ref: review:agent-2026-08-28-28bb69
  - rubric_id: INTEGRATION-001
    campaign_id: mission-control-v1-rollout
    evaluator: harness
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T19:33:02Z
    artifact_ref: tests/fixtures/sox-visual-pilot
  - rubric_id: OPERABILITY-001
    campaign_id: mission-control-v1-rollout
    evaluator: harness
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T19:33:02Z
    artifact_ref: tests/missionctl.test.ts
---

# Portable typed mission command

## Intended outcome

Every supported agent harness derives strategic state from committed contracts in the hierarchy `Mission → Campaign → Work unit → Evidence`. The operator can identify what needs attention without inferring importance from sessions, token activity, issue counts, age, or code volume.

## Tradeoff policy

Contract fidelity and visible degradation outrank convenience. A missing or malformed authority remains red or unknown; it never becomes an inferred pass. Mission rubrics determine strategic success, while `BRIEF.md` remains the non-duplicated quality law for the surfaces that implement the mission.

## Risks and invariants

- Rubric identifiers are append-only and evidence can affect only a named, compatible rubric item.
- Mission achievement requires current admissible evidence for every required floor; campaign completion alone has no achievement semantics.
- Unrelated mission kinds are grouped but never ranked by a synthetic score.
- Completed campaign evidence persists in the mission authority before a disposable charter dissolves.
- External mission sources carry repository URL, ref, and path; unavailable sources degrade visibly.
- Historical campaigns are not bulk-rewritten. Untyped campaigns stay visible as legacy state until deliberately adopted.

## Linked contracts

- [Mission-control specification](./SPEC.md)
- [Mission-control quality law](./BRIEF.md)

## Decisions

- 2026-08-28 — `ADOPTION-001` is evaluated by a separate post-rollout campaign, so implementation evidence cannot satisfy it. **provisional (driver)**
- 2026-08-28 — The Sox pilot's durable authority is the committed fixture at `tests/fixtures/sox-visual-pilot`; the retiring source worktree is not a release root. **ratified (human)**
- 2026-08-28 — `missionctl` is an independently versioned tool installed through mise; agent-profile owns doctrine and integration but does not vendor the executable. **ratified (human)**

## Terminal semantics

The mission is achieved only when every required rubric item has current admissible evidence. `paused` preserves the contract without active campaigns. `abandoned` records an intentional stop without manufacturing success. A campaign terminates independently as `done`, `blocked`, `budget-exhausted`, or `superseded` under its own evidence and budget.

## Boundary

Publishing, merging a deploying or otherwise tracked ref, injecting live secrets, and biometric device acceptance remain human actions. Local implementation, fixtures, deterministic device evidence capture, validation, and preparation of named artifacts remain interior work.
