---
mission_control: 1
mission_id: sox-mobile-visual-oracle
campaign_id: mobile-visual-oracle-pilot
objective: Prove the typed visual acceptance loop on the representative iOS and Android flow, red-first, and project its evidence through missionctl and the statusline.
status: done
phase: BOUNDARY
iteration: 3
iteration_budget: 6
targets:
  - OUTCOME-001
  - QUALITY-001
  - INTEGRATION-001
  - OPERABILITY-001
  - LANDING-001
attention: publish
next_action: Review the committed pilot fixture and authorize any desired publication separately.
updated_at: 2026-08-28T18:44:48Z
head: 672beedf5c078c57ae613803f5cc2e6724ce9a0f
review_capacity:
  measure: one complete cross-platform eleven-frame evidence pair
  limit: one independent red-and-green visual verdict in this campaign
evidence:
  - rubric_id: OUTCOME-001
    evaluator: visual-pack-pixels
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T18:31:57Z
    artifact_ref: evidence/device
    freshness: P7D
    conclusion: The known-defect pack failed and all four corrected eleven-frame packs passed the same verifier.
  - rubric_id: QUALITY-001
    evaluator: fresh-context-visual-oracle
    evidence_type: review-verdict
    result: passing
    timestamp: 2026-08-28T18:31:57Z
    artifact_ref: review:agent-2026-08-28-a54575
    freshness: P7D
    conclusion: The oracle rejected the defect, opened all 22 corrected device images, and reported no major-or-higher corrected finding.
  - rubric_id: OPERABILITY-001
    evaluator: campaign-evidence-check
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T18:31:57Z
    artifact_ref: evidence/device
    freshness: P7D
    conclusion: Evidence pointers bind the verdict to current source and physical-device captures without charter log accumulation.
  - rubric_id: INTEGRATION-001
    evaluator: missionctl-cross-harness
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T18:44:48Z
    artifact_ref: tests/missionctl.test.ts
    conclusion: Final-state missionctl and the built statusline agree on delivery, BOUNDARY, unknown, publish, and iteration 3/6; other harnesses delegate to the same CLI contract.
---

# Sox visual-oracle campaign fixture

Executable terminal-state input; campaign history remains in git, not this fixture body.
