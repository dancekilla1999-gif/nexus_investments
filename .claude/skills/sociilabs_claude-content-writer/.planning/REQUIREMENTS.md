# Requirements: content-writer — Multi-Platform Portability

**Defined:** 2026-07-04
**Core Value:** Content that sounds like a specific human wrote it — produced through a repeatable, profile-driven process, not a single ad-hoc prompt.

## v1 Requirements

All in scope for Phase 1 (single-phase roadmap, per explicit request).

### Portable Core

- [x] **PORTABLE-01**: Content-strategy knowledge (frameworks, platform conventions, anti-AI checklist, SEO conventions, profile questionnaire) is documented so any sufficiently capable LLM can execute it from the reference docs alone — no Claude-Code-specific syntax or mechanics assumed
- [x] **PORTABLE-02**: A portable profile/project-state document schema (plain markdown/YAML) replaces reliance on Claude Code's keyed memory-tool API as the only state store — usable as a file, pasted text, or re-uploaded document
- [x] **PORTABLE-03**: The five-phase workflow (Discuss → Plan → Execute → Verify → Ship) is expressed as a platform-agnostic state machine — "what phase am I in, what's next" is derivable from the state document alone

### Platform Adapters

- [x] **ADAPTER-01**: Claude Code adapter — existing `/writer:*` commands keep working unchanged from the user's perspective; internal state storage in `shared-context.md`/`skills/writer/*.md` is migrated (not left as-is) to the new portable schema as source of truth, with Claude Code's memory tool becoming an optional fast-path cache on top
- [x] **ADAPTER-02**: Claude.ai (chat + API) Skills adapter — packaged to match Claude's skill-invocation model (conversation-triggered by description, not slash commands), runnable in claude.ai's skill/code-execution environment
- [x] **ADAPTER-03**: ChatGPT adapter — Custom GPT instructions + knowledge files (or equivalent GPT Actions/Apps packaging) reproducing the phased workflow conversationally, with state carried in-chat or via uploaded/downloaded files
- [x] **ADAPTER-04**: Gemini adapter — Gem system instructions + knowledge files reproducing the same phases, accounting for Gemini's own context/state constraints
- [x] **ADAPTER-05**: Headless/automated-agent adapter — a documented structured JSON-in/JSON-out contract per phase so no-code platforms (n8n, Zapier, Make) or custom API-driven agents can drive the workflow without blocking on interactive clarification menus

### Documentation

- [ ] **DOCS-01**: Per-platform setup guide — exact steps to load/run this system on each of the five surfaces
- [ ] **DOCS-02**: Feature-degradation matrix — which capabilities (URL tone scanning, auto-update check, SEO/humanizer integration, file persistence) degrade or fall back on which platform, and how

### Verification

- [ ] **VERIFY-01**: Per-platform manual test checklist (Claude.ai, ChatGPT, Gemini) — concrete steps the user runs once per platform after setup to confirm the adapter works end-to-end, since the building agent cannot script those platforms' builder UIs
- [ ] **VERIFY-02**: Automated check (script or test) confirming existing Claude Code `/writer:*` commands still function after the state-storage migration — the one adapter that CAN be verified without a human clicking through a GUI

## v2 Requirements

Deferred — acknowledged but not in this roadmap.

### Distribution

- **DIST-01**: Publish adapter packages to each platform's store/gallery (GPT Store, Gemini Gem gallery, Claude Skill directory)
- **DIST-02**: Hosted state-sync service for cross-platform continuity (e.g., start a project in ChatGPT, finish it in Claude Code)

## Out of Scope

| Feature | Reason |
|---------|--------|
| GPT Store / Gemini Gem gallery publishing | Distribution/business step, not a code change |
| Hosted backend or database for state sync | State stays portable documents, not a service, for this milestone |
| Rewriting claude-seo or humanizer internals | Only need their existing manual-fallback checklists promoted to first-class; the dependencies themselves are separate projects |
| npm publishing/CI pipeline changes beyond what new adapter files require | Not part of the portability problem |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PORTABLE-01 | Phase 1 | Complete |
| PORTABLE-02 | Phase 1 | Complete |
| PORTABLE-03 | Phase 1 | Complete |
| ADAPTER-01 | Phase 1 | Complete |
| ADAPTER-02 | Phase 1 | Complete |
| ADAPTER-03 | Phase 1 | Complete |
| ADAPTER-04 | Phase 1 | Complete |
| ADAPTER-05 | Phase 1 | Complete |
| DOCS-01 | Phase 1 | Pending |
| DOCS-02 | Phase 1 | Pending |
| VERIFY-01 | Phase 1 | Pending |
| VERIFY-02 | Phase 1 | Pending |

**Coverage:**

- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-04*
*Last updated: 2026-07-04 after initial bootstrap*
