---
loop: 1
id: widget-pagination
objective: Ship cursor pagination for widget listing behind the existing API.
status: active
phase: TDD
iteration: 3
iteration_budget: 8
updated_at: 2026-08-29T12:00:00Z
targets:
  spec: [REQ-WIDGET-002]
  brief: [Correctness]
gates:
  - id: unit
    run: npm test
    green: all widget tests pass
    state: red
  - id: typecheck
    run: npm run typecheck
    green: no type errors
    state: green
units:
  - id: U1
    title: Cursor encoding helper
    targets: [REQ-WIDGET-002]
    state: done
  - id: U2
    title: List endpoint accepts cursor
    targets: [REQ-WIDGET-002]
    state: current
  - id: U3
    title: Remove offset parameter
    state: pending
decisions:
  - date: 2026-08-28
    call: Cursors are opaque base64url strings.
    status: ratified
  - date: 2026-08-29
    call: Page size defaults to 50 and caps at 200.
    status: provisional
blockers: []
boundary:
  - publish
  - merge-tracked-ref
---

# Loop: widget pagination — `feat/widget-pagination`

## State

- U2 red: cursor decode rejects padded input; fix in `src/list.ts`.

## Notes

- Offset callers found in two internal scripts.
