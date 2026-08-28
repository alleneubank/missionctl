---
mission_control: 1
id: authentication-cutover
title: Authentication cutover
kind: operations
status: active
owner: operator
rubric:
  - { id: HEALTH-001, dimension: health, criterion: service is healthy, measure: health probes, floor: all probes green, evaluator: ops-harness, evidence_type: verifier-run }
  - { id: SAFETY-001, dimension: safety, criterion: access stays bounded, measure: policy diff, floor: no widened grant, evaluator: ops-harness, evidence_type: verifier-run }
  - { id: REVERSE-001, dimension: reversibility, criterion: rollback works, measure: rehearsal, floor: rollback inside budget, evaluator: ops-harness, evidence_type: rehearsal-run }
  - { id: OBSERVE-001, dimension: observability, criterion: failures alert, measure: alert test, floor: alerts fire, evaluator: ops-harness, evidence_type: verifier-run }
  - { id: POST-001, dimension: post-change-observation, criterion: health stays green, measure: observation window, floor: no regression, evaluator: ops-harness, evidence_type: verifier-run }
boundaries: [publish, live-secret]
evidence: []
---

# Authentication cutover
