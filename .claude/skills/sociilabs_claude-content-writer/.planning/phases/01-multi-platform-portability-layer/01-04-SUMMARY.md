---
phase: 01-multi-platform-portability-layer
plan: 04
type: execute
subsystem: content-writer-core
requires: [ADAPTER-01]
provides: [file-first-state-migration]
affects:
  - skills/writer/discuss.md
  - skills/writer/plan.md
  - skills/writer/execute.md
  - skills/writer/verify.md
  - skills/writer/ship.md
tech-stack:
  added: []
  patterns:
    - file-first-state-storage
    - memory-tool-as-secondary-cache
    - yaml-frontmatter-with-body-headings
key-files:
  created: []
  modified:
    - skills/writer/discuss.md
    - skills/writer/plan.md
    - skills/writer/execute.md
    - skills/writer/verify.md
    - skills/writer/ship.md
decisions:
  - Memory tool is now read-through cache, not source of truth
  - PROJECT-STATE.md is sole source of truth for workflow state
  - Each phase updates frontmatter `phase` field to track progress
  - ship.md sets `phase: complete` instead of deleting state
metrics:
  duration: 20min
  completed_date: "2026-07-04"
  tasks: 2
  files_modified: 5
status: complete
---

# Phase 01 Plan 04: Migrate Five-Phase Workflow to File-First State

## Summary

Migrated all five sequential workflow-phase commands (discuss → plan → execute → verify → ship) from memory-tool-primary to file-first state storage. Each command now reads from and writes to `content-writer-output/profile/PROJECT-STATE.md` as the primary state target, with Claude Code's memory tool serving only as an optional read-through cache.

## Key Changes

### discuss.md
- **Step 1 (Profile check)**: Now checks `PROFILE.md` file first, with memory as secondary cache
- **Step 4 (Save state)**: Writes full PROJECT-STATE.md template with `phase: discuss`, sets all frontmatter fields (platform, format, topic, angle, audience, awareness_stage, goal, framework, length, cta, research_urls, key_points), writes Discussion Brief under body heading

### plan.md
- **Step 1 (Load state)**: Loads PROJECT-STATE.md, checks for `phase: discuss`, reads Discussion Brief and frontmatter
- **Step 6 (Save plan state)**: Updates PROJECT-STATE.md with `phase: plan`, sets SEO fields (seo_primary_keyword, seo_secondary_keywords, seo_meta_title, seo_meta_description, seo_slug, platform_conventions_file, voice_notes, proof_points, cta_placement), writes Outline under body heading

### execute.md
- **Step 1 (Load all state)**: Loads PROJECT-STATE.md, checks for `phase: plan`, reads Discussion Brief and Outline sections plus all frontmatter fields
- **Step 7 (Save draft state)**: Updates PROJECT-STATE.md with `phase: execute`, sets draft_word_count and cta_expanded, writes Draft under body heading

### verify.md
- **Step 1 (Load draft)**: Loads PROJECT-STATE.md, checks for `phase: execute`, reads Draft section
- **Step 6 (Save verified state)**: Updates PROJECT-STATE.md with `phase: verify`, sets seo_score, ai_patterns_fixed, manual_check, writes Verified Content under body heading

### ship.md
- **Step 1 (Load verified content)**: Loads PROJECT-STATE.md, checks for `phase: verify`, reads Verified Content, Discussion Brief, and Outline sections
- **Step 7 (Mark project complete)**: Updates PROJECT-STATE.md with `phase: complete` — **does not delete the file**. A completed PROJECT-STATE.md signals the state machine to route back to `/writer:discuss` for a new project

## Migration Pattern

All five files follow the same pattern:
1. **Load**: Check file first; if Claude Code memory tool available, populate as read-through cache
2. **Save**: Write to file first; if memory tool available, mirror as secondary cache
3. **Conflict resolution**: File always wins

## Verification

```bash
# All five files reference PROJECT-STATE.md
grep -c "PROJECT-STATE.md" skills/writer/*.md
# discuss.md:1, plan.md:2, execute.md:2, verify.md:2, ship.md:3

# ship.md sets phase: complete
grep -c "phase: complete" skills/writer/ship.md
# 2
```

## Acceptance Criteria Met

- ✅ Each file contains PROJECT-STATE.md references in load and save steps
- ✅ discuss.md sets `phase: discuss`, plan.md sets `phase: plan`, execute.md sets `phase: execute`, verify.md sets `phase: verify`, ship.md sets `phase: complete`
- ✅ User-facing question text, framework-selection guidance, and confirmation prompts unchanged (only load/save mechanics changed)
- ✅ Memory-tool writes occur after file write in all files, never before or instead
- ✅ ship.md's filename generation, output directory logic, frontmatter template, and publishing-notes sections unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-02-03 (User editing state file) | accept | No change — user editing their own local state is expected behavior |
| T-02-04 (Phase advancing without confirmation) | mitigate | Existing "present and confirm before advancing" instructions left unchanged in all files |

## Commits

- `d0c4b9d`: feat(01-04): migrate discuss, plan, execute to file-first state
- `2ced066`: feat(01-04): migrate verify and ship to file-first state

## Self-Check: PASSED

- ✅ All modified files exist and contain correct content
- ✅ Commits exist in git history
- ✅ No user-facing prompts were changed (diff review confirms)
- ✅ All files reference PROJECT-STATE.md as primary state target
