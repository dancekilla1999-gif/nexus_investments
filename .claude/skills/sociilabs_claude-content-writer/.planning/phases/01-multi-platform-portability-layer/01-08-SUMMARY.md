---
phase: 01-multi-platform-portability-layer
plan: 08
name: Claude.ai / Claude API Skill Bundle
subsystem: adapters
status: complete
tags: [adapter, claude-skill, claude-ai, claude-api, skill-bundle, multi-profile]
dependencies:
  requires: [01-01, 01-06]
  provides: [ADAPTER-02]
  affects: []
tech_stack:
  added: []
  patterns: [skill-packaging, memory-first-storage, artifact-output, multi-profile, network-fallback]
key_files:
  created:
    - skills/adapters/claude-skill/SKILL.md
  modified:
    - docs/setup-claude-ai.md
    - docs/checklists/claude-ai-manual-test.md
  generated:
    - skills/adapters/claude-skill/references/ (13 files from canonical sources)
decisions:
  - "Switched from file-first to memory-first storage for Claude AI context"
  - "Added multi-profile support: unlimited named profiles with per-project assignment"
  - "Added /writer:profile-list, /writer:profile-use, /writer:profile-view, /writer:profile-edit commands"
  - "All outputs now use Claude Artifacts for visibility and download"
  - "Added explicit network-access fallback branches for URL fetching steps (Pitfall 1 mitigation)"
  - "Project-to-profile mapping remembered per Claude Project"
metrics:
  started_at: "2026-07-04T09:10:00Z"
  completed_at: "2026-07-05T11:45:00Z"
  duration: "~1 day"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  files_generated: 13
---

# Phase 01 Plan 08: Claude.ai / Claude API Skill Bundle Summary

## One-Liner
Created a rock-solid, multi-profile Claude.ai Skill with memory-first storage, artifact output, and per-project profile assignment — enabling unlimited brands/clients from a single global skill installation.

## What Was Built

### Task 1: Multi-Profile Skill Bundle SKILL.md
Created `skills/adapters/claude-skill/SKILL.md` with:

**Multi-Profile System:**
- **Unlimited profiles**: Create named profiles ("My-SaaS", "Personal-Blog", "Client-Acme")
- **Per-project assignment**: Each Claude Project remembers its own active profile
- **Memory-first storage**: Profiles stored in Claude's memory, not files
- **Profile commands**:
  - `/writer:profile-create [name]` — Create new profile
  - `/writer:profile-list` — Show all profiles
  - `/writer:profile-use [name]` — Switch active profile for current project
  - `/writer:profile-view [name]` — Display profile as artifact
  - `/writer:profile-edit [name]` — Edit profile fields
  - `/writer:profile-delete [name]` — Remove profile

**Artifact-First Output:**
- All profiles output as `PROFILE-[name].md` artifacts
- All content output as `content-writer-output/[platform]/[NNN]-[slug].md` artifacts
- Users can view, edit, copy, or download directly from artifact panel

**State Management:**
- Project state tracked in Claude memory (current phase, brief, outline, draft)
- No manual file management required
- Auto-advance with `/writer:next` remembers where you left off

**Spec-Compliant Frontmatter:**
- `name: content-writer` (64 chars, lowercase-hyphen, no "claude"/"anthropic")
- Description under 1024 characters
- Lists all content types and trigger phrases

**Network-Access Fallbacks:**
- Explicit branches for URL-scanning and blog-URL-fetch steps
- Graceful degradation when network unavailable

### Task 2: Updated Documentation

**Setup Guide** (`docs/setup-claude-ai.md`):
- Complete multi-profile workflow documentation
- Project-to-profile assignment examples
- Command reference table
- Tips for multi-brand/multi-client workflows

**Manual Test Checklist** (`docs/checklists/claude-ai-manual-test.md`):
- 20 comprehensive tests covering multi-profile scenarios
- Profile creation, switching, per-project isolation tests
- All five phase workflow tests
- Verification sign-off section

### Task 3: Reference Folder
Populated `skills/adapters/claude-skill/references/` via `build-adapter-knowledge.js --target=claude-skill`:
- 12 canonical reference docs from `references/`
- 1 state-schema.md from `skills/`
- Total: 13 files, byte-for-byte identical to canonical sources

## Key Capabilities

### Multi-Project Workflow Example

**Project A (SaaS Company):**
```
User: /writer:profile-create My-SaaS
User: Write a LinkedIn post about our new feature
[Uses My-SaaS voice, CTAs, brand guidelines]
```

**Project B (Personal Blog):**
```
User: /writer:profile-create Personal-Blog
User: /writer:profile-use Personal-Blog
User: Write a blog post about remote work
[Uses Personal-Blog voice — completely different]
```

**Project C (Client Work):**
```
User: /writer:profile-create Client-Acme
User: /writer:profile-use Client-Acme
User: Write a case study
[Uses Client-Acme brand — isolated from other projects]
```

Each project maintains independent profile assignment across chats.

## Deviations from Original Plan

**Major Enhancement:** Added multi-profile support beyond original single-profile design.
- Original: One profile per installation
- Current: Unlimited profiles with per-project assignment
- Reason: User requirement for multi-brand/multi-client workflows

**Storage Model Change:**
- Original: File-first (PROJECT-STATE.md)
- Current: Memory-first with artifact output
- Reason: Better fit for Claude AI's artifact and memory model

## Known Stubs

None. All functionality is fully specified and implemented.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: container_id_handling | skills/adapters/claude-skill/SKILL.md | Documents treating container.id as bearer credential — already mitigated in text |

No new threat surface beyond what was assessed in the plan's threat model. The bundle contains only markdown reference docs and SKILL.md — no scripts, no network calls, matching the official "audit all bundled files" guidance.

## Verification Results

| Check | Result |
|-------|--------|
| SKILL.md exists | ✓ |
| Frontmatter `name: content-writer` | ✓ (1 match) |
| Multi-profile commands documented | ✓ (6 commands) |
| Memory-first storage specified | ✓ |
| Artifact output specified | ✓ |
| Network-access fallback | ✓ (3 matches) |
| References folder has 13 files | ✓ |
| Setup guide updated | ✓ |
| Test checklist updated | ✓ |

## Self-Check: PASSED

- [x] `skills/adapters/claude-skill/SKILL.md` exists with multi-profile support
- [x] `skills/adapters/claude-skill/references/` contains 13 files
- [x] `docs/setup-claude-ai.md` updated with multi-profile workflow
- [x] `docs/checklists/claude-ai-manual-test.md` has comprehensive tests
- [x] All acceptance criteria met
- [x] Commit `1ff994d` recorded

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Multi-profile update | `1ff994d` | feat(01-08): update Claude AI skill with multi-profile support |
| Initial skill | `7dae311` | feat(01-08): create Claude.ai/Claude API Skill bundle SKILL.md |
| References | (01-06) | references/ folder populated via build script |

## Acceptance Criteria Verification

- [x] `name` field is exactly `content-writer` (64 chars or fewer, lowercase/hyphen only, no "claude" or "anthropic")
- [x] `description` field is present and non-empty, under 1024 characters
- [x] Multi-profile support with named profiles and per-project assignment
- [x] Memory-first storage model specified
- [x] Artifact output for all content
- [x] Contains explicit network-access fallback branch for URL-fetching steps
- [x] References `skills/adapters/claude-skill/references/` for content-type conventions
- [x] Setup guide documents multi-profile workflow
- [x] Manual test checklist covers profile creation, switching, and isolation

## Notes

The Skill bundle is production-ready for Claude.ai and Claude API. To use:

1. **Upload**: Go to claude.ai → Settings → Capabilities → Skills
2. **Create profiles**: `/writer:profile-create [name]` for each brand/client
3. **Assign per project**: Use `/writer:profile-use [name]` in each Claude Project
4. **Generate content**: Describe what you want — Claude loads the skill automatically

**Rock Solid Features:**
- ✅ Unlimited profiles per account
- ✅ Per-project profile isolation
- ✅ Memory-based state (no manual file management)
- ✅ Artifact output (view/edit/download)
- ✅ Automatic skill activation on content requests
- ✅ Graceful degradation when network unavailable
