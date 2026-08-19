# Roadmap: content-writer — Multi-Platform Portability

## Overview

content-writer today is a single-surface product: a Claude Code skill whose state machine, invocation model, and distribution all assume a terminal-based coding agent with filesystem access and a keyed memory API. This milestone extracts the platform-neutral content-strategy engine already living in `references/*.md`, defines a portable state format to replace the Claude-Code-only memory API, and ships adapters so the same five-phase workflow runs well on Claude.ai chat (with Skills), ChatGPT, Google Gemini, and headless/automated agent platforms — without regressing the existing Claude Code experience.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Multi-Platform Portability Layer** - Decouple the content-strategy engine from Claude Code specifics and ship adapters for Claude.ai Skills, ChatGPT, Gemini, and headless/automated agents.

## Phase Details

### Phase 1: Multi-Platform Portability Layer

**Goal**: The five-phase content workflow (Discuss → Plan → Execute → Verify → Ship) and its brand-voice profile system run correctly on Claude Code, Claude.ai, ChatGPT, Gemini, and a headless/automated-agent contract — from one shared, platform-neutral knowledge base — with zero regression for existing Claude Code users.

**Depends on**: Nothing (first phase)

**Requirements**: PORTABLE-01, PORTABLE-02, PORTABLE-03, ADAPTER-01, ADAPTER-02, ADAPTER-03, ADAPTER-04, ADAPTER-05, DOCS-01, DOCS-02, VERIFY-01, VERIFY-02

**Success Criteria** (what must be TRUE):

  1. Core content-strategy knowledge (frameworks, platform conventions, anti-AI checklist, SEO conventions, profile schema) lives in reference docs that read correctly with no mention of Claude-Code-only mechanics (memory-tool keys, slash commands, `~/.claude` paths)
  2. Claude Code's `/writer:*` commands read/write project and profile state through the new portable file-based schema (memory tool is a cache on top, not the source of truth), and an automated check confirms every command still works post-migration
  3. A packaged Claude.ai Skill, a ChatGPT Custom GPT package, and a Gemini Gem package each exist in-repo, built from the same shared reference docs rather than three separate copies of the content-strategy knowledge
  4. Each of the three chat-platform adapters ships with a manual test checklist a human can run once, post-setup, to confirm the full Discuss→Plan→Execute→Verify→Ship cycle works end-to-end on that platform
  5. A headless agent (no human answering clarifying questions) can drive one phase at a time via a documented structured I/O contract and produce comparable output quality to the interactive flow
  6. Existing Claude Code users see no regression: every `/writer:*` command behaves exactly as before from the user's perspective

**Plans**: 12/13 plans executed

Plans:

- [x] 01-01-PLAN.md — Portable state schema (profile + project-state) and reference-doc neutralization
- [x] 01-02-PLAN.md — Structural lint script (VERIFY-02 infra), zero new dependencies
- [x] 01-03-PLAN.md — ADAPTER-01: shared-context.md migrated to file-first storage + phase state machine
- [x] 01-04-PLAN.md — ADAPTER-01: discuss/plan/execute/verify/ship commands migrated to file-first state
- [x] 01-05-PLAN.md — ADAPTER-01: profile commands + next/status migrated to file-first state
- [x] 01-06-PLAN.md — Shared adapter-knowledge build script (no duplicated reference copies)
- [x] 01-07-PLAN.md — ADAPTER-05: MCP tool/resource contract + minimal reference server
- [x] 01-08-PLAN.md — ADAPTER-02: Claude.ai / Claude API Skill bundle
- [x] 01-09-PLAN.md — ADAPTER-03: ChatGPT Custom GPT instructions + knowledge files
- [x] 01-10-PLAN.md — ADAPTER-04: Gemini Gem instructions + knowledge sources (10-source limit)
- [x] 01-11-PLAN.md — DOCS-01/DOCS-02: per-platform setup guides + feature-degradation matrix
- [x] 01-12-PLAN.md — VERIFY-01: manual test checklists (Claude.ai, ChatGPT, Gemini)
- [ ] 01-13-PLAN.md — Phase integration gate: human regression pass + full automated lint

## Progress

**Execution Order:**
Phase 1 only (single-phase milestone).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Multi-Platform Portability Layer | 12/13 | In Progress|  |
