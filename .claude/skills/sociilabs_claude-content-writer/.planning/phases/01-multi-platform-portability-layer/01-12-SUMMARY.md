---
phase: 01-multi-platform-portability-layer
plan: 12
subsystem: docs

tags: [manual-testing, checklists, verification, claude-ai, chatgpt, gemini]

# Dependency graph
requires:
  - phase: 01-multi-platform-portability-layer
    provides: Three platform adapters (Claude.ai Skill, ChatGPT Custom GPT, Gemini Gem) created in Wave 3
provides:
  - Claude.ai manual test checklist (10 steps, all 5 phases)
  - ChatGPT manual test checklist (10 steps, includes instructions-length verification)
  - Gemini manual test checklist (10 steps, includes 10-source verification and content-packages degradation check)
affects: [VERIFY-01 completion, documentation]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - docs/checklists/claude-ai-manual-test.md
    - docs/checklists/chatgpt-manual-test.md
    - docs/checklists/gemini-manual-test.md
  modified: []

key-decisions:
  - "Each checklist includes platform-specific verification (instructions length for ChatGPT, 10-source limit for Gemini)"
  - "All checklists verify the full five-phase cycle (discuss/plan/execute/verify/ship)"
  - "All checklists include the network-access fallback pattern verification"
  - "ChatGPT checklist explicitly verifies state-carrying rule (never claims to save state)"
  - "Gemini checklist explicitly verifies content-packages degradation behavior"

patterns-established:
  - "Manual test checklist format: numbered steps with PASS/FAIL criteria, summary table, failure documentation section"
  - "Checklist items test real shipped adapter behavior, not aspirational features"
  - "All checklists end with PASS/FAIL summary and transcript attachment instruction"

requirements-completed: [VERIFY-01]

# Coverage metadata
coverage:
  - id: D1
    description: "Claude.ai manual test checklist with 10 verification steps covering all five phases"
    requirement: "VERIFY-01"
    verification:
      - kind: manual_procedural
        ref: "docs/checklists/claude-ai-manual-test.md (file existence and content review)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ChatGPT manual test checklist with instructions-length verification and state-carrying rule compliance"
    requirement: "VERIFY-01"
    verification:
      - kind: manual_procedural
        ref: "docs/checklists/chatgpt-manual-test.md (file existence and content review)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Gemini manual test checklist with 10-source verification and content-packages degradation check"
    requirement: "VERIFY-01"
    verification:
      - kind: manual_procedural
        ref: "docs/checklists/gemini-manual-test.md (file existence and content review)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-04
status: complete
---

# Phase 01 Plan 12: Manual Test Checklists Summary

**Three manual test checklists (Claude.ai, ChatGPT, Gemini) that let a human verify each chat-platform adapter works end-to-end through all five phases of the content workflow.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-04T12:00:00Z
- **Completed:** 2026-07-04T12:15:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created Claude.ai manual test checklist with 10 verification steps
- Created ChatGPT manual test checklist with instructions-length verification
- Created Gemini manual test checklist with 10-source limit verification and content-packages degradation check

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the Claude.ai manual test checklist** - `9b5cc6e` (feat)
2. **Task 2: Write the ChatGPT and Gemini manual test checklists** - `9c9d65f` (feat)

## Files Created/Modified

- `docs/checklists/claude-ai-manual-test.md` - 10-step manual test checklist for Claude.ai Skill adapter, covering skill upload, activation by description, profile-first enforcement, all five phases, network-access fallback, and project state output verification
- `docs/checklists/chatgpt-manual-test.md` - 10-step manual test checklist for ChatGPT Custom GPT, including instructions-length verification (~4,424 vs ~8,000 limit), 14 knowledge files upload check, and explicit state-carrying rule compliance verification
- `docs/checklists/gemini-manual-test.md` - 10-step manual test checklist for Gemini Gem, including 10-knowledge-source verification (merged social-conventions.md) and content-packages degradation behavior check

## Decisions Made

- **Each checklist includes platform-specific verification points:**
  - Claude.ai: Skill upload and description-triggered activation
  - ChatGPT: Instructions length verification and state-carrying rule compliance
  - Gemini: 10-source limit verification and content-packages degradation

- **All checklists follow the same structure:**
  - 10 numbered steps with explicit PASS/FAIL criteria
  - Coverage of all five phases (discuss/plan/execute/verify/ship)
  - Network-access fallback verification
  - Project state output verification (all 28 frontmatter fields)
  - Summary table for tracking results
  - Failure documentation section with transcript attachment instruction

- **Checklists test real shipped adapter behavior:**
  - Each step references actual behavior documented in the adapter's INSTRUCTIONS.md
  - No aspirational or unimplemented features are tested
  - Platform-specific constraints (character limits, knowledge source limits) are explicitly verified

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- VERIFY-01 requirement is now satisfied
- All three chat-platform adapters have corresponding manual test checklists
- Documentation is complete for Phase 01 multi-platform portability layer
- Ready for final phase completion and milestone wrap-up

---
*Phase: 01-multi-platform-portability-layer*
*Completed: 2026-07-04*
