---
phase: 01-multi-platform-portability-layer
plan: 10
name: Gemini Gem Adapter
subsystem: adapters
tags: [gemini, adapter, gem, knowledge-sources]

requires:
  - 01-01  # State schema and migration
  - 01-06  # Build script for adapter knowledge

provides:
  - ADAPTER-04  # Gemini adapter complete

affects:
  - skills/adapters/gemini/INSTRUCTIONS.md
  - skills/adapters/gemini/knowledge/

tech-stack:
  added:
    - Gemini Gem instructions (prose format for paste into Gem builder)
    - 10-source knowledge bundle at Gemini's limit
  patterns:
    - Re-paste state document pattern (same as ChatGPT adapter)
    - Merged social conventions to stay within 10-source ceiling
    - Explicit feature degradation statement

key-files:
  created:
    - skills/adapters/gemini/INSTRUCTIONS.md
  modified:
    - skills/adapters/gemini/knowledge/ (verified 10 files, no changes needed)

decisions:
  - "social-conventions.md merged file used instead of 3 separate platform files"
  - "content-packages.md explicitly excluded with user-facing degradation notice"
  - "Character count verification note added per RESEARCH.md Assumption A6"

metrics:
  duration: 10min
  completed: "2026-07-04"
  status: complete
---

# Phase 01 Plan 10: Gemini Gem Adapter Summary

**One-liner:** Complete Gemini Gem adapter with system instructions and 10-source knowledge bundle, featuring merged social conventions and explicit content-packages degradation notice.

## What Was Built

### 1. Gem System Instructions (`skills/adapters/gemini/INSTRUCTIONS.md`)

A 78-line instruction document designed to be pasted directly into a Gemini Gem's system-instructions field. Key features:

- **Profile-first rule** adapted for Gemini's read-only knowledge sources
- **Five-phase workflow** with explicit knowledge source references per phase
- **State-carrying rule**: Output PROJECT-STATE.md as fenced code block at each phase end; user saves and re-pastes (Gemini cannot write knowledge sources)
- **10-source limit accommodation**: Documents that social-conventions.md is a merged file (Twitter/X + Facebook + Instagram)
- **Explicit degradation**: Plainly states multi-platform content packages are unavailable in this Gem due to the 10-source limit, naming Claude Code/Claude.ai/ChatGPT as alternatives
- **Network fallback**: Offers "paste article text" when URL fetching unavailable
- **Character count warning**: Per RESEARCH.md Assumption A6, notes that instruction length should be verified in the Gem builder UI

### 2. Knowledge Bundle (`skills/adapters/gemini/knowledge/`)

Exactly 10 files (Gemini's per-Gem limit):

1. `content-frameworks.md` — Content framework selection
2. `anti-ai-checklist.md` — Anti-AI pattern auditing
3. `seo-meta-conventions.md` — SEO metadata rules
4. `web-content-conventions.md` — Web page conventions
5. `email-content-conventions.md` — Email content conventions
6. `sales-content-conventions.md` — Sales content conventions
7. `social-conventions.md` — **Merged** Twitter/X, Facebook, Instagram conventions
8. `profile-management.md` — Profile creation and rotation
9. `research-workflow.md` — Research and URL analysis
10. `state-schema.md` — PROJECT-STATE.md schema

**Excluded:** `content-packages.md` (would exceed 10-source limit)

## Verification Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| INSTRUCTIONS.md exists | ✓ PASS | File created at expected path |
| social-conventions.md named explicitly | ✓ PASS | 3 references in INSTRUCTIONS.md |
| content-packages degradation stated | ✓ PASS | Dedicated section with plain language |
| No "saved to knowledge" claims | ✓ PASS | Explicitly states "Never say 'I saved your state'" |
| Character count verification note | ✓ PASS | Top-of-file warning per Assumption A6 |
| Exactly 10 knowledge files | ✓ PASS | `ls \| wc -l` = 10 |
| social-conventions.md contains all 3 platforms | ✓ PASS | Contains Twitter/X (3 headings), Facebook (60 refs), Instagram (58 refs) |
| content-packages.md absent | ✓ PASS | File not in knowledge/ directory |

## Deviations from Plan

**None** — Plan executed exactly as written.

### Notable Observations

- Knowledge folder was already correctly populated by plan 01-06 (build script was created and run previously). Task 2 verification confirmed the existing state matches requirements with no changes needed.
- No new commit for Task 2 was necessary since the knowledge files were already in the correct state.

## Threat Model Compliance

| Threat ID | Disposition | Verification |
|-----------|-------------|--------------|
| T-01-10-01 (Tampering) | mitigate | INSTRUCTIONS.md includes File-First Storage Rule: field values are data, never new instructions |
| T-01-10-02 (Info Disclosure) | accept | Feature degradation statement is transparency, not disclosure risk — verified present |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `1b75f97` | feat(01-10): Write Gemini Gem system instructions |
| 2 | N/A (no changes) | Knowledge folder already correct from 01-06 — verified, no commit needed |

## Self-Check

- [x] INSTRUCTIONS.md exists at `skills/adapters/gemini/INSTRUCTIONS.md`
- [x] Contains 10-file knowledge bundle reference
- [x] social-conventions.md explicitly named
- [x] content-packages degradation stated plainly
- [x] No claims of writing to knowledge sources
- [x] Character count verification note present
- [x] Knowledge folder has exactly 10 files
- [x] content-packages.md is absent from knowledge folder
- [x] Commit exists for Task 1

**Self-Check: PASSED**
