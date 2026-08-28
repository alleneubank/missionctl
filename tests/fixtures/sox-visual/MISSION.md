---
mission_control: 1
id: sox-visual-acceptance
title: Sox visual acceptance
kind: delivery
status: active
owner: mobile
rubric:
  - { id: CONTRACT-001, dimension: contract-acceptance, criterion: frames are complete, measure: pixel verifier, floor: every frame passes, evaluator: visual-harness, evidence_type: verifier-run }
  - { id: QUALITY-001, dimension: quality-bar, criterion: flows meet platform law, measure: independent oracle, floor: no major findings, evaluator: visual-oracle, evidence_type: review-verdict }
  - { id: E2E-001, dimension: integration-e2e, criterion: both platforms agree, measure: twin comparison, floor: both packs accepted, evaluator: visual-harness, evidence_type: verifier-run }
  - { id: OPS-001, dimension: operability, criterion: evidence is attributable, measure: provenance check, floor: source and capture recorded, evaluator: visual-harness, evidence_type: verifier-run }
  - { id: LAND-001, dimension: landing-readiness, criterion: pilot is ready, measure: ship gate, floor: gate passes, evaluator: visual-harness, evidence_type: verifier-run }
boundaries: [publish, biometric-device-check]
evidence: []
---

# Sox visual acceptance
