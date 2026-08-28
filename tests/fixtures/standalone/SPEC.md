# Widget service

## Requirements

- REQ-WIDGET-001 — Widgets are created with a unique identifier.
- REQ-WIDGET-002 — Widget listing is paginated.
- REQ-WIDGET-003 — Deleting a widget is idempotent.

## Invariants

- Identifiers are never reused.

## Decisions

- 2026-08-20 — Pagination uses cursors, not offsets. **ratified (human)**

## Acceptance criteria

- [ ] Every requirement has a test.
