---
phase: 01-multi-platform-portability-layer
plan: 06
type: execute
subsystem: adapter-build-system
tags: [adapter, build-script, packaging, chatgpt, gemini, claude-skill]
requires: ["01-01", "01-02"]
provides: ["01-08", "01-09", "01-10"]
affects: [ADAPTER-02, ADAPTER-03, ADAPTER-04]
tech-stack:
  added: []
  patterns: [dependency-free-scripts, build-automation, knowledge-sync]
key-files:
  created:
    - scripts/build-adapter-knowledge.js
    - skills/adapters/claude-skill/references/*.md (13 files)
    - skills/adapters/chatgpt/knowledge/*.md (13 files)
    - skills/adapters/gemini/knowledge/*.md (10 files)
  modified:
    - package.json
key-decisions:
  - "Gemini's 10-source limit satisfied by merging 3 social platform files into social-conventions.md"
  - "content-packages.md deliberately excluded from Gemini bundle to stay at exactly 10 files"
  - "Script clears target directories before copying to prevent stale file accumulation"
  - "No new npm dependencies added (uses only fs, path built-ins)"
requirements-completed: [ADAPTER-02, ADAPTER-03, ADAPTER-04]
duration: 4 min
completed: "2026-07-04"
status: complete
---

# Phase 01 Plan 06: Adapter Knowledge Build Script Summary

Shared packaging script that populates all three chat-platform adapters' knowledge folders from the canonical `references/` directory, ensuring no independently-edited duplicate copies exist.

## Accomplishments

- Created `scripts/build-adapter-knowledge.js` — dependency-free Node.js script (fs, path only) that reads `--target=` CLI flag with values `claude-skill`, `chatgpt`, `gemini`, `all`
- For **claude-skill**: Copies all 12 reference files + `skills/state-schema.md` unmodified to `skills/adapters/claude-skill/references/` (13 files total)
- For **chatgpt**: Copies all 12 reference files + `state-schema.md` unmodified to `skills/adapters/chatgpt/knowledge/` (13 files, under 20-file cap)
- For **gemini**: Copies 8 selected reference files + `state-schema.md` + generates `social-conventions.md` by merging `twitter-conventions.md`, `facebook-conventions.md`, and `instagram-conventions.md` (exactly 10 files, at Gemini's limit)
- **Gemini optimization**: Excluded `content-packages.md` to stay at 10 sources; merged social platform docs with level-1 headings and generated-file warning comment
- Script clears target directory contents before copying — stale files from previous runs never accumulate
- Invalid `--target=` values exit 1 with usage message (not silent no-op)
- Wired into package.json as `npm run build:adapters` for automation by subsequent plans

## Implementation Details

### File Counts by Target

| Target | Files | Location |
|--------|-------|----------|
| claude-skill | 13 | `skills/adapters/claude-skill/references/` |
| chatgpt | 13 | `skills/adapters/chatgpt/knowledge/` |
| gemini | 10 | `skills/adapters/gemini/knowledge/` |

### Generated social-conventions.md Structure

The merged file contains:
- HTML comment header noting it was generated and must not be hand-edited
- `# Twitter/X Conventions` heading + full twitter-conventions.md content
- `# Facebook Conventions` heading + full facebook-conventions.md content  
- `# Instagram Conventions` heading + full instagram-conventions.md content

### Dependencies

- **No new npm packages** — script uses only Node.js built-in `fs` and `path` modules
- package.json `dependencies` array unchanged (byte-for-byte)

## Verification Results

All acceptance criteria verified:

1. ✅ `node scripts/build-adapter-knowledge.js --target=gemini` produces exactly 10 files
2. ✅ `node scripts/build-adapter-knowledge.js --target=chatgpt` produces 13 files
3. ✅ `node scripts/build-adapter-knowledge.js --target=claude-skill` produces 13 files
4. ✅ Running twice produces same file counts (stale files cleared first)
5. ✅ No files under `references/` or `skills/state-schema.md` were modified
6. ✅ Invalid target exits 1 with usage message
7. ✅ `npm run build:adapters` exits 0 and populates all adapter directories

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- ✅ Created files exist on disk:
  - `scripts/build-adapter-knowledge.js` — FOUND
  - `skills/adapters/claude-skill/references/` — 13 files FOUND
  - `skills/adapters/chatgpt/knowledge/` — 13 files FOUND
  - `skills/adapters/gemini/knowledge/` — 10 files FOUND
- ✅ Commits exist:
  - `97fe836`: feat(01-06): implement build-adapter-knowledge.js script
  - `b3266b6`: chore(01-06): wire build script into package.json
- ✅ No file deletions in commits (expected — only additions)

## Next Steps

Plans 01-08, 01-09, and 01-10 will invoke `npm run build:adapters` after adding each adapter's SKILL.md/INSTRUCTIONS.md files, expecting the knowledge/reference folders to already be populated.
