# BRIEF — missionctl surfaces

> Law doc for the missionctl CLI, artifact grammar, and hook surfaces; present-tense, no narrated history — git is the changelog. The Boundary and ratified Decisions amend only with human confirmation; the driver appends provisional Decisions, marked and dated. Working memory lives in the campaign's `LOOP.md`, not here.

## Bar

Missionctl is shippable when a driver with nothing but the repository can read one compact `LOOP.md`, trust `missionctl context` to say what is being pursued, what is red, what is decided, and what is the human's, and shrink or dissolve that file without losing anything it had not explicitly let go.

## Dimensions

- Grammar fidelity
- Tolerance and strictness
- Bounded projection
- Lossless transitions
- Degraded-state honesty
- Portability
- Merge-tree fidelity
- Adapter parity
- Reviewability

## Floors

- Grammar fidelity: every field, enum, cross-field rule, and target resolution in `SPEC.md` has a fixture that passes and a mutation that fails with its stable code; the body survives every rewrite byte-for-byte.
- Tolerance and strictness: CRLF, BOM, coercible integers, unknown fields, and short forms read with warnings only; every write is canonical and validated before it lands.
- Bounded projection: `context` output for the largest fixture stays under the declared caps and marks truncation; `statusline` is one line.
- Lossless transitions: a `compact`/`close` plan with an unset, disallowed, or reason-less disposition is refused; a stale source is refused; an interrupted apply leaves the previous file intact; routed decisions appear in the target document's Decisions section with the rest of that document unchanged.
- Degraded-state honesty: invalid, legacy, and absent state produce distinct, stable codes and exit statuses in `check`, `context`, `statusline`, and the hook; no command prints an empty success for an invalid loop.
- Portability: the release archive holds one Node 20+ executable, the plugin manifests match the package version and register only the SessionStart hook, and `--version` matches `package.json`.
- Merge-tree fidelity: one check over the tracked Git tree finds every live loop or mission contract, including symbolic links, without treating generated files, untracked work, or declared fixtures as shipped state; every refusal names the correct dissolution path.
- Adapter parity: the reusable GitHub Action calls the exported CLI entry under GitHub's declared Node 20 runtime and preserves its findings, advice, and exit status; generated-bundle and behavioral-parity floors prove the action does not ship stale or divergent policy.
- Reviewability: a fresh, disinterested reviewer briefed with this law and `SPEC.md` reports no major-or-higher finding.

## Oracle

The objective oracle is `npm run check` over hand-written fixtures and golden outputs. The subjective oracle is a fresh-context reviewer that did not author the change, receives `SPEC.md`, this brief, the verifier output, and declared deferrals, and grades on its own severity scale with `major` as the blocking floor.

## Never

- Never delete or rewrite loop content without an explicit driver disposition.
- Never serve a projection from an invalid loop as if it were valid.
- Never create a `.mission` directory, cache, sidecar, or archive as a side effect.
- Never write to a standing document outside its `## Decisions` section.
- Never store verifier output, review narrative, or rollout history in a loop or mission.
- Never let a live `LOOP.md` or `.mission/mission.yaml` survive into a default-branch tree; test fixtures and inline documentation examples are exempt.
- Never duplicate merge-tree detection or remediation policy in the GitHub Action adapter.
- Never block a harness session start on missing or malformed state.

## Decisions

- 2026-08-28 — Consumer integrations shell out to canonical `missionctl` output rather than reimplementing validation or projection; structured consumers use `--json`, human pass-through surfaces may render stable text verbatim. **provisional (driver)**
- 2026-08-29 — Legacy fixtures (`mission_control: 1`, untyped) are kept only as classification and adoption inputs, not as validating campaigns. **provisional (driver)**
- 2026-08-28 — The Sox visual pilot's durable authority is the committed fixture at `tests/fixtures/sox-visual-pilot`; its device JSON is gate evidence referenced by a typed `LOOP.md`, not a ledger, and the retiring source worktree is not a release root. **ratified (human)**
- 2026-09-02 — The reusable GitHub Action and local agents invoke the same bundled `missionctl merge check` command from the same release ref; the CLI remains the sole owner of detection and remediation advice. **ratified (human)**

## Boundary

The human authorizes each publication, release tag, or tracked-ref merge and ratifies changes to this Boundary or existing ratified Decisions. Local implementation, validation, packaging, and preparation of publish prompts remain interior.
