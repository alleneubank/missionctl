---
mission_control: 1
id: robotics-transfer
title: Robotics fault-recovery transfer
kind: training
status: active
owner: trainer
rubric:
  - { id: RECALL-001, dimension: recall, criterion: learner recalls procedure, measure: closed-book quiz, floor: all safety steps named, evaluator: training-harness, evidence_type: assessment-run }
  - { id: APPLY-001, dimension: application, criterion: learner applies procedure, measure: standard scenario, floor: recovery succeeds safely, evaluator: training-harness, evidence_type: assessment-run }
  - { id: TRANSFER-001, dimension: novel-transfer, criterion: learner handles novelty, measure: unseen scenario, floor: safe recovery without hints, evaluator: blinded-evaluator, evidence_type: assessment-run }
  - { id: RETAIN-001, dimension: retention-performance, criterion: performance persists, measure: delayed repeat, floor: same floor after thirty days, evaluator: training-harness, evidence_type: assessment-run }
boundaries: [physical-robot-run]
evidence: []
---

# Robotics fault-recovery transfer
