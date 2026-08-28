# missionctl

`missionctl` validates and projects committed `MISSION.md` and one-campaign
`LOOP.md` contracts. It is the canonical reducer for typed mission state used
by agent skills, lifecycle hooks, Codex, statusline renderers, and fleet views.

## Install with mise

Release archives contain one executable Node.js bundle at the archive root.
Node.js 20 or newer is the only runtime dependency.

```toml
[tools]
"github:alleneubank/missionctl" = {
  version = "v0.1.0-rc.1",
  exe = "missionctl",
  asset_pattern = "missionctl-*.tar.gz"
}
```

Use an exact version with a committed `mise.lock` for reproducible fleet
installation.

## Commands

```bash
missionctl current --root /path/to/active-campaign
missionctl mission --root /path/to/mission
missionctl portfolio --root /path/to/workspace
missionctl check --root /path/to/workspace
missionctl drill
missionctl statusline --root /path/to/active-campaign
missionctl prompt resume --root /path/to/active-campaign
missionctl --version
```

Every projection command supports stable JSON with `--json`. `mission`
evaluates durable mission evidence without requiring an active `LOOP.md`;
campaign-specific commands require one. Invalid, stale, unavailable, and
untyped legacy state remains visible rather than becoming an empty pass.

## Develop

```bash
npm ci
npm run check
./packaging/package-release.sh
```

`npm run check` type-checks, builds the executable, and runs the schema,
reducer, CLI, and packaging contract tests. The release packaging script emits
one platform-independent archive and checksum under `dist/release/`.

The behavioral contract is in [SPEC.md](./SPEC.md); surface quality is governed
by [BRIEF.md](./BRIEF.md).
