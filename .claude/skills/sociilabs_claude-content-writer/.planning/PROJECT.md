# content-writer

## What This Is

A five-phase (Discuss → Plan → Execute → Verify → Ship) content-generation system distributed as a Claude Code skill (npm package `claude-content-writer`). It produces blog articles, social posts, email content, web/sales pages, case studies, and SEO metadata calibrated to a persistent brand-voice profile, with built-in SEO (claude-seo) and anti-AI-pattern (humanizer) auditing at the verify step.

## Core Value

Content that sounds like a specific human wrote it — produced through a repeatable, profile-driven process, not a single ad-hoc prompt.

## Business Context

- **Customer**: Claude Code users who install via `npx skills add sociilabs/claude-content-writer` (founders, agencies, developers building content pipelines)
- **Revenue model**: Free, MIT-licensed distribution (no direct monetization)
- **Success metric**: Adoption/reach — currently capped at Claude Code's install base; this milestone's goal is expanding reach to chat-based and automated-agent surfaces

## Requirements

### Validated

<!-- Shipped and confirmed working, all Claude-Code-specific today. -->

- ✓ Five-phase `/writer:discuss|plan|execute|verify|ship` workflow with `/writer:next` auto-advance — v2.0.0
- ✓ Brand-voice profile system: URL-scan tone detection + 10-topic questionnaire, persisted via Claude Code's memory tool with file fallback (`content-writer-output/profile/*.md`) — v2.0.0
- ✓ SEO (claude-seo) and anti-AI (humanizer) integration at Verify phase, each with a documented manual-checklist fallback when the dependency isn't installed — v2.0.0
- ✓ Command-per-skill packaging: npm `postinstall` copies each `skills/writer/*.md` into its own `~/.claude/skills/writer-{cmd}/SKILL.md` — v2.1.0
- ✓ Auto-update notification via `npm view claude-content-writer version` check once per session — v2.0.1
- ✓ Platform-neutral content-strategy knowledge already isolated in `references/*.md` (frameworks, per-platform conventions, anti-AI checklist, SEO conventions) — no Claude-Code-specific syntax in these files today

### Active

<!-- Full detail and IDs in REQUIREMENTS.md. Summary: -->

- [ ] Extract the content-strategy engine (frameworks, conventions, profile schema, five-phase state machine) into a platform-neutral core that assumes no proprietary memory API and no guaranteed filesystem access
- [ ] Define a portable profile/project-state document format that works as plain files, pasted text, or re-uploaded documents
- [ ] Ship a Claude.ai (chat + API) Skills adapter
- [ ] Ship a ChatGPT adapter (Custom GPT instructions + knowledge files)
- [ ] Ship a Gemini adapter (Gem instructions + knowledge files)
- [ ] Ship a headless/automated-agent adapter (structured I/O contract, no blocking clarification prompts)
- [ ] Document per-platform setup and a feature-degradation matrix
- [ ] Zero regression for existing Claude Code `/writer:*` users

### Out of Scope

- Publishing to the GPT Store or Gemini Gem gallery — distribution/business step, not a code change
- A hosted backend or database for cross-platform state sync — state stays portable documents, not a service
- Rewriting `claude-seo` or `humanizer` themselves — this work only needs their existing manual-fallback paths to be first-class, not degraded, on non-Claude-Code surfaces
- Changes to the npm publishing/CI pipeline beyond what's needed to ship new adapter files

## Context

- **Today's coupling to Claude Code**, discovered by reading the current source:
  - State persistence relies on Claude Code's keyed memory tool (`[Content Writer] Current Project - *` entries), with markdown files as the documented fallback/source of truth (`shared-context.md`: "file is authoritative, memory syncs from it")
  - Invocation relies on Claude-Code slash-command skill frontmatter (`name: writer:discuss`) and the `@~/.claude/skills/...` file-transclusion include syntax
  - Distribution relies on `npx skills add` + an npm `postinstall.js` that writes directly into `~/.claude/skills/` in the user's home directory
  - Update-check shells out to `npm view`, assuming a local Node/npm terminal
  - Sibling dependencies (claude-seo, humanizer) are themselves Claude-Code-only skills, invoked via slash commands, already with manual fallbacks documented in `references/anti-ai-checklist.md` and a basic SEO checklist
- **Reusable today**: `references/*.md` (frameworks, per-platform conventions, anti-AI checklist, SEO conventions, profile topics) read as plain prose/tables — this is most of the actual product knowledge, and it's already platform-neutral
- **Target surfaces named by the user**: Claude.ai chat (with Skills), ChatGPT, Google Gemini, and unspecified automated/agentic platforms — in addition to keeping Claude Code working as-is

## Constraints

- **Compatibility**: Existing installed Claude Code users' `/writer:*` commands must keep working unchanged — no breaking migration
- **Platform capability**: Claude.ai, ChatGPT, and Gemini expose no equivalent of Claude Code's keyed memory-tool API and no guaranteed arbitrary local filesystem writes — state must be representable as plain documents a user can carry/re-upload
- **Distribution**: Non-Claude-Code adapters can't rely on `~/.claude` or the npm postinstaller, since those platforms never run this package's install script
- **Dependencies**: claude-seo/humanizer are Claude-Code-only; other adapters need the existing manual-fallback checklists promoted to first-class, not treated as a degraded path

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bootstrap this repo's `.planning/` minimally (skip the full interactive `/gsd-new-project` questionnaire) | User already stated the goal clearly; repo is small enough (~14 skill files, ~12 reference docs) to brownfield-infer context by direct read | — Pending |
| Scope the multi-platform portability work as a single ROADMAP phase, split into multiple Plans during planning | Explicit user instruction: "plan all of this into a single phase for execution" | — Pending |
| Skip `/gsd-discuss-phase`; plan from brownfield-inferred PROJECT.md/ROADMAP.md/REQUIREMENTS.md + inline clarifying questions instead | User chose speed over a separate conversational context-gathering pass | — Pending |
| Migrate the existing Claude Code adapter's internal state storage (memory-key scheme in `shared-context.md`/`skills/writer/*.md`) to the new portable file-based schema now, rather than leaving it untouched | User chose one source of truth over deferring migration; accepts the regression risk of touching working code, to be managed via careful testing of `/writer:*` commands | — Pending |
| Verify the ChatGPT/Gemini/Claude.ai adapters via shipped artifacts + a manual test checklist, not live browser automation or agent-driven UI testing | The agent building this cannot reliably script the GPT Builder, Gem builder, or claude.ai skill-upload UI; user will click through each platform once using the checklist | — Pending |

---
*Last updated: 2026-07-04 after initial bootstrap*
