# Phase 1: Multi-Platform Portability Layer - Research

**Researched:** 2026-07-04
**Domain:** Multi-platform LLM agent packaging (Claude.ai Skills, Custom GPTs, Gemini Gems, MCP servers) + portable state-document design
**Confidence:** MEDIUM

## Summary

This phase turns a Claude-Code-only skill into five platform packages sharing one knowledge base. The good news, confirmed against live docs: the repo's existing pattern — plain markdown reference files plus a `PROFILE.md`-style state document with "file is authoritative, memory syncs from it" — is *already* the industry-converging shape for portable agent state (Anthropic's own SKILL.md spec, the community AGENTS.md spec, and an emerging "Open Knowledge Format" all use YAML-frontmatter-plus-markdown-body files with no SDK). This phase should extend that pattern into a formal schema, not invent a new one.

The four target surfaces split into two very different capability tiers. Claude.ai and the Claude API share one packaging format (a `SKILL.md`-fronted directory, description-triggered, not slash-command-based) with real filesystem access inside a code-execution container — but that container's filesystem is ephemeral unless the *same* container ID is reused across calls, and claude.ai's uploaded skills don't sync to the API side at all. ChatGPT (Custom GPT instructions + knowledge files, ~8,000-char instructions limit, 20 files/512MB each) and Gemini (Gems: instructions + up to 10 knowledge sources) have no comparable persistent filesystem — state for both must live in re-uploaded/re-pasted documents or the platform's own opaque "memory" feature, which is per-GPT/per-Gem and not guaranteed durable. For the headless/automated-agent adapter, research strongly favors packaging as an **MCP server**: MCP is now the substrate underneath OpenAI's own Apps SDK (announced 2025, rolling out 2026) and is natively supported by n8n, Zapier, and Make in 2026 — one MCP server implementation plausibly serves Claude Code, Claude.ai (via MCP connectors), API-driven agents, and no-code platforms simultaneously, which a plain JSON-in/JSON-out contract cannot.

**Primary recommendation:** Formalize the existing `PROFILE.md`/`PRODUCTS.md`/`CTAS.md`/`CASE-STUDIES.md` + project-state-document pattern into the portable schema (PORTABLE-02) rather than replacing it; build the Claude.ai/API Skill and the headless adapter from the *same* reference docs as Claude Code; ship the headless adapter as an MCP server with one tool per phase (not one tool with a mode switch) plus a read-only resource exposing current project state; and verify ChatGPT/Gemini/Claude.ai adapters only via the manual checklists this phase produces, since none of those three builder UIs can be scripted reliably.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Content-strategy knowledge (frameworks, conventions, checklists) | Shared reference docs (platform-neutral) | — | Already plain prose/tables; every adapter reads the same files, no duplication |
| Profile / project-state schema | Portable state document (file) | Claude Code memory tool (cache only) | Only the file layer exists on every surface; memory is a Claude-Code-only fast path |
| Five-phase state machine ("what phase am I in") | State document (derivable fields) | Adapter-specific prompt logic | Must be inferable by reading the doc alone, per PORTABLE-03 — no hidden runtime state |
| Claude Code adapter | Claude Code skill files (`.claude/skills/writer-*`) | Memory tool (cache) | Existing install path; state storage migrates underneath without changing the UX |
| Claude.ai / Claude API adapter | Skill bundle (`SKILL.md` + resources) running in code-execution container | Uploaded/re-uploaded state file | Container filesystem is real but ephemeral across non-continued sessions |
| ChatGPT adapter | Custom GPT instructions + knowledge files | GPT-native "memory" (opaque, best-effort) | No guaranteed filesystem; state must be a document the user carries |
| Gemini adapter | Gem instructions + knowledge sources | — | Same constraint as ChatGPT, narrower file-count ceiling (10 sources) |
| Headless/automated-agent adapter | MCP server (tools + resource) | Plain documented JSON contract (fallback for MCP-incapable clients) | MCP is the only option that serves multiple consumers from one implementation |
| SEO / anti-AI verification | Sibling skill (Claude Code only) with documented manual-fallback checklist | Manual checklist (all other surfaces, always) | Confirmed sufficient as-is (see Sources/Q6 below) — no new integration work needed |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PORTABLE-01 | Content-strategy knowledge documented so any capable LLM can execute it, no Claude-Code mechanics assumed | Confirmed `references/*.md` files are already prose/tables with zero Claude-Code syntax (verified by direct read of `seo-meta-conventions.md`, `anti-ai-checklist.md`, `content-frameworks.md`). Only `SKILL.md`, `shared-context.md`, and `skills/writer/*.md` carry Claude-Code-specific mechanics (memory keys, `@~/.claude/...` transclusion, slash-command frontmatter) that need neutralizing or isolating per-adapter. |
| PORTABLE-02 | Portable profile/project-state schema (plain markdown/YAML) | See "Standard Stack" and "Architecture Patterns" — extend existing `PROFILE.md` pattern with an explicit machine-derivable schema (frontmatter fields for phase/status), informed by SKILL.md/AGENTS.md prior art. |
| PORTABLE-03 | Five-phase workflow expressed as platform-agnostic state machine | The existing `shared-context.md` "Workflow phase state machine" section (lines 234-259) already IS this logic — it just reads from memory keys instead of file frontmatter. Needs field-name mapping, not redesign. |
| ADAPTER-01 | Claude Code adapter — commands unchanged, state migrated to file-first schema, memory becomes cache | See "Runtime State Inventory" below — this is the highest-regression-risk task in the phase. |
| ADAPTER-02 | Claude.ai (chat + API) Skills adapter | See "Standard Stack" > Claude.ai/API section — concrete size limits, invocation model, and upload mechanics captured with citations. |
| ADAPTER-03 | ChatGPT adapter (Custom GPT + knowledge files) | See "Standard Stack" > ChatGPT section — instructions limit, knowledge file limits, Actions/state caveats, and the new (2026) per-GPT memory feature. |
| ADAPTER-04 | Gemini adapter (Gem instructions + knowledge files) | See "Standard Stack" > Gemini section — source-count limit, terminology clarification (no separate "Gemini skills"). |
| ADAPTER-05 | Headless/automated-agent adapter, no blocking clarification prompts | See "MCP vs Plain Contract" recommendation and "Architecture Patterns" > MCP tool design. |
| DOCS-01 | Per-platform setup guide | Deliverable of planning, informed by the packaging mechanics documented here per platform. |
| DOCS-02 | Feature-degradation matrix | Deliverable of planning; this research's Architectural Responsibility Map and platform limit tables are direct inputs. |
| VERIFY-01 | Per-platform manual test checklist (Claude.ai, ChatGPT, Gemini) | See "Validation Architecture" — these three are non-automatable by explicit user decision; checklist structure recommended below. |
| VERIFY-02 | Automated check confirming Claude Code commands still work post-migration | See "Validation Architecture" and "Don't Hand-Roll" — recommend a dependency-free Node script, not a new YAML-parsing package. |

## Standard Stack

### Core

| Component | Version/Date | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Claude Agent Skills spec (SKILL.md) | Current as of query date (2026-07) | Packaging format for the Claude.ai/API adapter | `[CITED: platform.claude.com/docs/en/agents-and-tools/agent-skills/overview]` — official spec: `name` (max 64 chars, lowercase+hyphens, no "anthropic"/"claude") and `description` (max 1024 chars) required frontmatter fields; folder = `SKILL.md` + optional `scripts/`, `references/`, `assets/` |
| Claude API code execution + Skills betas | `code-execution-2025-08-25`, `skills-2025-10-02`, `files-api-2025-04-14` | Runtime for the API-side Skill | `[CITED: platform.claude.com/docs/en/build-with-claude/skills-guide]` — three beta headers required; container param takes up to 8 skills per request; 30MB total upload cap for custom Skill bundles |
| Model Context Protocol (MCP) | Spec actively maintained by Anthropic + adopted by OpenAI Apps SDK, n8n, Zapier, Make (2025-2026) | Headless/automated-agent adapter transport | `[CITED: modelcontextprotocol.io/docs/learn/architecture]`, `[CITED: openai.com/index/introducing-apps-in-chatgpt]` — cross-vendor momentum confirmed live, not assumed from training data |

### Supporting

| Component | Version/Date | Purpose | When to Use |
|-----------|---------|---------|-------------|
| Custom GPT (instructions + knowledge files) | Current | ChatGPT adapter | `[ASSUMED — community-reported, not in official OpenAI spec docs]` instructions ≈8,000 characters; `[CITED: help.openai.com/en/articles/8555545-file-uploads-faq]` knowledge files up to 20/GPT, 512MB/file, 2,000,000 tokens/text-file |
| GPT Actions (OpenAPI schema) | Current, non-deprecated | Optional ChatGPT adapter enhancement for structured calls | `[CITED: developers.openai.com/api/docs/actions/introduction]` — confirmed still active; stateless per call, no cross-session persistence built in |
| ChatGPT per-GPT "memory" | New in 2026 | Optional carry-state mechanism for the ChatGPT adapter | `[ASSUMED — recent OpenAI feature, verify current behavior before relying on it]`: "GPTs will have their own distinct memory... builders have the option to enable memory for their GPTs" — treat as best-effort, not a substitute for the portable state document |
| Gemini Gems (instructions + knowledge sources) | Current | Gemini adapter | `[CITED: support.google.com/gemini/answer/15235603]` — up to 10 knowledge sources per Gem; no officially published instruction-length limit |
| Gemini Extensions | Current | NOT part of this phase's scope — pre-built Google-service connectors, distinct from Gems | `[CITED: support.google.com/gemini/answer/15146780]` — clarifies "Gemini skills" (user's phrasing) maps to Gems, not a separate mechanism |
| n8n MCP Server Trigger / MCP Client Tool nodes | 2026, Community Edition v2.18.4+ | No-code automation consumption of the headless adapter | `[ASSUMED — websearch-sourced, cross-check against docs.n8n.io before planning specifics]` |
| Zapier MCP, Make.com MCP | 2025-2026 | Alternative no-code consumption paths | `[ASSUMED — websearch-sourced]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MCP server for headless adapter | Plain documented JSON-in/JSON-out prompt contract, no server | Simpler to ship (no hosting, no auth), but each automation platform must hand-roll its own glue; loses the "one implementation serves many consumers" benefit and the emerging OpenAI Apps SDK / n8n-native MCP integration paths |
| One MCP tool per phase (discuss/plan/execute/verify/ship) | One MCP tool with a `phase` argument | Per-phase tools match MCP community consensus (atomic, composable, clear descriptions per tool) and let a phase-gate resource enforce ordering without an LLM having to remember a mode; a single multiplexed tool is harder for the calling agent to discover/describe and mixes unrelated input schemas |
| Extending existing PROFILE.md pattern | Adopting the raw Anthropic SKILL.md spec wholesale for state (not just for the Skill packaging) | SKILL.md's spec is for *packaging instructions*, not for *mutable per-project state* — reusing its frontmatter conventions (name/description-style keys) for the state schema is reasonable, but the file itself should stay a project/profile document, not a second Skill bundle |

**Installation:** No new runtime dependencies required for this phase. `package.json` has zero real external dependencies today (the `"claude-content-writer": "^2.0.1"` self-reference in the current `dependencies` block is pre-existing and out of scope for this phase). Recommend keeping it that way — see "Don't Hand-Roll."

**Version verification:** N/A — this phase ships markdown/config artifacts and adapter packaging, not versioned npm packages. If the planner decides an MCP server implementation is needed as a real running process (vs. a documented spec + reference implementation), verify the MCP SDK version (`@modelcontextprotocol/sdk` on npm) at planning time — do not carry a version number from training data into the plan uncited.

## Package Legitimacy Audit

No new npm packages are recommended for this phase (see "Don't Hand-Roll" and "Installation" above). Two candidates were evaluated proactively in case the planner decides VERIFY-02's automated check needs a real YAML parser instead of a restricted regex-parseable frontmatter subset:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `gray-matter` | npm | ~13 yrs (published 2021, project older) | 6.78M/wk | github.com/jonschlinkert/gray-matter | OK | Not recommended for install — see rationale below — but safe if planner chooses it |
| `js-yaml` | npm | Long-established (250M/wk); latest patch published 2 days before this research | 250.5M/wk | github.com/nodeca/js-yaml | SUS (signal: "too-new" — false positive) | Flagged by the automated gate purely because of a very recent patch release, not because the package is new or suspicious. If used, no `checkpoint:human-verify` is actually warranted given the overwhelming legitimacy signals (250M weekly downloads, 10+ year history) — the gate's "too-new" heuristic is measuring patch cadence, not package age here. Document this override reasoning in the plan if `js-yaml` is chosen. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `js-yaml` (false-positive per above — planner may proceed without a `checkpoint:human-verify` gate if this reasoning is cited in the plan; otherwise add the checkpoint per protocol default)

**Recommendation:** Neither package should actually be added. The state documents in this repo are read by an LLM as prose, not parsed by Node code — the only place a real parser might be "needed" is VERIFY-02's automated check script, and that check only needs to confirm specific keys/sections exist, not achieve full YAML parse fidelity. A small regex/string-based check against a restricted frontmatter subset avoids adding any dependency at all. See "Don't Hand-Roll" for the full argument.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌───────────────────────────────┐
                         │   Shared Reference Docs        │
                         │  references/*.md (frameworks,  │
                         │  platform conventions, SEO,     │
                         │  anti-AI checklist, profile      │
                         │  questionnaire) — PORTABLE-01    │
                         └───────────────┬─────────────────┘
                                         │ read by every adapter, never duplicated
              ┌──────────────┬──────────┴──────────┬───────────────┬────────────────┐
              ▼              ▼                     ▼               ▼                ▼
      ┌───────────────┐┌──────────────┐    ┌───────────────┐┌───────────────┐┌────────────────┐
      │ Claude Code   ││ Claude.ai /  │    │ ChatGPT       ││ Gemini        ││ Headless/Agent  │
      │ adapter       ││ Claude API   │    │ Custom GPT     ││ Gem            ││ MCP server      │
      │ (existing     ││ Skill bundle │    │ instructions + ││ instructions + ││ (tools: discuss/│
      │ slash cmds)   ││ (SKILL.md)   │    │ knowledge files ││ knowledge srcs  ││ plan/execute/   │
      └──────┬────────┘└──────┬───────┘    └──────┬─────────┘└──────┬─────────┘│ verify/ship;    │
             │                │                    │                 │          │ resource: state)│
             ▼                ▼                    ▼                 ▼          └────────┬────────┘
      ┌─────────────────────────────────────────────────────────────────────────────────────┐
      │           Portable Project/Profile State Document (PORTABLE-02/03)                   │
      │  content-writer-output/profile/PROFILE.md, PRODUCTS.md, CTAS.md, CASE-STUDIES.md      │
      │  + project-state doc with explicit phase field — file is authoritative everywhere     │
      └───────────────────────────────┬─────────────────────────────────────────────────────┘
                                       │ optional fast-path cache (Claude Code only)
                                       ▼
                         ┌───────────────────────────────┐
                         │  Claude Code memory tool        │
                         │  (cache on top, not source        │
                         │  of truth — ADAPTER-01)            │
                         └───────────────────────────────┘

  Sibling deps (claude-seo, humanizer) — Verify phase only:
      Claude Code path  → tries live skill invocation, falls back to manual checklist
      All other adapters → ALWAYS use the manual checklist (never attempt sibling-skill invocation)
```

### Recommended Project Structure

```
skills/
├── shared-context.md          # Neutralize: replace memory-key schema refs with state-doc field refs
├── writer/*.md                 # Existing Claude Code commands — behavior unchanged, storage calls updated
├── state-schema.md             # NEW — formal portable state document schema (PORTABLE-02/03)
└── adapters/
    ├── claude-skill/            # NEW — SKILL.md + resources for claude.ai / Claude API (ADAPTER-02)
    │   ├── SKILL.md
    │   └── references/          # symlink or build-copy from top-level references/
    ├── chatgpt/                 # NEW — Custom GPT instructions text + knowledge file bundle (ADAPTER-03)
    │   ├── INSTRUCTIONS.md
    │   └── knowledge/
    ├── gemini/                  # NEW — Gem instructions + knowledge sources (ADAPTER-04)
    │   ├── INSTRUCTIONS.md
    │   └── knowledge/
    └── mcp-server/              # NEW — headless/automated-agent adapter (ADAPTER-05)
        ├── README.md             # documented JSON contract (works even without running the server)
        └── server/               # optional reference MCP server implementation
references/                     # UNCHANGED — already platform-neutral (PORTABLE-01 confirmed)
content-writer-output/
└── profile/                    # UNCHANGED location; format formalized per PORTABLE-02
docs/
├── setup-claude-code.md         # DOCS-01
├── setup-claude-ai.md           # DOCS-01
├── setup-chatgpt.md              # DOCS-01
├── setup-gemini.md               # DOCS-01
├── setup-headless.md             # DOCS-01
├── feature-degradation-matrix.md # DOCS-02
└── checklists/
    ├── claude-ai-manual-test.md   # VERIFY-01
    ├── chatgpt-manual-test.md     # VERIFY-01
    └── gemini-manual-test.md      # VERIFY-01
scripts/
└── verify-writer-commands.js     # NEW — VERIFY-02, dependency-free
```

### Pattern 1: File-first state with cache-on-top (Claude Code adapter)

**What:** State document is the single source of truth; Claude Code's memory tool is populated FROM the file, never the reverse.
**When to use:** ADAPTER-01 migration — this is exactly the existing "Storage rules" in `shared-context.md` (write file first, memory second; load memory first, fall back to file; file wins conflicts) — just promote it from "fallback pattern" to "the only pattern," and make it explicit that memory is now optional/skippable.
**Example (schema shift, not code — this is a prompt-instruction change):**
```markdown
<!-- BEFORE (skills/shared-context.md) -->
On load: check memory first. If key is missing, read from file. Sync memory from file.

<!-- AFTER -->
On load: read the project-state file. If Claude Code's memory tool is available in this
session, populate it as a cache for faster re-reads within the session. Never treat memory
as authoritative — the file is the only source of truth, on every surface.
```

### Pattern 2: Progressive disclosure for Skill packaging (Claude.ai/API adapter)

**What:** SKILL.md frontmatter (name/description) is always loaded; SKILL.md body loads only when triggered; bundled reference files load only when referenced.
**When to use:** ADAPTER-02 — matches this repo's existing "Load only what's needed... never load all files at once" instruction in `SKILL.md` and `shared-context.md` almost exactly; the porting work is packaging, not re-authoring the loading discipline.
**Example:**
```yaml
# Source: platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
---
name: content-writer
description: |
  Professional content generation system... USE THIS SKILL whenever the user asks to
  write, draft, create, generate, or produce ANY content...
---
```
(This is nearly identical to the existing top-level `SKILL.md` frontmatter in this repo already — reuse the description verbatim, only the invocation model differs conceptually, not the packaging.)

### Pattern 3: MCP tool-per-phase with a state resource (headless adapter)

**What:** Five atomic tools (`writer_discuss`, `writer_plan`, `writer_execute`, `writer_verify`, `writer_ship`) each taking/returning structured JSON matching the phase's fields; one resource (`writer://project-state`) exposing the current state document read-only.
**When to use:** ADAPTER-05 — matches MCP community consensus on atomic composable tools over a single mode-switched tool, and lets a phase-gate mechanism enforce "you can't call `writer_execute` before `writer_plan` completed" deterministically server-side rather than trusting the calling agent's memory.
**Example (contract sketch, not a working server):**
```json
// Source: pattern synthesized from modelcontextprotocol.io/docs/learn/architecture
// and arcade.dev/blog/mcp-tool-patterns (composable, atomic tools; async-job pattern
// for anything requiring human clarification)
{
  "tool": "writer_discuss",
  "input": { "topic": "string", "platform": "string", "answers": "object (pre-filled, no blocking prompts)" },
  "output": { "phase": "discuss", "brief": "string", "next": "writer_plan", "state_doc": "string (updated project-state markdown)" }
}
```

### Anti-Patterns to Avoid

- **Duplicating content-strategy knowledge per adapter:** Each of the four new adapters must READ `references/*.md`, not fork copies into `adapters/chatgpt/knowledge/frameworks.md` with independent edits — Success Criterion #3 explicitly requires "built from the same shared reference docs rather than three separate copies."
- **Treating GPT/Gem "memory" as durable state:** Both are opaque, best-effort, and can be disabled by the user or org admin. Never make the workflow depend on it — always degrade to "please re-paste/re-upload your state document."
- **Single mega-tool MCP design:** A `writer_workflow(phase, action, payload)` tool is harder for calling agents to discover correctly and mixes five different input/output shapes into one loosely-typed schema — avoid it per the MCP tool-design research above.
- **Scripting the GPT Builder / Gem Builder / claude.ai Skill-upload UI for automated verification:** Already ruled out by explicit user decision (see PROJECT.md Key Decisions) — don't attempt it even opportunistically; produce the manual checklist instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing YAML frontmatter for VERIFY-02's automated check | A hand-rolled full YAML parser, or adding `js-yaml`/`gray-matter` as a new dependency | A restricted, regex-parseable frontmatter subset (flat `key: value` lines only, no nested structures, no multiline blocks) checked with Node's built-in `fs`/`string.split` | The state documents are read by an LLM as prose, not parsed by code in production — the only code-side consumer is the verification script, and it only needs to assert "these keys exist with non-empty values," which a full YAML parser is overkill for. Adding a dependency to a currently-zero-dependency package for one internal test script is a disproportionate maintenance/attack-surface cost. |
| Multi-phase workflow ordering enforcement in the MCP server | A custom in-memory state machine with ad-hoc phase-transition validation code | The MCP "stateful gate" tool pattern (a `get_current_phase`/resource read before allowing the next tool call) documented in current MCP tooling guidance | Reinventing phase-order enforcement risks silently diverging from how MCP clients expect tool availability/ordering signals to work; the pattern is now a documented convention, not a novel design problem |
| Cross-platform "memory" abstraction | A custom sync layer that tries to unify Claude Code's memory tool, ChatGPT's GPT memory, and Gemini's (nonexistent) memory into one API | The single portable state document, re-uploaded/re-pasted per platform as needed | None of the three chat platforms expose a memory API this project could safely target uniformly; two are explicitly opaque and platform-owned. Building an abstraction over three moving, partially-undocumented targets is a maintenance trap — the file is the only stable interface. |

**Key insight:** Every "don't hand-roll" here traces back to the same root cause — this phase is tempted to build infrastructure (parsers, state machines, sync layers) to compensate for platform capability gaps that are better solved by simply not depending on those capabilities in the first place. The portable-document approach sidesteps the entire category of problem.

## Runtime State Inventory

**Trigger confirmed:** ADAPTER-01 is a rename/refactor of the state storage layer (memory-key scheme → file-based schema as source of truth). Full inventory below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Claude Code memory tool entries under exact key prefixes `[Content Writer]`, `[Content Writer Product]`, `[Content Writer CTA]`, `[Content Writer Case Study]`, `[Content Writer Shortcode]`, and the four `[Content Writer] Current Project - *` project-state keys (all enumerated in `skills/shared-context.md` lines 24-59). These are per-user, per-machine, live only in the Claude Code memory tool's own storage — not in git, not inspectable via `grep` in this repo. | Code edit only (no data migration script can reach another user's live memory store) — the migration must be: on first read after this phase ships, if a memory key exists but the new state file doesn't, write the file FROM memory once (a one-time upgrade path), then treat the file as authoritative from then on. Document this explicitly as a task — it is the one path that touches another user's already-populated memory. |
| Live service config | None found. This project has no external SaaS with UI-only config (no n8n instance, no Datadog, no Cloudflare Tunnel) — confirmed by reading `package.json`, `scripts/postinstall.js`, and the full `skills/`/`references/` tree; nothing references an external service's dashboard-only settings. |
| OS-registered state | None found. `scripts/postinstall.js` writes only into `~/.claude/skills/*` (a plain directory tree, not an OS-level registration like a Task Scheduler entry, pm2 process, or launchd plist) and a version marker file (`~/.claude/skills/writer-update/.version`). No OS scheduler, service manager, or daemon registration exists in this codebase. |
| Secrets/env vars | None found. No `.env`, no SOPS-managed keys, no CI secret references anywhere in `package.json`, `scripts/*.js`, `scripts/*.sh`, or `skills/**/*.md`. The npm auto-update check (`npm view claude-content-writer version`) requires no credentials (public registry read). |
| Build artifacts | `~/.claude/skills/writer-*/SKILL.md` and `~/.claude/skills/writer-references/*` (copied by `postinstall.js` at install time) will go stale relative to the new file-based schema described in `skills/shared-context.md` and `skills/writer/*.md` until the NEXT `npm install`/postinstall run on each user's machine — this is expected and self-healing on update, not a special migration concern, but the plan should note that users who don't reinstall/update won't get the new schema until they do (ties into the auto-update-notification flow already in the product). |

**Nothing found in three of five categories** (live service config, OS-registered state, secrets/env vars) — verified by direct `grep`/read of the full repo tree; this is a self-contained npm package with no live external service dependencies or OS registrations.

## Common Pitfalls

### Pitfall 1: Assuming "file exists" implies "code execution container has network to fetch it"
**What goes wrong:** A Claude.ai/API Skill instruction that says "fetch the blog URL to calibrate voice" (an existing feature in `skills/writer/profile-create.md`'s URL-scanning step) may silently fail or behave inconsistently across surfaces.
**Why it happens:** Claude API code-execution containers have **no network access** at all `[CITED: platform.claude.com/docs/en/agents-and-tools/agent-skills/overview — "Runtime environment constraints" section]`; claude.ai's containers have "varying" network access depending on user/admin settings; only Claude Code has guaranteed full network access.
**How to avoid:** The Skill/adapter instructions must explicitly branch: "If you have network access, fetch the URL; if not, ask the user to paste the content directly." Don't assume URL-fetching (used in profile-create's tone-detection step) works uniformly.
**Warning signs:** A manual test checklist step that says "provide a blog URL" without a fallback instruction for "or paste 2-3 paragraphs directly" (which, notably, the existing `README.md` troubleshooting section already offers as an alternative — reuse that language).

### Pitfall 2: Treating Custom GPT / Gem "knowledge files" as a live filesystem
**What goes wrong:** Assuming the adapter can WRITE a project-state file back into the GPT's knowledge base mid-conversation, the way Claude Code writes to `content-writer-output/`.
**Why it happens:** Custom GPT knowledge files and Gemini Gem knowledge sources are read-only reference material set at configuration time by the builder — there is no in-conversation write-back mechanism on either platform.
**How to avoid:** ADAPTER-03/04 instructions must end each phase by presenting the FULL updated state document as chat output and instructing the user to save/paste it themselves for the next session — never instruct the model to "save this to your knowledge file."
**Warning signs:** Any adapter instruction phrased as "update the knowledge file with..." rather than "output the updated state document for the user to save."

### Pitfall 3: Assuming GPT/Gem "memory" solves cross-session state
**What goes wrong:** Relying on ChatGPT's newer per-GPT memory feature or Gemini's project memory as the portable-state mechanism, then discovering it's disabled by the user, org policy, or plan tier.
**Why it happens:** `[ASSUMED]` this is a 2026-era feature not universally available/enabled and its exact retention/visibility semantics are still evolving per OpenAI's own help-center language ("builders have the option to enable memory") — it is opt-in and platform-controlled, not guaranteed.
**How to avoid:** Treat the portable state document (re-upload/re-paste) as the ONLY guaranteed mechanism; memory features are a nice-to-have UX smoothing, never a requirement.
**Warning signs:** Any manual test checklist step whose PASS condition depends on memory persisting across a fresh session without the user re-supplying the state document.

### Pitfall 4: Duplicating reference-doc content into each adapter's knowledge files
**What goes wrong:** Copy-pasting `content-frameworks.md` into `adapters/chatgpt/knowledge/` and `adapters/gemini/knowledge/` as independent files that drift out of sync on the next edit.
**Why it happens:** ChatGPT/Gemini require uploaded files, not live filesystem reads — it's tempting to just copy the reference docs in at packaging time.
**How to avoid:** Build/package step (script or documented manual step) that copies FROM the canonical `references/` at ship time, never hand-edits a second copy. Success Criterion #3 in ROADMAP.md explicitly names this risk ("rather than three separate copies").
**Warning signs:** A `git diff` on `references/anti-ai-checklist.md` that doesn't also touch `adapters/*/knowledge/anti-ai-checklist.md`.

## Code Examples

### SKILL.md frontmatter (verified against current official spec)
```yaml
# Source: platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---
```
Field constraints (verified): `name` ≤ 64 chars, lowercase letters/numbers/hyphens only, no XML tags, cannot contain "anthropic" or "claude"; `description` non-empty, ≤ 1024 chars, no XML tags.

### Reusing the same container across Claude API turns (state persistence)
```python
# Source: platform.claude.com/docs/en/build-with-claude/skills-guide
response2 = client.beta.messages.create(
    model="claude-opus-4-8",
    max_tokens=4096,
    betas=["code-execution-2025-08-25", "skills-2025-10-02"],
    container={
        "id": response1.container.id,  # Reuse container to keep files from turn 1
        "skills": [{"type": "custom", "skill_id": "skill_...", "version": "latest"}],
    },
    messages=[...],
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
)
```
Relevance: this is the ONLY way an API-driven Claude.ai-style integration keeps a project-state file across turns without re-uploading it every message — the plan should decide whether the adapter documentation recommends this pattern for API consumers, or simply always re-supplies the state document (simpler, but more tokens per turn).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Custom GPTs as ChatGPT's only extensibility surface | Custom GPTs + OpenAI Apps SDK (built on MCP, interactive UI) running in parallel | Apps SDK announced 2025, third-party submissions live Dec 2025, rollout early 2026 | `[ASSUMED — recent/evolving, re-verify at planning time]` This is a second, newer packaging path this phase's ADAPTER-03 could target instead of (or in addition to) Custom GPT instructions — but it requires MCP server infrastructure similar to ADAPTER-05, so the practical near-term recommendation is still Custom GPT instructions + knowledge files, with the MCP-based headless adapter as the forward-compatible bridge to Apps SDK later. |
| GPT Actions as the primary integration mechanism | GPT Actions still active, but MCP increasingly the cross-platform standard (adopted by OpenAI itself for Apps SDK) | Ongoing through 2025-2026 | Reinforces the MCP-first recommendation for ADAPTER-05 — keeping the plain JSON contract available as a fallback option, not the primary artifact, still makes sense for clients that can't run/connect to an MCP server. |
| Claude Skills as a Claude Code-only convention | Claude Skills formalized as a cross-surface spec (claude.ai, Claude API, AWS, Microsoft Foundry) with a public open-standard variant (agentskills.io / SKILL.md spec adopted by 30+ agent products per `[ASSUMED — websearch, verify count before quoting externally]`) | Through 2025-2026 | Directly validates PORTABLE-01/02 — the project isn't inventing a new packaging convention, it's adopting one that's already cross-vendor. |

**Deprecated/outdated:**
- The idea that "Claude Skills = Claude Code slash commands" is outdated for this phase's purposes — claude.ai/API Skills are description-triggered, not command-triggered, and this must be reflected in how ADAPTER-02's `SKILL.md` description field is written (closer to the existing top-level repo `SKILL.md` frontmatter than to `skills/writer/discuss.md`'s narrow slash-command frontmatter).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Custom GPT instructions field has an ~8,000 character limit | Standard Stack > ChatGPT | If actually different (limits have moved before), ADAPTER-03's instructions file could be silently truncated by the builder UI — plan should have the human tester paste-and-check length at setup time regardless of this number |
| A2 | ChatGPT per-GPT "memory" feature exists and is opt-in for builders as of 2026 | Standard Stack > Supporting; Pitfall 3 | If this feature doesn't work as described or isn't available on the target account tier, any adapter instruction relying on it as a nice-to-have needs a fallback that's already specified (always re-supply the state doc) — low risk since it's explicitly not load-bearing |
| A3 | n8n's MCP Server Trigger/Client Tool nodes and instance-level MCP server exist in the stated 2026 form (Community Edition v2.18.4+) | Standard Stack > Supporting; State of the Art | If version/availability specifics are off, DOCS-01's n8n setup instructions could be wrong — verify current n8n docs (docs.n8n.io) at planning/execution time before publishing exact version numbers |
| A4 | Zapier MCP and Make.com MCP exist and are actively maintained in 2026 | Standard Stack > Supporting | If overstated, DOCS-02's degradation matrix might claim broader no-code MCP support than actually exists — verify each platform's current MCP docs before publishing |
| A5 | OpenAI Apps SDK is built on top of MCP and remains in parallel with (not replacing) Custom GPTs as of the research date | State of the Art | If Apps SDK's relationship to MCP or to Custom GPTs has shifted since this research, the "MCP as forward bridge to Apps SDK" framing in the primary recommendation could be premature — this is a fast-moving area, re-verify before committing to it as a stated benefit in shipped docs |
| A6 | Gemini Gem instructions have no officially documented character limit (informal ~10-30k range) | Standard Stack > Gemini | If Google has since published or changed a hard limit, ADAPTER-04's instructions file could be silently truncated — plan should have the human tester verify at Gem-creation time rather than trust a specific number |
| A7 | The `js-yaml` `[SUS]` verdict is a false positive caused by a recent patch release rather than genuine risk | Package Legitimacy Audit | If wrong, and the planner adopts this package based on this research's override reasoning, it introduces unreviewed supply-chain risk — mitigated by the fact that this phase recommends NOT adding the dependency at all |

**If this table is empty:** N/A — see entries above. Every platform-capability claim sourced primarily via WebSearch (not direct official-doc WebFetch) is tagged `[ASSUMED]` in-line above and repeated here; claims backed by a direct WebFetch of `platform.claude.com` or `developers.openai.com` are tagged `[CITED]` and are not repeated in this log.

## Open Questions

1. **(RESOLVED — Plan 01-08)** Does the "same container ID reused across API calls" pattern actually satisfy ADAPTER-02's needs, or is re-supplying the full state document each turn simpler and equally viable?
   - What we know: Container reuse is documented and works for keeping generated files present across turns within a session.
   - What's unclear: Whether container reuse survives across genuinely separate sessions/days for an API-driven integrator, or only within one active conversation's lifetime — the docs describe turn-to-turn reuse, not explicit multi-day persistence guarantees.
   - Recommendation: Default to "always re-supply/re-read the state document at the start of each phase," treating container reuse as an optimization, not a dependency. Confirm actual container lifetime limits with Anthropic's docs at execution time if the plan wants to rely on it.
   - **Resolution:** Plan 01-08 (Claude.ai/API Skill bundle) follows this recommendation exactly — container reuse is treated as an optimization, not a dependency; the skill always re-reads the state document.

2. **(RESOLVED — Plan 01-07)** Should the MCP server be a real running/hosted implementation shipped in this repo, or a documented contract + reference implementation the user can self-host?
   - What we know: MCP adoption (n8n, Zapier, Make, OpenAI Apps SDK) is real and growing; this repo has no hosting infrastructure and the project's constraints explicitly rule out "a hosted backend or database for cross-platform state sync" (PROJECT.md Out of Scope).
   - What's unclear: Whether "MCP server" in this phase means "ship a runnable Node MCP server the user runs locally/self-hosts" vs. "ship only the tool/resource contract as documentation, with maybe a minimal reference implementation."
   - Recommendation: Ship a documented tool/resource contract (works even unimplemented, satisfies ADAPTER-05's "documented structured JSON-in/JSON-out contract" wording) PLUS a minimal, dependency-light reference MCP server implementation the user can run locally — this avoids the hosted-backend scope violation while still being genuinely usable, not just a spec on paper.
   - **Resolution:** Plan 01-07 ships both — a documented contract (`README.md`, 5 tools + 1 resource) and a dependency-free, local/stdio reference server (`server.js`), confirmed by `gsd-plan-checker` as matching this recommendation exactly.

3. **(RESOLVED — Plan 01-02)** What exactly should VERIFY-02's automated check assert, given /writer:* commands are markdown instructions interpreted by an LLM, not deterministic code?
   - What we know: The commands themselves can't be "unit tested" in the traditional sense — there's no function to call. What CAN be checked mechanically is: do the skill files exist post-migration, do they reference the new state-file paths instead of removed memory-key names, does the state-file schema have the fields the phase state machine expects.
   - What's unclear: Whether "automated check" in VERIFY-02's wording means a structural lint (file/field presence) or an actual behavioral test (which would require literally running Claude Code against the commands, which is a human/agent-in-the-loop activity, not a script).
   - Recommendation: Scope VERIFY-02 as a structural lint script (file existence, no stale memory-key references left in `skills/writer/*.md`, state-schema field presence) — this is genuinely automatable without a browser or live Claude Code session, and is the "one adapter that CAN be verified without a human clicking through a GUI" per the phase's own framing. Behavioral confirmation of `/writer:*` commands still belongs in a human UAT pass, same as the other three adapters, just with a much shorter checklist since Claude Code is the already-working baseline.
   - **Resolution:** Plan 01-02 scopes VERIFY-02 exactly this way — `scripts/verify-writer-commands.js` is a dependency-free structural lint (schema/neutralize/migration checks), never a behavioral test. Confirmed by `gsd-plan-checker`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | postinstall.js, VERIFY-02 script | ✓ | v24.10.0 | — |
| npm | package publishing, update-check (`npm view`) | ✓ | 11.17.0 | — |
| git | commits, phase workflow | ✓ | 2.50.1 | — |
| Context7 MCP tool | Documentation lookups during this research | ✗ (not exposed to this agent despite being listed as an available MCP server) | — | WebSearch/WebFetch used instead throughout this research; no impact on phase deliverables since the phase itself doesn't require Context7 at execution time |
| Live claude.ai / ChatGPT / Gemini builder access | Manual verification checklists (VERIFY-01) | Not probed (requires the human tester's own accounts) | — | This is expected and by design — VERIFY-01 checklists are explicitly for the human to run, not for this research or the building agent |

**Missing dependencies with no fallback:** None blocking phase execution.

**Missing dependencies with fallback:** Context7 (fell back to WebSearch/WebFetch successfully for all findings in this document).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently — no `package.json` test script, no test directory in the repo |
| Config file | none — see Wave 0 |
| Quick run command | `node scripts/verify-writer-commands.js` (proposed, to be created in this phase) |
| Full suite command | Same — this repo has no other automated tests; VERIFY-02 IS the full suite for this phase |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORTABLE-01 | Reference docs contain no Claude-Code-specific syntax | structural lint | `grep -rn "\[Content Writer\]\|~/.claude\|@~/.claude" references/` (expect zero matches) | ❌ Wave 0 — needs a script, not just a manual grep |
| PORTABLE-02/03 | State document schema has required phase-tracking fields | structural lint | `node scripts/verify-writer-commands.js --check=schema` | ❌ Wave 0 |
| ADAPTER-01 | `/writer:*` skill files reference file-based state, not stale memory-key-only logic | structural lint | `node scripts/verify-writer-commands.js --check=migration` | ❌ Wave 0 |
| ADAPTER-01 | Existing `/writer:*` command behavior unchanged from user's perspective | manual-only (behavioral) | N/A — human runs the five phases in Claude Code end-to-end once post-migration | manual-only, justified: no test harness exists for slash-command behavior in this repo |
| ADAPTER-02 | Claude.ai/API Skill bundle loads and responds correctly | manual-only | N/A — VERIFY-01 checklist, claude.ai/API builder UI can't be scripted per explicit project decision | manual-only, justified |
| ADAPTER-03 | ChatGPT Custom GPT reproduces the phased workflow | manual-only | N/A — VERIFY-01 checklist | manual-only, justified |
| ADAPTER-04 | Gemini Gem reproduces the phased workflow | manual-only | N/A — VERIFY-01 checklist | manual-only, justified |
| ADAPTER-05 | Headless agent can drive one phase via structured I/O without blocking | automatable if a reference MCP server is built | e.g. `node adapters/mcp-server/server/test-harness.js` calling each tool once with fixture input | ❌ Wave 0 — depends on planner's decision in Open Question 2 |
| VERIFY-02 | Automated check confirms Claude Code commands still function post-migration | structural lint (see above) | `node scripts/verify-writer-commands.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node scripts/verify-writer-commands.js` (once it exists)
- **Per wave merge:** Same command — this is a small, single-script test surface
- **Phase gate:** Structural lint green + all three manual VERIFY-01 checklists completed by the human before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `scripts/verify-writer-commands.js` — covers PORTABLE-02/03, ADAPTER-01, VERIFY-02 (does not exist yet; no test infrastructure of any kind currently in this repo)
- [ ] `docs/checklists/claude-ai-manual-test.md`, `chatgpt-manual-test.md`, `gemini-manual-test.md` — covers VERIFY-01 (must be authored, not just referenced)
- [ ] Decision on Open Question 2 (documented contract only vs. + reference MCP server implementation) before ADAPTER-05's test coverage can be scoped precisely
- [ ] Framework install: none required — plain Node scripts, no test runner dependency recommended (keep the zero-dependency footprint per "Don't Hand-Roll")

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase ships documentation/packaging artifacts and prompt instructions; it introduces no login/auth surface of its own |
| V3 Session Management | Partially | The Claude API container-ID-reuse pattern (see Code Examples) is effectively a session token — document that container IDs should be handled like any other bearer credential (not logged, not embedded in shareable state documents) if the plan chooses to use this pattern |
| V4 Access Control | No | No new access-control boundaries introduced |
| V5 Input Validation | Yes | The MCP server's tool inputs (ADAPTER-05) and any GPT Action OpenAPI schema (if used) must validate input shapes — `[CITED: current MCP guidance emphasizes clear, LLM-parseable input schemas]`; for the state-document schema, validate that a re-pasted/re-uploaded state document from a user matches the expected field set before trusting it as authoritative, since a corrupted or hand-edited state doc is now the *sole* source of truth (ADAPTER-01 raises the stakes on this compared to the old memory-tool fallback) |
| V6 Cryptography | No | No secrets, tokens, or cryptographic operations introduced by this phase's own deliverables |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious/compromised third-party Skill bundle (if a user installs an untrusted custom Skill alongside this one) | Tampering / Elevation of Privilege | `[CITED: platform.claude.com/docs/en/agents-and-tools/agent-skills/overview — "Security considerations"]` — official guidance: only use Skills from trusted sources, audit all bundled files, be wary of Skills that fetch external URLs. This project's own adapter should follow the same authoring hygiene it would ask users to apply to others: no unexplained network calls, no obfuscated scripts in `scripts/`. |
| Prompt injection via a re-uploaded/pasted state document that a user (or an attacker who gained access to a shared document) has tampered with | Tampering | Since the file is now the sole source of truth (post-ADAPTER-01), instructions should tell the agent to treat unexpected fields or suspicious instructions embedded in a "state document" as data, not as new instructions to follow — a reminder worth adding explicitly to the new state-schema doc given prompt-injection-via-document is a known class of attack against exactly this kind of "read this file and follow it" workflow |
| MCP tool input used to construct file paths or shell commands without validation (if the reference MCP server implementation is built) | Tampering / Information Disclosure | Standard input validation + path allow-listing on any file-write tool the MCP server exposes (e.g. a `writer_ship` tool that writes to `content-writer-output/`) — never construct a write path directly from unvalidated tool input |

## Sources

### Primary (HIGH confidence)
- None — Context7 MCP tools were unavailable in this session (tool listed but not exposed); no ecosystem package-registry verification was needed since no new packages are recommended.

### Secondary (MEDIUM confidence, CITED — verified via direct WebFetch of official documentation)
- [Agent Skills - Claude Platform Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — SKILL.md spec, frontmatter constraints, cross-surface availability/limitations, security considerations
- [Using Agent Skills with the Claude API](https://platform.claude.com/docs/en/build-with-claude/skills-guide) — beta headers, container parameter, 30MB/8-skills limits, container-ID reuse pattern
- [GPT Actions introduction](https://developers.openai.com/api/docs/actions/introduction) — confirmed GPT Actions still active, non-deprecated, stateless-per-call behavior
- [File Uploads FAQ - OpenAI Help Center](https://help.openai.com/en/articles/8555545-file-uploads-faq) — knowledge file size/count limits
- [Tips for creating custom Gems - Gemini Apps Help](https://support.google.com/gemini/answer/15235603) — 10-source limit for Gems
- [Use Gems in Gemini Apps - Gemini Apps Help](https://support.google.com/gemini/answer/15146780) — Gems vs. Extensions distinction

### Tertiary (LOW confidence, ASSUMED — WebSearch-synthesized, not independently re-verified against a primary source in this session)
- Custom GPT ~8,000-character instructions limit (community-reported across multiple OpenAI Developer Community threads, no single canonical official source found)
- OpenAI Apps SDK built on MCP, GPT Store/Custom GPTs remaining in parallel ([openai.com/index/introducing-apps-in-chatgpt](https://openai.com/index/introducing-apps-in-chatgpt/))
- ChatGPT per-GPT "memory" feature description (2026 feature, evolving)
- n8n MCP Server Trigger/Client Tool nodes and instance-level MCP server version specifics
- Zapier MCP and Make.com MCP existence/maintenance status
- MCP tool-design consensus (atomic/composable tools, stateful-gate pattern) from [arcade.dev/blog/mcp-tool-patterns](https://www.arcade.dev/blog/mcp-tool-patterns/) and general MCP architecture overviews
- Portable agent state format convergence (AGENTS.md, Open Knowledge Format) — pattern-level claim, not a single authoritative spec citation

## Metadata

**Confidence breakdown:**
- Standard stack (Claude.ai/API specifics): MEDIUM-HIGH — directly WebFetched from official `platform.claude.com` docs, matched against this repo's existing `SKILL.md` almost exactly
- Standard stack (ChatGPT/Gemini specifics): LOW-MEDIUM — WebSearch-synthesized; official limits are inconsistently documented by the platforms themselves, several figures are community-reported
- Architecture (MCP-vs-plain-contract recommendation): MEDIUM — directionally well-supported by multiple independent 2026 sources (OpenAI's own Apps SDK, n8n's native MCP nodes, Zapier/Make MCP), but exact version numbers/dates are WebSearch-sourced, not WebFetch-confirmed against each platform's own docs
- Pitfalls: MEDIUM — derived by cross-referencing this repo's actual existing behavior (URL fetching, memory reliance) against the officially-documented platform constraints found above, not speculative
- Runtime State Inventory: HIGH — based on direct, exhaustive reading of this repo's actual source files (`package.json`, `scripts/*.js`, `scripts/*.sh`, `skills/**/*.md`), not external research

**Research date:** 2026-07-04
**Valid until:** 2026-08-04 (30 days) — this domain (chat-platform builder capabilities, MCP ecosystem adoption) is fast-moving; several `[ASSUMED]` items above (Apps SDK status, ChatGPT memory feature, n8n MCP version specifics) should be re-verified if planning/execution is delayed more than a few weeks past this research date.

## RESEARCH COMPLETE
