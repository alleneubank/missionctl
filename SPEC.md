# missionctl — standalone campaign contracts

## Problem and solution

An autonomous campaign needs one committed artifact that a fresh session, a
different harness, or a human can read to learn what is being pursued, what is
red, what has been decided, and where the human boundary sits. Free-form loop
journals grow without bound, carry stale state, and cannot be validated. A
required mission hierarchy with an evidence ledger fixes validation but makes
the common one-branch feature pay for machinery it never uses, and duplicates
evidence that CI, review, and release systems already own.

`missionctl` makes a single compact `LOOP.md` the normal campaign contract. It
owns the artifact grammar, validation, bounded projection, and the lifecycle
transitions that shrink or dissolve the file. The driver (human or agent) owns
meaning: which decisions are durable, which units are finished, which content
migrates. Evidence stays where it is produced; the loop records which gates
prove it and their last observed state. A `.mission/mission.yaml` is optional
and exists only when an outcome genuinely spans campaigns or repositories.

## Domain model

```
SPEC.md  (REQ-* requirements)  ─┐
BRIEF.md (quality floors)       ├── targets ──► LOOP.md (one campaign) ──► gates (verifier commands)
.mission/mission.yaml (optional)┘                  │
                                                   ├── units      ordered work, one current
                                                   ├── decisions  dated, provisional|ratified
                                                   ├── blockers   evidence + proposed path
                                                   └── boundary   human-only actions
```

### Loop

`LOOP.md` is YAML frontmatter followed by a free Markdown body. The
frontmatter is the machine contract; the body is the driver's working notes
and is opaque to validation. Exactly one campaign lives in one `LOOP.md`;
a successive attempt is a fresh file.

Frontmatter fields:

| Field | Required | Shape |
|---|---|---|
| `loop` | yes | literal `1` (schema version) |
| `id` | yes | non-empty string, stable campaign identity |
| `objective` | yes | one bounded outcome |
| `status` | yes | `planned` `active` `waiting` `blocked` `done` `budget-exhausted` `superseded` |
| `phase` | no | `MISSION` `SPEC` `PLAN` `TDD` `DEV` `E2E` `BOUNDARY` |
| `iteration` | no (default `0`) | non-negative integer |
| `iteration_budget` | yes | positive integer; `iteration` never exceeds it |
| `updated_at` | no | ISO-8601 UTC timestamp |
| `expected_signal_by` | when `waiting` | ISO-8601 UTC timestamp |
| `targets` | no | `{ spec?: [REQ-*], brief?: [floor names], mission?: [rubric IDs] }` |
| `gates` | yes | non-empty list of `{ id, run, green, state? }`; `state` is `unknown` (default) `red` `green` |
| `units` | no | list of `{ id, title, targets?: [], state? }`; `state` is `pending` (default) `current` `done` `deferred` |
| `decisions` | no | list of `{ date, call, status }`; `status` is `provisional` or `ratified` |
| `blockers` | no | list of `{ summary, proposed? }` |
| `boundary` | yes | non-empty list of strings naming human-only actions |
| `mission` | no | `{ id, source?: { repository, ref, path } }`; a bare string is the short form for `{ id }` |

Semantics: `waiting` means a declared external signal is pending; `blocked`
means the unblocking ladder is exhausted and named decisions remain; `done`
means every gate was last observed green. `budget-exhausted` and `superseded`
are honest stops. A gate's `state` is what the driver last observed; missionctl
never runs gates.

### Mission (optional)

`.mission/mission.yaml` declares one enduring outcome that outlives a single
campaign:

| Field | Required | Shape |
|---|---|---|
| `mission` | yes | literal `1` |
| `id`, `title`, `outcome` | yes | non-empty strings |
| `rubric` | yes | non-empty list of `{ id, criterion, floor, status, evidence?, reason? }`; `status` is `open` `met` `waived`; `met` requires `evidence`, `waived` requires `reason` |
| `boundary` | yes | non-empty list of strings |

A mission is achieved when every rubric item is `met` or `waived`. Campaigns
link to it through `mission.id` and advance named rubric IDs through
`targets.mission`. Nothing else is stored: git holds closed campaigns, and the
native verifier, CI, review, and release systems hold evidence.

### Issues

Every validation, projection, and lifecycle failure is an issue:
`{ code, severity, path, message, repair }`. `severity` is `error` or
`warning`; `repair` is a one-line human/agent instruction. Codes are stable
and namespaced (`loop.*`, `target.*`, `mission.*`, `plan.*`, `legacy.*`,
`route.*`).

### Lifecycle plan

`compact` and `close` are two-phase. `prepare` reads the current loop and
emits a plan; the driver fills a disposition per item; `validate` checks the
plan against the live file; `apply` performs the rewrite atomically. A plan is
`{ plan: 1, transition, loop_path, source_sha256, items: [{ id, kind, summary,
allowed, proposed, disposition, reason }] }`.

## Requirements

### Grammar and validation

- REQ-LOOP-001 — `LOOP.md` parses as YAML frontmatter (`loop: 1`) plus body; a closing fence at end of input without a final newline is closed with an empty body. The body is preserved byte-for-byte across every missionctl rewrite (`repair`, `adopt`, `compact apply`), its line endings included: only the frontmatter is ever re-serialized.
- REQ-LOOP-002 — Reads are tolerant: CRLF frontmatter and a UTF-8 BOM are accepted (a canonical rewrite emits LF frontmatter and no BOM); absent optional fields take their defaults; a bare-string `mission` becomes `{ id }`; integer-valued strings in integer fields are coerced with a `loop.coerced-field` warning; unknown fields produce a `loop.unknown-field` warning and are preserved. Unknown keys nested in a gate, unit, decision, blocker, or the mission link are preserved and warned about (`loop.unknown-field` at their path) exactly like top-level ones. Every string field is a single line: control characters are `loop.invalid-field`. Timestamps and decision dates must name real calendar instants, not merely match the shape.
- REQ-LOOP-003 — Validation enforces: required fields present; enum membership; `iteration ≤ iteration_budget`; unique gate, unit, and decision identity (`gates[].id`, `units[].id`); at most one `current` unit; `blocked` requires at least one blocker; `waiting` requires a valid `expected_signal_by`; `done` requires every gate `green`; an `active` loop without a `current` unit is a warning.
- REQ-LOOP-004 — Targets resolve against colocated standing docs found by walking up from the loop's directory: each `targets.spec` ID must appear literally in the nearest `SPEC.md`, each `targets.brief` name must be a floor in the nearest `BRIEF.md` (`- <Name>:` under `## Floors`), and each `targets.mission` ID must be a rubric ID in the linked mission. A missing doc or unknown ID is a `target.*` error; an unavailable external mission source is a `mission.unavailable` warning. A `BRIEF.md` without an exact `## Floors` heading outside fenced code declares no floors (`target.brief-missing-floors`); bullets elsewhere, under a prefixed heading, or inside a fence never satisfy a brief target.
- REQ-LOOP-005 — `missionctl check` reports every issue for the loop found at or above `--root`; exit `0` with no errors, `1` with errors, `2` on usage failure. No loop at or above root is `{ ok: true, loop: null }`. JSON output is stable and every non-JSON error also has a JSON form `{ ok: false, error: { code, message } }`.
- REQ-LOOP-006 — A valid `LOOP.md` alone is sufficient: no `MISSION.md`, `.mission/` directory, cache, or sidecar is read or created by any command. Only `adopt --write`, `repair`, `compact apply`, and `close apply` write, and each writes only the files it names.
- REQ-LOOP-008 — A plain (unquoted) value of `objective`, `title`, `call`, `summary`, `proposed`, `green`, `run`, or `reason` followed by a same-line `#` comment yields a `loop.comment-in-value` warning naming the value that survived and the text YAML read as a comment, with the quoted full value as the repair; YAML semantics are not changed and `repair` never guesses.
- REQ-LOOP-007 — `missionctl repair` rewrites the loop in canonical form when the tolerant read yields no errors and no `loop.comment-in-value` warning (a value a `#` may have truncated is never canonicalized; the driver quotes it first) (defaults filled, coercions applied, key order fixed, frontmatter line endings LF, body untouched) and reports the changes; when errors remain it writes nothing and reports the issues.

### Projection

- REQ-CTX-001 — `missionctl context` emits only: loop identity (`path`, `id`, `status`, `phase`, `iteration`, `iteration_budget`), `objective`, `current_unit`, `red_gates` (gates whose state is `red` or `unknown`) with the uncapped `red_gates_total`, `decisions`, `blockers`, `boundary`, `mission` (`id`, `targets`, `available`) when linked, and `warnings`. Lists are capped (8 decisions newest-last, 8 blockers, 8 red gates, 8 warnings) and every string is capped at 240 characters; `truncated: true` marks any cap hit. Strings that are capped include paths, ids, targets, boundary entries, and mission fields, so no field of the projection exceeds the cap.
- REQ-CTX-002 — `missionctl statusline` renders one line from the same projection: `<status> <phase|-> · unit <id|none> · gates <red_gates_total> red · <iteration>/<budget>`.
- REQ-CTX-003 — Invalid state is never served as stale success: `context` on an invalid or legacy loop exits `1` with the issues; `statusline` prints `loop invalid · <n> issues · missionctl check` (`n` counts every issue, warnings included) or `loop <legacy-class> · missionctl inspect` and exits `0`; both exit `1` with `loop.not-found` when no loop exists.

### Lifecycle transitions

- REQ-LIFE-001 — `compact prepare` and `close prepare` emit a plan whose `source_sha256` is the SHA-256 of the current `LOOP.md` bytes. `validate` and `apply` refuse (`plan.stale-source`) when the file changed since prepare, refuse (`plan.unknown-item` / `plan.missing-item`) when the item set differs from a fresh prepare, refuse (`plan.invalid`) a plan naming any item id more than once, and refuse (`plan.missing-disposition`, `plan.disposition-not-allowed`, `plan.missing-reason`) when any item lacks an explicit allowed disposition or a required reason. `apply` writes through a same-directory temporary file and `rename`, so a reader never observes a partial file. `apply --dry-run` validates the plan and reports every path it would write, route, drop, or delete without touching any file. A flag a command cannot honor (`--dry-run` outside `repair` and `apply`, `--write` outside `adopt`, `--plan` outside `validate`/`apply`) is a usage error (exit 2).
- REQ-LIFE-002 — `compact` lists: `done` units (`drop` | `keep`), decisions (`keep` | `route:spec` | `route:brief` | `drop`), blockers (`keep` | `drop`), and each `## ` section of the body outside fenced code (`keep` | `drop` | `migrated`; a fence closes only on the marker that opened it). Section ids are `section:<heading>`, suffixed `#2`, `#3`, … until unique within the body, so no two items share an id even when a heading spells a suffix. `drop` requires a reason for decisions and blockers. Units that are not `done`, gates, targets, and boundary are never listed and always retained. The proposed disposition is `drop` for done units and body sections, `route:spec` for ratified decisions, and `keep` otherwise.
- REQ-LIFE-003 — `close` requires `status` in `done`, `budget-exhausted`, `superseded`; `prepare`, `validate`, and `apply` each re-check the live status (else `close.not-terminal`), so a plan whose `source_sha256` matches a non-terminal loop is still refused. It lists every unit not `done` (`complete` | `drop`), every decision (`route:spec` | `route:brief` | `drop`), every blocker (`drop`), the body preamble as `preamble` when it carries any non-blank line other than a `# ` title (`drop` | `migrated`), every body section (`drop` | `migrated`), the preserved `legacy_mission_control` block (`drop` with reason | `migrated`), and, when a mission is linked and available, every `targets.mission` rubric item (`met` | `open` | `waived`; `met` requires `evidence`, `waived` requires `reason`). `apply` routes, updates the mission rubric, then deletes `LOOP.md`.
- REQ-LIFE-004 — Routing appends `- <date> — <call>. **<status> (<human|driver>)**` at the end of the `## Decisions` section of the nearest `SPEC.md` or `BRIEF.md` (creating the section at the end of the file when absent). The append is a byte splice: every pre-existing byte outside the insertion is unchanged, including mixed line endings, and inserted bytes use the exact Decisions section's line terminator (or the final existing line terminator, then LF, when the section is absent). A missing target document is a `route.target-missing` validation error, so no loop content is deleted before its destination is known. Target documents are written before the loop. The exact `## Decisions` heading (not a prefix such as `## Decisions Archive`) is located outside fenced code, and entries already present verbatim in the section are not appended again, so a retried `apply` after a failed loop rewrite is idempotent. During `prepare`, a decision whose proposed disposition is `route:spec` or `route:brief` carries an optional `warnings` list on its plan item when the proposed target's Decisions section already contains a materially similar entry; text output renders the same warning. Similarity is deterministic and conservative: strip decision date/status markup, lowercase Unicode letter/digit tokens, discard common grammar words and tokens shorter than three characters, and emit `route.similar-entry` only when at least four meaningful tokens overlap and those tokens cover at least 80% of the smaller set. Entries below either threshold, including neighboring decisions that merely share a domain noun, are not warned. The warning is advisory: the driver still chooses an explicit disposition, normally `drop` with a reason when the durable intent is already present.

### Legacy

- REQ-LEGACY-001 — `missionctl inspect` classifies the loop at or above root as `loop` (valid schema), `legacy-mission-control` (`mission_control: 1` frontmatter), `legacy-untyped` (no `loop: 1` frontmatter; includes `.claude/loop.md`), or `none`, and previews unresolved content (headings, decision and work-plan bullets, frontmatter fields) without writing. `check` reports a legacy loop as a `legacy.<class>` error whose repair names `inspect` and `adopt`. Classification reads the parsed top-level YAML keys (`loop`, `mission_control`); only unparseable frontmatter falls back to a raw-text guess so its parse error still reports as a loop.
- REQ-LEGACY-002 — `missionctl adopt` drafts one typed `LOOP.md` from one legacy file and prints the draft with its validation issues. The draft is additive: the legacy body is carried verbatim, and legacy frontmatter fields with no typed home — from a `mission_control` loop or any other frontmatter mapping on an untyped loop — are preserved under `legacy_mission_control` (reported as `loop.unknown-field`); a recognized `mission_control` field leaves the frontmatter only when its value converted into the draft, so a value outside the typed shape (an unknown `status`, a string `iteration_budget`, a partial `mission_source`) is preserved like an unmapped one. Frontmatter that is not a YAML mapping is appended to the body verbatim in a `## Legacy frontmatter` fence, in the body's line endings, so the driver retires converted content later through dispositions: `compact prepare` lists the block as a `legacy` item (`keep` | `drop` with reason | `migrated`) and `close prepare` lists it (`drop` with reason | `migrated`). `--write` replaces that single file only when the draft validates; it never touches any other file and never accepts more than one path. When the target differs from the source (`.claude/loop.md` → `LOOP.md`), the write is exclusive: any existing entry at the target, a dangling symlink or unreadable file included, is `legacy.target-exists`.

### Mission

- REQ-MISSION-001 — `.mission/mission.yaml` validates per the domain model; `missionctl mission` projects `id`, `title`, `outcome`, `achieved`, each rubric item's state, and the linked campaigns discovered under the mission's directory (`id`, `status`, `targets`). A discovered loop that names the mission by `source` counts only when that source resolves to this mission file. Discovery is bounded at 10000 entered directories after pruning, without counting file or symlink entries; when the bound trips, the campaigns found so far are still reported and `mission.discovery-bounded` is an error (`ok: false`). Malformed mission files are `mission.*` errors.
- REQ-MISSION-002 — A loop's `targets.mission` IDs must exist in the linked mission; `close apply` sets each targeted rubric item per its disposition and writes `mission.yaml` atomically. A loop linked to a mission by `source` resolves it from a sibling checkout — `<ancestor>/<repository name>/<source.path>` for any ancestor of the loop's directory, the repository name being the last path segment of `source.repository` without `.git`; `source.ref` is informational and never fetched. Without a sibling the loop validates with a `mission.unavailable` warning and unvalidated mission targets; a sibling that is invalid or carries another id is a `mission.*` error. `close apply` writes the sibling's `mission.yaml` like a local one and lists it under `written`.
- REQ-MISSION-003 — Campaign discovery prunes `.git`, `.hg`, `.svn`, `.rl`, `.zig-cache`, `.zig-global-cache`, `node_modules`, `target`, `zig-out`, and `dist` directories before descent and never descends through symbolic links. Unrelated dangling file and directory symlinks do not affect `check`, `inspect`, or `mission`. An exact contract-file symlink that resolves to a readable file is handled as that file; a dangling symlink occupying an exact `LOOP.md`, `.claude/loop.md`, or `.mission/mission.yaml` contract path is reported as an unreadable contract instead of being treated as absent. Normal commands preserve `LOOP.md` precedence even when it is unreadable; `adopt` alone may read a lower-precedence `.claude/loop.md` source so its exclusive write reports the existing typed target.

Mission discovery traceability:

- REQ-MISSION-001 — `tests/missionctl.test.ts`: “discovers every campaign in a file-heavy source tree without spending the directory bound”, “allows a directory-heavy repository below the explicit bound”, and “keeps discovered campaigns and fails visibly when discovery hits its directory bound”.
- REQ-MISSION-003 — `tests/missionctl.test.ts`: “prunes a repo-local Zig global cache before its descendants spend the directory bound”, “ignores unrelated dangling symlinks while discovering and resolving real artifacts”, and the dangling loop and mission contract cases.

Lifecycle bugbash traceability:

- REQ-LIFE-004 — `tests/lifecycle.test.ts`: mixed-ending routing changes only the Decisions insertion bytes; compact and close preparation warn on a paraphrased existing decision; a neighboring decision below the explicit token threshold remains unwarned.

### Harness

- REQ-HOOK-001 — `missionctl harness claude session-start` reads bounded hook JSON (≤ 65536 bytes, `cwd` required) from stdin and emits `{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }` carrying the text form of `context`. No loop, unreadable input, or an internal failure emits `{}` with exit `0`; an invalid loop emits `additionalContext` naming the issue count (errors and warnings) and `missionctl check`. The hook writes no files.
- REQ-HOOK-002 — The Claude and Codex plugin manifests share the package version and register exactly one hook: `SessionStart` → `missionctl harness claude session-start`.

### Release

- REQ-REL-001 — `missionctl --version` equals `package.json` `version`; release packaging emits one archive containing only the root `missionctl` executable plus a SHA-256 sidecar; the executable runs on Node.js 20+ and bundles its YAML parser.

## Invariants

- `LOOP.md` is the authority for its campaign; nothing hidden overrides it.
- Missionctl never deletes loop content without an explicit disposition from the driver, and never decides which content is durable.
- The body of `LOOP.md` is preserved exactly except through a `compact`/`close` disposition.
- Invalid or legacy state is visible in every command; no command manufactures an empty pass.
- Git is the archive: no in-repo archive, evidence ledger, campaign sidecar, or runtime cache.
- A standing document is only ever appended to under its `## Decisions` heading.

## Non-goals

- Running gates, scoring campaigns, ranking missions, or fleet portfolios.
- Storing verifier output, review verdicts, or rollout narrative.
- Resolving remote mission sources over the network.
- Bulk migration of legacy loops.

## Risk tags

- **High risk — artifact contract:** `LOOP.md` frontmatter is a cross-harness contract; an incompatible change bumps `loop`.
- **High risk — CLI JSON contract:** consumers parse `context`, `check`, and plan JSON; golden tests gate changes.
- **High risk — standing-doc writes:** routing appends to `SPEC.md`/`BRIEF.md`; tests prove the append is section-scoped and the rest of the file is untouched.

## Acceptance criteria

- [ ] A minimal `LOOP.md` alone validates, projects `context`, and renders `statusline`; no `.mission` directory or other file is created.
- [ ] Every required field, enum, cross-field rule, and target resolution failure has an observed-red then passing test with a stable code and repair hint.
- [ ] Tolerant reads (CRLF, BOM, coercion, unknown fields, short-form mission, `#`-truncated prose) pass with warnings; `repair` canonicalizes the mechanical ones.
- [ ] A valid manual edit stays valid; an invalid manual edit fails `check`, `context`, and `statusline` visibly.
- [ ] Legacy `mission_control: 1`, untyped, and `.claude/loop.md` loops classify; `adopt` previews and writes one file only when valid.
- [ ] `compact` keeps unresolved units, routes decisions into `SPEC.md`/`BRIEF.md` Decisions, refuses a stale or incomplete plan, and rewrites atomically.
- [ ] `close` refuses non-terminal loops and unresolved plans, routes durable content, updates a linked mission, and deletes `LOOP.md`.
- [ ] Mission campaign discovery succeeds in file-heavy repositories and below ignored cache trees, fails at its entered-directory bound, and does not follow unrelated symlinks.
- [ ] A symlink occupying a loop or mission contract path fails visibly while an unrelated dangling symlink remains inert.
- [ ] The Claude SessionStart hook emits bounded context, `{}` when absent, and a visible notice when invalid; only that hook is registered.
- [ ] `npm run check`, the release archive, and `--version` agree on the package version.

## Decisions

- 2026-08-28 — The tool is independently versioned and distributed as a GitHub release for mise; agent-profile remains a doctrine and integration consumer. **ratified (human)**
- 2026-08-28 — Missionctl owns its Claude/Codex lifecycle adapter and hooks-only marketplace plugin; agent-profile retains shared doctrine but no missionctl executable behavior or registration. **ratified (human)**
- 2026-08-28 — The executable bundles the YAML parser so artifact authors use standard YAML without a runtime installation dependency. **provisional (driver)**
- 2026-08-28 — ISO-8601 timestamps are the serialized time contract; evaluation receives an injected clock (`--now`) so fixtures are deterministic. **provisional (driver)**
- 2026-08-29 — Standalone `LOOP.md` is the sole default; a required `MISSION.md` and `.mission/campaign.yaml` are rejected as legacy. **ratified (human)**
- 2026-08-29 — Mission machinery is opt-in, declared only when an outcome is multi-campaign, unattended multi-phase, or cross-repository. **ratified (human)**
- 2026-08-29 — Missionctl owns artifact grammar, validation, lifecycle transitions, and projection; the human or agent owns meaning and semantic dispositions. **ratified (human)**
- 2026-08-29 — Direct manual edits of `LOOP.md` are supported like edits to `Cargo.toml`; missionctl is not an exclusive generator. **ratified (human)**
- 2026-08-29 — Git is the archive: no in-repo mission archive, evidence ledger, or narrative sidecar. **ratified (human)**
- 2026-08-29 — `compact` and `close` are agent-driven two-phase transitions with explicit per-item dispositions, never blind deletion. **ratified (human)**
- 2026-08-29 — Gate state is driver-observed and recorded in the loop; missionctl never executes gates. **provisional (driver)**
- 2026-08-29 — `head` is not a loop field; concurrency safety comes from the plan's `source_sha256`, and git owns commit identity. **provisional (driver)**
- 2026-08-29 — The `REQ-MC-*` series of the superseded evidence-ledger design is retired unshipped; this document starts fresh series. **provisional (driver)**
- 2026-08-29 — Adoption is additive; the legacy body is carried verbatim and unmapped legacy frontmatter is preserved under legacy_mission_control, retired later through compact dispositions. **provisional (driver)**
- 2026-08-29 — The body is the driver's bytes in every rewrite, repair included: only the frontmatter is ever normalized (LF, no BOM), so a CRLF body stays CRLF beside LF frontmatter. **provisional (driver)**
