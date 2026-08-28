# missionctl

`missionctl` validates, projects, and transitions one compact `LOOP.md` — the
committed contract for an autonomous campaign. A driver (agent or human) with
nothing but the repository can read it, ask `missionctl context` what is being
pursued, what is red, what is decided, and what is the human's, and shrink or
dissolve the file without losing anything it did not explicitly let go.

A normal feature campaign needs only `LOOP.md`. A `.mission/mission.yaml` is
optional and exists only when an outcome spans campaigns or repositories.

## Install with mise

Release archives contain one executable Node.js bundle at the archive root.
Node.js 20 or newer is the only runtime dependency.

```toml
[tools]
"github:alleneubank/missionctl" = {
  version = "v0.1.0-rc.2",
  exe = "missionctl",
  asset_pattern = "missionctl-*.tar.gz"
}
```

## The loop

```yaml
---
loop: 1
id: widget-pagination
objective: Ship cursor pagination for widget listing behind the existing API.
status: active            # planned | active | waiting | blocked | done | budget-exhausted | superseded
phase: TDD                # MISSION | SPEC | PLAN | TDD | DEV | E2E | BOUNDARY
iteration: 3
iteration_budget: 8
targets:
  spec: [REQ-WIDGET-002]  # must exist in the nearest SPEC.md
  brief: [Correctness]    # must be a floor in the nearest BRIEF.md
gates:
  - { id: unit, run: npm test, green: all widget tests pass, state: red }
units:
  - { id: U2, title: List endpoint accepts cursor, state: current }
decisions:
  - { date: 2026-08-28, call: Cursors are opaque base64url strings., status: ratified }
blockers: []
boundary: [publish, merge-tracked-ref]
---

# Loop: widget pagination

## State

- Free working notes; missionctl never interprets the body.
```

Edit it by hand like any other config file. `missionctl check` reports every
problem with a stable code and a repair hint; nothing is served from an
invalid loop as if it were valid.

## Commands

```bash
missionctl check       [--root DIR]        # validate; exit 1 on errors, warnings never fail
missionctl context     [--root DIR] [--json]  # bounded projection: objective, unit, red gates, decisions, blockers, boundary
missionctl statusline  [--root DIR]        # one line for status bars
missionctl repair      [--dry-run]         # canonical rewrite of a tolerantly readable loop (refuses while a # may have truncated a value)
missionctl inspect                         # classify: loop | legacy-untyped | legacy-mission-control | none
missionctl adopt       [--write]           # draft a typed LOOP.md from a legacy loop; write only when valid
missionctl compact prepare|validate|apply [--plan FILE]
missionctl close   prepare|validate|apply [--plan FILE]
missionctl mission     [--root DIR]        # project .mission/mission.yaml and its campaigns
missionctl harness claude session-start    # hook adapter; reads hook JSON on stdin
missionctl --version
```

Every command accepts `--json`; failures use `{ "ok": false, "error": { "code", "message" }, "issues": [...] }`.

## Compact and close

Transitions are two-phase so judgment stays with the driver:

```bash
missionctl compact prepare --json > plan.json   # items with allowed and proposed dispositions
#   edit plan.json: set "disposition" on every item (reason where required)
missionctl compact validate --plan plan.json     # refuses stale sources and incomplete plans
missionctl compact apply    --plan plan.json     # routes decisions into SPEC/BRIEF Decisions, rewrites atomically
```

`compact` lists done units, decisions, blockers, and body sections; unresolved
work is never listed and always retained. `close` requires a terminal status,
lists everything left, updates a linked mission rubric, and deletes `LOOP.md`.
Git is the archive.

## Agent plugin

The repository is a Claude Code and Codex marketplace named `missionctl`. Its
hooks-only plugin runs `missionctl harness claude session-start`, which injects
the bounded context at every session start. No loop or unreadable input yields
`{}`; an invalid or legacy loop is named so it is repaired or adopted before
work continues. The executable is resolved from `PATH` (mise-owned), never
vendored.

## Develop

```bash
npm ci
npm run check                 # typecheck, build, tests
./packaging/package-release.sh
```

The behavioral contract is [SPEC.md](./SPEC.md); surface quality is governed
by [BRIEF.md](./BRIEF.md).
