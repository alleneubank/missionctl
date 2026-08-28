---
mission_control: 1
id: stale-worktree-maintenance
title: Stale worktree maintenance
kind: maintenance
status: active
owner: maintainer
rubric:
  - { id: INVENTORY-001, dimension: bounded-inventory, criterion: inventory is finite, measure: worktree list, floor: every candidate classified, evaluator: maintenance-harness, evidence_type: verifier-run }
  - { id: CLOSURE-001, dimension: closure-evidence, criterion: stale entries close, measure: post-clean list, floor: no classified stale entry remains, evaluator: maintenance-harness, evidence_type: verifier-run }
  - { id: REGRESSION-001, dimension: regression-prevention, criterion: unsafe deletion is prevented, measure: dry-run test, floor: live entries survive, evaluator: maintenance-harness, evidence_type: verifier-run }
  - { id: RECURRENCE-001, dimension: recurrence-reduction, criterion: stale growth slows, measure: follow-up inventory, floor: no repeated orphan class, evaluator: maintenance-harness, evidence_type: verifier-run }
boundaries: [delete-remote-ref]
evidence: []
---

# Stale worktree maintenance
