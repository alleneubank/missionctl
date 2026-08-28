---
loop: 1
id: rollout-wave-two
objective: Roll the new build to the remaining regions.
status: done
phase: BOUNDARY
iteration: 4
iteration_budget: 6
updated_at: 2026-08-29T12:00:00Z
mission: regional-rollout
targets:
  spec: [REQ-ROLL-001]
  brief: [Safety]
  mission: [REGION-002]
gates:
  - id: health
    run: ./scripts/region-health.sh --all
    green: every region reports healthy for 24h
    state: green
units:
  - id: U1
    title: Roll eu-west
    state: done
  - id: U2
    title: Roll us-east
    state: done
decisions:
  - date: 2026-08-28
    call: Pause between regions is 30 minutes.
    status: ratified
  - date: 2026-08-29
    call: Skip ap-south until its quota increase lands.
    status: provisional
blockers: []
boundary:
  - production-cutover
---

# Loop: rollout wave two

## State

- All regions except ap-south healthy; ap-south deferred by decision.
