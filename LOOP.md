---
loop: 1
id: reusable-merge-guard
objective: Ship missionctl merge check and a reusable GitHub Action in v0.1.0-rc.3 from one detection and advice contract.
status: active
phase: E2E
iteration: 3
iteration_budget: 6
updated_at: 2026-09-02T03:35:00Z
targets:
  spec: [REQ-MERGE-001, REQ-MERGE-002, REQ-ACTION-001]
  brief: [Merge-tree fidelity, Adapter parity]
gates:
  - id: harness
    run: npm run check
    green: typecheck, build, generated-action parity, and every test pass
    state: green
  - id: package
    run: ./packaging/package-release.sh
    green: the rc.3 release archive and checksum verify with the action bundle kept outside the CLI archive
    state: green
  - id: review
    run: fresh-context major-floor review
    green: a disinterested reviewer reports no major-or-higher finding
    state: red
units:
  - id: U1
    title: Ratify the CLI and action contract in SPEC and BRIEF
    targets: [REQ-MERGE-001, REQ-MERGE-002, REQ-ACTION-001]
    state: done
  - id: U2
    title: Observe the merge-check and action contract red
    targets: [REQ-MERGE-001, REQ-MERGE-002, REQ-ACTION-001]
    state: done
  - id: U3
    title: Implement missionctl merge check and its repair guidance
    targets: [REQ-MERGE-001, REQ-MERGE-002]
    state: done
  - id: U4
    title: Package and dogfood the reusable GitHub Action
    targets: [REQ-ACTION-001]
    state: done
  - id: U5
    title: Verify rc.3, close the campaign, and publish the authorized release
    targets: [REQ-MERGE-001, REQ-MERGE-002, REQ-ACTION-001]
    state: current
decisions:
  - date: 2026-09-02
    call: The reusable action invokes missionctl merge check from the same release and passes its advice through unchanged.
    status: ratified
blockers: []
boundary: [merge-pr-7, tag-v0.1.0-rc.3, publish-github-release]
---

# Loop: reusable merge guard

## State

- Live releases are v0.1.0-rc.1 and v0.1.0-rc.2; this campaign owns rc.3.
- The current inline CI detector is the observed behavior to replace, not a second implementation to preserve.
- The action is hermetic: GitHub supplies its declared Node 20 runtime, its committed entry bundle is generated beside the CLI, and an integration test compares action status and advice byte-for-byte with the CLI.
- TDD red: 16 focused tests failed because `merge` was unknown and `action.yml` plus the action bundle were absent.
- Interior green: `npm run check` passes 154/154 tests across 10 files; release packaging passes; the CLI and action bundle both report 0.1.0-rc.3.
- Dogfood red: after staging this live `LOOP.md`, the committed action bundle exits 1 with `merge.branch-local-artifact` and the `missionctl close` repair path.
- Review fixes: the Action declares GitHub's Node 20 runtime, calls the exported CLI `main`, and forwards no duplicated default exclusion; `tests/fixtures` remains CLI-owned.
