---
mission_control: 1
id: codex-mission-surface
title: Codex mission surface
kind: delivery
status: active
owner: codex
rubric:
  - { id: CONTRACT-001, dimension: contract-acceptance, criterion: command works, measure: integration test, floor: all actions pass, evaluator: codex-harness, evidence_type: verifier-run, freshness: P7D }
  - { id: QUALITY-001, dimension: quality-bar, criterion: output is legible, measure: snapshot, floor: approved snapshot, evaluator: codex-harness, evidence_type: verifier-run }
  - { id: E2E-001, dimension: integration-e2e, criterion: canonical CLI is used, measure: command spy, floor: exact argv, evaluator: codex-harness, evidence_type: verifier-run }
  - { id: OPS-001, dimension: operability, criterion: failures are visible, measure: error tests, floor: every failure surfaces, evaluator: codex-harness, evidence_type: verifier-run }
  - { id: LAND-001, dimension: landing-readiness, criterion: branch is ready, measure: repository gate, floor: gate passes, evaluator: codex-harness, evidence_type: verifier-run }
boundaries: [publish]
evidence:
  - { rubric_id: CONTRACT-001, campaign_id: codex-slash-command, evaluator: codex-harness, evidence_type: verifier-run, result: passing, timestamp: 2026-08-28T18:00:00Z, artifact_ref: tests/missionctl.test.ts }
  - { rubric_id: QUALITY-001, campaign_id: codex-slash-command, evaluator: codex-harness, evidence_type: verifier-run, result: passing, timestamp: 2026-08-28T18:00:00Z, artifact_ref: tests/missionctl.test.ts }
  - { rubric_id: E2E-001, campaign_id: codex-slash-command, evaluator: codex-harness, evidence_type: verifier-run, result: passing, timestamp: 2026-08-28T18:00:00Z, artifact_ref: tests/missionctl.test.ts }
  - { rubric_id: OPS-001, campaign_id: codex-slash-command, evaluator: codex-harness, evidence_type: verifier-run, result: passing, timestamp: 2026-08-28T18:00:00Z, artifact_ref: tests/missionctl.test.ts }
---

# Codex delivery fixture
