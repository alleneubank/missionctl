# Loop: legacy widget cleanup — `chore/widget-cleanup`

Mission: remove the deprecated offset listing before the next release. Drive the
campaign to interior-green so only the publish boundary remains.

## State (updated 2026-08-20)

- Branch `chore/widget-cleanup`, HEAD `abc1234`, tree clean.
- Offset removal half done; two callers remain.

## Decisions (append-only; do not re-litigate)

1. 2026-08-19 — Keep the offset parameter accepted but ignored for one release. Why: two external callers. provisional
2. 2026-08-20 — Log a deprecation warning when offset is present. ratified

## Work plan (ADF per unit)

1. Remove offset handling from the list endpoint.
2. Update the two internal scripts.

## Verification floors

- `npm test` → all widget tests pass.
- `npm run lint` → no lint errors.

## Boundaries — NEVER

- Never push, open PRs, merge, or publish without per-artifact authorization.
- Never delete customer data.
