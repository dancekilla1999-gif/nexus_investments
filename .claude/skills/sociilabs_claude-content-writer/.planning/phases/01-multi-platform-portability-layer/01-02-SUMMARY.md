---
phase: 01-multi-platform-portability-layer
plan: 02
subsystem: testing
tags: [node, cli, lint, structural-verification, zero-dependency]

# Dependency graph
requires:
  - phase: 01-multi-platform-portability-layer (plan 01)
    provides: skills/state-schema.md (the 28-key PROJECT-STATE.md frontmatter schema this script validates)
provides:
  - "scripts/verify-writer-commands.js: dependency-free structural lint with schema/neutralize/migration checks plus --self-test"
  - "npm run verify: canonical invocation of the lint script"
affects: [every later plan in this phase that migrates a file or adds a reference doc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Restricted flat-key regex frontmatter parsing (no YAML parser) — matches ^key:\\s? at line start"
    - "Check functions return { pass: boolean, details: string[] }; thin CLI wrapper dispatches on --check=<name>"
    - "Self-test fixtures written under os.tmpdir() with cleanup in a finally block, never inside the repo tree"

key-files:
  created: [scripts/verify-writer-commands.js]
  modified: [package.json]

key-decisions:
  - "Hardcoded the 28 required schema key names directly in the script (not parsed from skills/state-schema.md itself) so the self-test can validate the check logic independent of that file's current content"
  - "Migration check intentionally fails against the current repo state (skills/shared-context.md still says 'check memory first' and lacks a PROJECT-STATE.md reference) — that migration is a separate later plan's job; this plan only had to build the lint, not pass it end-to-end"

requirements-completed: [VERIFY-02]

coverage:
  - id: D1
    description: "scripts/verify-writer-commands.js implements --check=schema, --check=neutralize, --check=migration, a default full run, and --self-test, with zero new npm dependencies"
    requirement: "VERIFY-02"
    verification:
      - kind: unit
        ref: "node scripts/verify-writer-commands.js --self-test"
        status: pass
      - kind: integration
        ref: "node scripts/verify-writer-commands.js --check=schema (real repo, no throw)"
        status: pass
      - kind: integration
        ref: "node scripts/verify-writer-commands.js --check=bogus (usage message, exit 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run verify invokes the new script and package.json's dependencies/files/engines blocks are unchanged"
    requirement: "VERIFY-02"
    verification:
      - kind: unit
        ref: "node -e checks package.json scripts.verify === 'node scripts/verify-writer-commands.js'"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-04
status: complete
---

# Phase 01 Plan 02: Structural Lint Script Summary

**Dependency-free Node CLI (`scripts/verify-writer-commands.js`) that structurally lints the phase's schema/neutralize/migration invariants via restricted flat-key regex parsing, with a self-verifying `--self-test` mode, wired in as `npm run verify`.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-04T02:46:00Z (approx, following plan 01-01)
- **Completed:** 2026-07-04T02:58:58Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Implemented `scripts/verify-writer-commands.js` with three independent check functions (`checkSchema`, `checkNeutralize`, `checkMigration`), a thin CLI dispatcher, and an internal `--self-test` that proves the schema-check logic correct using disposable fixtures under `os.tmpdir()`
- Wired the script into `package.json` as `npm run verify`, leaving `dependencies`, `files`, and `engines` byte-for-byte unchanged
- Verified the script fails cleanly (no unhandled exception) when `skills/state-schema.md` is temporarily absent, satisfying the out-of-wave-order acceptance criterion

## Task Commits

1. **Task 1: Implement the structural lint script** - `056daa3` (feat)
2. **Task 2: Wire the script into package.json** - `e766225` (chore)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `scripts/verify-writer-commands.js` - New dependency-free CLI: `checkSchema` (validates all 28 required `PROJECT-STATE.md` frontmatter keys are listed in `skills/state-schema.md`), `checkNeutralize` (greps `references/` for the literal `[Content Writer` substring), `checkMigration` (greps `skills/shared-context.md` and `skills/writer/*.md` for the pre-migration phrase "check memory first" and confirms `PROJECT-STATE.md` is referenced), plus `--self-test` and a CLI wrapper supporting `--check=<name>`, a default full run, and an unrecognized-flag usage/exit-1 path
- `package.json` - Added `"verify": "node scripts/verify-writer-commands.js"` to the `scripts` block

## Decisions Made
- Hardcoded the 28 required schema key names as a module-level constant rather than deriving them from `skills/state-schema.md` itself — this lets `--self-test` validate the check logic against fixed, known-good/known-bad fixtures independent of that file's current or future content
- Kept `checkMigration`'s current failure against the real repo as expected and undisturbed: this plan's job was to build the lint surface only, not to perform the migration itself (that lands in a later plan in this same wave/phase)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `migration` check reports a real, expected failure against the current repo state (`skills/shared-context.md:137` still contains "check memory first" and does not yet reference `PROJECT-STATE.md`) — this is correct pre-migration lint output, not a bug in this plan's deliverable, and will be resolved when the sibling plan performing that migration executes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `npm run verify` (and each individual `--check=` flag) is available for every subsequent plan in this phase to call from its own `<verify>` step
- The `migration` check will start passing once the plan that rewrites `skills/shared-context.md` and `skills/writer/*.md` to reference `PROJECT-STATE.md` and drop "check memory first" executes
- No blockers

---
*Phase: 01-multi-platform-portability-layer*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: scripts/verify-writer-commands.js
- FOUND: package.json verify script entry
- FOUND: commit 056daa3
- FOUND: commit e766225
