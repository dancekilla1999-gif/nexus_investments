---
phase: 01-multi-platform-portability-layer
plan: 11
type: execute
subsystem: documentation
tags: [docs, setup-guides, feature-matrix, npm-publishing]
dependency_graph:
  requires: ["01-03", "01-04", "01-05", "01-06", "01-07", "01-08", "01-09", "01-10"]
  provides: [DOCS-01, DOCS-02]
  affects: [package.json]
tech_stack:
  added: []
  patterns: [markdown-docs, npm-files-array]
key_files:
  created:
    - docs/setup-claude-code.md
    - docs/setup-claude-ai.md
    - docs/setup-chatgpt.md
    - docs/setup-gemini.md
    - docs/setup-headless.md
    - docs/feature-degradation-matrix.md
  modified:
    - package.json
metrics:
  duration: 20min
  completed_date: 2026-07-04
status: complete
---

# Phase 01 Plan 11: Per-Platform Setup Guides and Feature-Degradation Matrix

## One-Liner Summary

Created five per-platform setup guides and a feature-degradation matrix documenting exactly what users gain and lose on each platform compared to Claude Code, plus published docs/ to npm.

## What Was Built

### Setup Guides (DOCS-01)

Five exact setup guides covering all supported platforms:

| File | Platform | Lines | Key Content |
|------|----------|-------|-------------|
| `docs/setup-claude-code.md` | Claude Code | ~180 | Install flow, migration note for existing users, `/writer:*` commands, file storage locations |
| `docs/setup-claude-ai.md` | Claude.ai/API | ~165 | Skill upload (web + API), description-triggered invocation, container state management |
| `docs/setup-chatgpt.md` | ChatGPT | ~230 | Custom GPT creation, 14 knowledge files upload, ~8K char limit note, state-carrying rules |
| `docs/setup-gemini.md` | Gemini | ~210 | Gem creation, 10 knowledge sources upload, content-packages exclusion notice, merged social conventions |
| `docs/setup-headless.md` | Headless/MCP | ~270 | MCP server run instructions, JSON-RPC tool contract, 5 tools + 1 resource reference |

### Feature-Degradation Matrix (DOCS-02)

| File | Lines | Content |
|------|-------|---------|
| `docs/feature-degradation-matrix.md` | ~200 | 6 capabilities × 5 platforms matrix with native/degraded/unavailable status and named fallbacks |

**Capabilities documented:**
1. URL tone scanning
2. Auto-update check
3. SEO integration
4. Anti-AI integration
5. Multi-platform content packages
6. File persistence

**Platforms covered:** Claude Code, Claude.ai/API, ChatGPT, Gemini, Headless/MCP

### NPM Publishing

Updated `package.json` to include `docs/` in the `files` array, ensuring setup guides and degradation matrix are published to npm and available to installed users.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Each guide ends with "Verify it worked" section | Per PLAN.md acceptance criteria — every guide must point at concrete verification artifacts |
| ChatGPT instructions mention ~8,000 char limit | Per RESEARCH.md Assumption A1 — warn users even though actual instructions are ~4,400 chars |
| Gemini guide includes explicit character-count verification note at top | Per RESEARCH.md Assumption A6 and Phase 01-10 decision — Gemini publishes no official limit |
| Matrix explicitly states "unavailable" with redirect for content-packages on Gemini | Per Phase 01-10 decision and RESEARCH.md Pitfall 4 avoidance — do not silently omit capabilities |
| Headless guide points to README.md for full tool contract | Avoids duplicating the authoritative contract; maintains single source of truth |

## Verification Results

- [x] All five `docs/setup-*.md` files exist
- [x] Each guide names exact adapter artifact paths (e.g., `skills/adapters/chatgpt/INSTRUCTIONS.md`, `skills/adapters/chatgpt/knowledge/`)
- [x] Each guide ends with "Verify it worked" section pointing at verification artifacts
- [x] `docs/setup-claude-code.md` explicitly states automatic migration for existing users
- [x] `docs/feature-degradation-matrix.md` exists with 6 capabilities × 5 platforms
- [x] Every cell states native support, named fallback, or named unavailability with redirect
- [x] Gemini column's content-packages row states exclusion consistent with `skills/adapters/gemini/INSTRUCTIONS.md`
- [x] `package.json` `files` array includes `"docs/"`

## Deviations from Plan

**None.** Plan executed exactly as written.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| `b26bed3` | docs(01-11): add five per-platform setup guides | 5 files |
| `01b126e` | docs(01-11): add feature-degradation matrix and publish docs/ | 2 files |

## Self-Check: PASSED

- [x] All created files exist on disk
- [x] All commits exist in git history
- [x] package.json contains docs/ in files array
- [x] All acceptance criteria satisfied

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| DOCS-01 | Complete | Five setup guides with exact steps and verification pointers |
| DOCS-02 | Complete | Feature-degradation matrix with all cells named (no blanks) |

## Threat Flags

None. Threat model T-01-11-01 (information disclosure via docs/ publishing) was accepted in PLAN.md — docs/ contains only already-public repository files.

## Notes

- All setup guides reference `docs/checklists/*-manual-test.md` files that will be created by a later plan in this phase
- Migration note in Claude Code guide references the one-time upgrade path implemented in Phase 01-03 through 01-05
- Feature matrix explicitly documents the Gemini content-packages exclusion per Phase 01-10 design decision
