# Content Writer — Shared Context

Loaded by every `/writer:` command via `@`. Contains the conventions every command
needs: paths, state fields, workflow state schema, quick-reference anti-AI patterns,
and integration points. Do not add command-specific logic here.

---

## Profile enforcement

**No content is generated without a writer profile.**

On every command, check for profile files first:

1. Check `content-writer-output/profile/PROFILE.md`
2. If file exists — load it; if Claude Code's memory tool is available, populate it as a read-through cache for faster re-reads within the same session
3. If neither file nor memory cache exists — check for legacy `[Content Writer] Name` in memory (one-time upgrade path)
4. If no profile exists anywhere — redirect to `/writer:profile-create` before anything else

Exception: profile commands (`/writer:profile-create`, `/writer:profile-view`,
`/writer:profile-edit`, `/writer:profile-delete`) run without a profile present.

---

## Project & Profile State Fields

State is stored in plain files, not proprietary memory APIs. All adapters follow the
same schema — see `skills/state-schema.md` for the exact field list.

### Profile files

Profile data lives in `content-writer-output/profile/`:

| File | Contains |
|------|---------|
| `PROFILE.md` | Core identity, audience, voice, content strategy, publishing preferences |
| `PRODUCTS.md` | Product/service entries |
| `CTAS.md` | CTA templates |
| `CASE-STUDIES.md` | Case studies with rotation status |

See `skills/state-schema.md` section "1. Profile Schema" for exact heading structures.

### Project state file

Active project state lives in `content-writer-output/profile/PROJECT-STATE.md`:

- **Frontmatter**: flat `key: value` pairs including `phase`, `platform`, `format`, `topic`, `framework`, `cta`, SEO fields, and progress tracking
- **Body**: four required headings — `## Discussion Brief`, `## Outline`, `## Draft`, `## Verified Content`

See `skills/state-schema.md` section "2. Project State Schema" for exact frontmatter keys and body structure.

---

## File paths

### Profile files

```
content-writer-output/profile/
├── PROFILE.md        ← all profile core entries in readable markdown
├── PRODUCTS.md       ← all product entries
├── CTAS.md           ← all CTA entries
├── CASE-STUDIES.md   ← all case study entries + rotation status
└── PROJECT-STATE.md  ← active project state (frontmatter + body)
```

### Content output

```
content-writer-output/
├── blog/
├── linkedin/
├── twitter/
├── facebook/
├── instagram/
├── email/
├── sales/
├── seo/
└── packages/[name]/
```

### Filename format

`NNN-[slug].md` where NNN auto-increments within the type directory.

Example: `001-mvp-validation-framework.md`, `014-linkedin-hiring-post.md`

---

## Reference files

Load only what the current command needs. Never load all at once.

| File | Load when |
|------|-----------|
| `references/content-frameworks.md` | Plan phase — framework selection and outline structure |
| `references/ste-writing-rules.md` | Execute phase — always (writing law); Verify phase — always (gate contract) |
| `references/anti-ai-checklist.md` | Verify phase — always; Execute phase — if unsure |
| `references/seo-meta-conventions.md` | Any content with search intent |
| `references/web-content-conventions.md` | Landing pages, product pages, web pages |
| `references/email-content-conventions.md` | Newsletters, campaigns, sequences |
| `references/twitter-conventions.md` | Twitter/X tweets and threads |
| `references/facebook-conventions.md` | Facebook posts |
| `references/instagram-conventions.md` | Instagram captions |
| `references/sales-content-conventions.md` | Sales pages, funnels, case studies, testimonials, proposals |
| `references/research-workflow.md` | Plan phase — if deep research is needed |
| `references/profile-management.md` | Any profile command — file conventions and edge cases |

---

## Framework quick-reference

Full detail in `references/content-frameworks.md`. Quick selection:

| Use case | Framework |
|----------|-----------|
| Sales pages, landing pages | AIDA or PASTOR |
| Problem-focused content, cold outreach | PAS |
| Transformation stories, case studies | BAB |
| Thought leadership | LEMA or SCQA |
| Long-form articles | 4-Point |
| Conversion-focused pages | CONVERT |
| Features/product-focused | FAB |

---

## Storage rules

1. **Write order:** file first, memory second. If file write fails, do not update memory.
   "File" means `PROJECT-STATE.md` and the profile files (`PROFILE.md`, `PRODUCTS.md`,
   `CTAS.md`, `CASE-STUDIES.md`) — these are the source of truth, not a fallback location.

2. **Load order:** file first. Read the relevant file, and only if Claude Code's memory
   tool is available in this session, populate it as a read-through cache for faster
   re-reads within the same session.

3. **Conflict resolution:** file is authoritative. On any conflict between file and memory,
   the file always wins and memory is corrected to match.

4. **Max entry size:** 500 characters per memory entry. Split long entries by sub-topic.
   (This applies to the optional memory cache only — files have no size limit.)

5. **One-time upgrade path:** if `PROJECT-STATE.md` or a profile file does not exist yet,
   but Claude Code's memory tool already holds legacy entries from before this migration,
   write those legacy values into the corresponding file once, then proceed treating the
   file as authoritative from that point forward. Do this silently, without asking the
   user, and only on the very first read after upgrading.

---

## Output frontmatter

Every shipped file includes this YAML block at the top:

```yaml
---
title: [Headline or post opening]
platform: [platform]
format: [blog article / LinkedIn post / Twitter thread / etc.]
framework: [framework used]
word_count: [count]
created: [YYYY-MM-DD]
author: [name from profile]
company: [company from profile]
status: draft
seo:
  meta_title: [meta title]
  meta_description: [meta description]
  primary_keyword: [keyword]
  slug: [URL slug]
---
```

Omit the `seo:` block for social posts and email content where search intent is absent.

---

## Sentence-formation law (STE)

Every sentence in every content type is formed with ASD-STE100 Simplified Technical
English discipline. The full law and the tiered gate contract are in
`references/ste-writing-rules.md`. Execute writes to it. Verify enforces it with a linter
(`scripts/ste-lint.js`) that blocks ship on failure. The default law:

- Active voice. One idea per sentence. Aim under 25 words.
- Plain words: use (not utilize/leverage), help (not facilitate), make sure (not ensure),
  start (not commence/initiate/begin), before (not prior to), also (not additionally).
- A verb for an action, not a nominalization ("analyze the log", not "perform an analysis").
- No phrasal verbs ("start", not "spin up"). No semicolons. No contractions.
- Zero marketing adjectives (seamless, robust, powerful, effortless, empower, unlock) and
  zero banned words. These fail the verify gate on every content type.

**Tiers:** strict (SEO metadata, operational email — zero tolerance), social (LinkedIn,
Twitter/X, Facebook, Instagram), prose (blog, web, sales, case studies, newsletters).

---

## Anti-AI quick-reference

Catch these while writing. Full pattern taxonomy in `references/anti-ai-checklist.md`.
STE (above) fixes the FORM of a sentence. This list fixes the higher-level tells.

**Vocabulary kills:**
`delve` · `leverage` · `robust` · `seamless` · `crucial` · `foster` · `landscape` ·
`realm` · `pivotal` · `groundbreaking` · `comprehensive` · `vital` · `showcase`

**Structural tells:**

- Em dash overuse (—) → use periods or line breaks; max 1 per 500 words
- Rule of three in every paragraph → vary to two, or four, or one strong point
- Symmetric list structures with identical sentence openings
- Negative parallelism: "It's not just X — it's Y"
- Throat-clearing openers: "In today's fast-paced world..." / "In an era where..."
- Generic inspirational endings: "The possibilities are endless." / "The future is bright."
- Vague attributions: "Studies show..." / "Experts say..." → name the source

**Voice tests:**

- Read it aloud. If it sounds like a press release, rewrite it.
- Count em dashes. More than one per 500 words is too many.
- Find the most interesting sentence. If it's not the first sentence, move it.

---

## Integration points

### STE compliance gate (built-in, mandatory)

- Phase: Verify — blocking
- Command: `node scripts/ste-lint.js --gate=<platform> <draft-file>`
- Rules: `references/ste-writing-rules.md`
- Behavior: exits 0 (PASS) or 1 (FAIL). Hard-zero `marketing_adjective` and `banned_word`
  on every tier. Blocks ship until PASS. No graceful skip — the only fallback is a manual
  STE self-lint when Node is unavailable, recorded as `ste_gate: manual`.

### claude-seo

- Phase: Verify
- Command: `/seo:analyze`
- Fallback: manual checklist in `/writer:verify` when not available

### humanizer

- Phase: Verify
- Command: `/humanizer:audit`
- Fallback: manual audit using `references/anti-ai-checklist.md` when not available

---

## Update check

Run once per session, before the first command executes.

1. Read `~/.claude/skills/content-writer/.version`
2. Run `npm view claude-content-writer version`
3. If newer version available and `updateNotificationShown` not in session memory:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 Content Writer Update Available
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current: v{current}  →  Latest: {latest}
  Run /writer:update to upgrade.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Set `updateNotificationShown = true` in session memory. Do not check again this session.
Then continue with the user's command — do not block on the notification.

---

## Workflow phase state machine

For `/writer:next` and `/writer:status` phase detection, read the `phase` field from
`content-writer-output/profile/PROJECT-STATE.md` frontmatter:

| Condition | Run next |
|-----------|----------|
| No `PROJECT-STATE.md` file exists | `/writer:discuss` (or `/writer:profile-create` if no profile either) |
| `phase: discuss` | `/writer:plan` |
| `phase: plan` | `/writer:execute` |
| `phase: execute` | `/writer:verify` |
| `phase: verify` | `/writer:ship` |
| `phase: ship` or `phase: complete` | Workflow finished — run `/writer:discuss` to start a new project |

Each `/writer:*` command, on completion, updates `phase` to the value corresponding to the
work it just did (e.g. `/writer:discuss` sets `phase: discuss` when it finishes, which is
what tells the state machine the next command is `/writer:plan`) and refreshes `updated_at`.
