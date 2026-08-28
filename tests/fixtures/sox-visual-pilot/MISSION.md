---
mission_control: 1
id: sox-mobile-visual-oracle
title: Trustworthy Sox mobile visual acceptance
kind: delivery
status: active
owner: allen
rubric:
  - id: OUTCOME-001
    dimension: contract-acceptance
    criterion: The declared Sox mobile acceptance pack is complete and mechanically inspectable on both supported platforms.
    measure: The Sox visual-pack verifier opens every frame required by the mobile screen oracle for iOS and Android.
    floor: All eleven required frames per platform exist, decode, have the declared dimensions, and are not blank.
    evaluator: visual-pack-pixels
    evidence_type: verifier-run
    freshness: P7D
  - id: QUALITY-001
    dimension: quality-bar
    criterion: The captured representative flow satisfies the existing platform visual laws.
    measure: A fresh-context oracle applies the Sox mobile brief, screen oracle, Apple HIG, and Material 3 to the evidence packs.
    floor: A known visual defect is rejected first; the corrected iOS and Android packs then receive no major-or-higher finding.
    evaluator: fresh-context-visual-oracle
    evidence_type: review-verdict
    freshness: P7D
  - id: INTEGRATION-001
    dimension: integration-e2e
    criterion: Mission and campaign state is projected consistently across the canonical fleet surfaces.
    measure: missionctl current, missionctl mission, missionctl statusline, and the built statusline read one final committed artifact snapshot.
    floor: Every projection agrees on delivery kind, the currently declared campaign phase, rubric floor state, attention class, and iteration budget.
    evaluator: missionctl-cross-harness
    evidence_type: verifier-run
  - id: OPERABILITY-001
    dimension: operability
    criterion: Visual evidence identifies its source, hardware class, commit, evaluator, and freshness without embedding raw logs in the campaign charter.
    measure: Campaign evidence pointers resolve to the physical-device verdicts and pixel reports plus concise verifier outputs.
    floor: Both platforms have current device evidence, failures remain visible, and raw capture output stays outside LOOP.md.
    evaluator: campaign-evidence-check
    evidence_type: verifier-run
    freshness: P7D
  - id: LANDING-001
    dimension: landing-readiness
    criterion: The pilot is locally green and publication remains a named human boundary.
    measure: Repository-native checks, independent oracle result, clean campaign handoff, and boundary disposition.
    floor: All interior floors pass and the exact unpublished artifact is presented for authorization without pushing, merging, tagging, or releasing it.
    evaluator: harness-and-human-boundary
    evidence_type: boundary-disposition
boundaries:
  - publish
  - merge-tracked-ref
  - biometric-device-check
evidence:
  - rubric_id: OUTCOME-001
    campaign_id: mobile-visual-oracle-pilot
    evaluator: visual-pack-pixels
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T18:31:57Z
    artifact_ref: evidence/device
    freshness: P7D
    conclusion: The known-defect pack failed and all four corrected eleven-frame packs passed the same verifier.
  - rubric_id: QUALITY-001
    campaign_id: mobile-visual-oracle-pilot
    evaluator: fresh-context-visual-oracle
    evidence_type: review-verdict
    result: passing
    timestamp: 2026-08-28T18:31:57Z
    artifact_ref: review:agent-2026-08-28-a54575
    freshness: P7D
    conclusion: The oracle rejected the black defect as major, opened all 22 corrected device images, and found no major-or-higher corrected defect.
  - rubric_id: OPERABILITY-001
    campaign_id: mobile-visual-oracle-pilot
    evaluator: campaign-evidence-check
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T18:31:57Z
    artifact_ref: evidence/device
    freshness: P7D
    conclusion: Evidence identifies source commit, hardware packs, evaluator artifacts, timestamps, and freshness while raw output remains outside the charter.
  - rubric_id: INTEGRATION-001
    campaign_id: mobile-visual-oracle-pilot
    evaluator: missionctl-cross-harness
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T18:44:48Z
    artifact_ref: tests/missionctl.test.ts
    conclusion: Final-state missionctl and the built statusline agree on delivery, BOUNDARY, unknown, publish, and iteration 3/6; other harnesses delegate to the same CLI contract.
---

# Sox visual-oracle mission fixture

Executable contract input for the physical-device JSON reports and terminal campaign projection.
