---
loop: 1
id: loop-first-redesign
objective: Replace the required MISSION.md evidence-ledger design with a standalone, compact LOOP.md contract and agent-driven compact/close transitions.
status: done
phase: BOUNDARY
iteration: 8
iteration_budget: 8
updated_at: 2026-08-29T21:40:00Z
mission:
  id: mission-control-arc
targets:
  spec:
    - REQ-LOOP-001
    - REQ-LOOP-003
    - REQ-CTX-001
    - REQ-LIFE-001
    - REQ-LIFE-003
    - REQ-LEGACY-002
    - REQ-HOOK-001
  brief:
    - Grammar fidelity
    - Lossless transitions
    - Degraded-state honesty
  mission:
    - CONTRACT-001
gates:
  - id: check
    run: npm run check
    green: typecheck, build, and every test pass
    state: green
  - id: package
    run: ./packaging/package-release.sh
    green: one root executable archive with a matching SHA-256 sidecar
    state: green
  - id: review
    run: rl review (fresh-context, briefed with SPEC.md and BRIEF.md)
    green: no major-or-higher finding
    state: green
units:
  - id: U4
    title: "Independent review gate, then amend the commit and PR #1"
    state: done
  - id: U5
    title: Dogfood the real transitions on real loops (compact this loop; close agent-profile, agent-statusline, codex) and file what falls out
    state: done
  - id: U6
    title: "Follow-up: appendDecisions homogenizes a standing doc with mixed line endings (review round 8, minor; REQ-LIFE-004)"
    state: deferred
  - id: U7
    title: "Follow-up: compact/close prepare should flag a decision whose paraphrase already sits in the target ## Decisions (verbatim dedupe missed one during dogfood)"
    state: deferred
decisions: []
blockers: []
boundary:
  - publish
  - merge-tracked-ref
  - release-tag
---

# Loop: LOOP-first redesign — `feat/typed-mission-control`

## State

- Review round 8 (claude provider, fresh context, briefed): one minor finding, no major; gate green at its floor. Filed as U6.
- Dogfood: this loop compacted (U1–U3 and the review narrative dropped, four design decisions routed to SPEC.md); agent-profile, agent-statusline, and codex loops closed through `close apply` with CONSUMERS-001 left `open` until the contract lands. Near-duplicate routing found and filed as U7.
- At the boundary: force-push `feat/typed-mission-control`, refresh PR #1, merge, tag `v0.1.0-rc.2`, pin dotfiles #12, push the consumer branches (codex needs a force-push). All the human's.
