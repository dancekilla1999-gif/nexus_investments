---
name: content-writer
description: |
  Professional content generation system with a GSD-style phased workflow, integrated
  SEO optimization (claude-seo), and anti-AI auditing (humanizer).

  USE THIS SKILL whenever the user asks to write, draft, create, generate, or produce
  ANY content — including blog posts, articles, LinkedIn posts, Facebook posts, Twitter/X
  tweets or threads, Instagram captions, email newsletters, email campaigns or sequences,
  landing pages, product pages, web pages, sales pages, sales funnels, case studies,
  testimonials, product descriptions, or SEO metadata.

  Also triggers on: "/writer:discuss", "/writer:plan", "/writer:execute", "/writer:verify",
  "/writer:ship", "/writer:next", "/writer:profile-create", "/writer:profile-view",
  "/writer:profile-edit", "/writer:status", "/writer:help", "/writer:update" — or any
  request to manage a writer profile or create marketing materials.

  ALWAYS use this skill even for quick, casual content requests like "write me a LinkedIn
  post about X" or "draft a tweet thread." The profile and phased workflow produce
  significantly better output than ad-hoc generation.
---

# Content Writer v2.0

Professional content generation system. Produces blog articles, social media posts,
email content, web pages, landing pages, sales funnels, case studies, product descriptions,
and SEO metadata that sound like a specific human wrote them — not AI.

Integrated with:

- **ASD-STE100 Simplified Technical English** — the sentence-formation law, applied at the execute phase and enforced by a linter gate at the verify phase. See `references/ste-writing-rules.md`.
- **claude-seo** — SEO optimization at the verify phase
- **humanizer** — Anti-AI pattern auditing at the verify phase

---

## Reference Files

Before generating any content, load the relevant reference file(s) for the content type
and platform requested. These files contain current, research-backed conventions.

| File                                      | Load when                                                   |
| ----------------------------------------- | ----------------------------------------------------------- |
| `references/content-frameworks.md`        | Planning phase — framework selection                        |
| `references/ste-writing-rules.md`         | Execute phase — always (the writing law); Verify phase — always (the gate contract) |
| `references/anti-ai-checklist.md`         | Verify phase — always                                       |
| `references/seo-meta-conventions.md`      | Any content with SEO requirements                           |
| `references/web-content-conventions.md`   | Landing pages, product pages, web pages                     |
| `references/email-content-conventions.md` | Newsletters, campaigns, sequences                           |
| `references/twitter-conventions.md`       | Twitter/X tweets and threads                                |
| `references/facebook-conventions.md`      | Facebook posts and pages                                    |
| `references/instagram-conventions.md`     | Instagram captions                                          |
| `references/sales-content-conventions.md` | Sales pages, funnels, case studies, testimonials, proposals |

Load only what's needed for the current task. Never load all files at once.

---

## Profile-First Enforcement

**CRITICAL: No content is generated without a writer profile.**

When a user requests content and no profile exists in memory:

```
"No writer profile found. Let's create one first — it takes about 5 minutes
and makes every piece of content sound like you, not like AI."

→ Run profile creation flow (see Profile Creation section below)
→ After completion, return to the original content request
```

When a profile exists, load it from memory before starting any phase.

---

## The Five Phases

Every content request follows this sequence. Use `/writer:next` to auto-advance.

```
Discuss → Plan → Execute → Verify → Ship
```

### Phase 1: Discuss (`/writer:discuss [topic]`)

**Goal:** Understand what to write and why before touching the keyboard.

Gather in a conversational way (not as a rigid form):

1. **Topic and angle** — What's the main point? What specific perspective?
2. **Platform / content type** — Blog, LinkedIn, email, sales page, etc.
3. **Audience** — Who specifically? What do they already believe about this topic?
4. **Stage of awareness** — Unaware / Problem-aware / Solution-aware / Product-aware
5. **Goal** — What should the reader do or think differently after reading?
6. **Framework** — Suggest one based on type + goal; confirm with the user
7. **Length and format** — Or use profile defaults
8. **Research inputs** — Any URLs, data, or sources to incorporate?
9. **CTA** — Which CTA from the profile applies here?

**Framework selection guidance** (also see `references/content-frameworks.md`):

- Sales pages, landing pages → AIDA or PASTOR
- Problem-focused content, cold outreach → PAS
- Transformation stories, case studies → BAB
- Thought leadership → LEMA or SCQA
- Long-form articles → 4-Point (Hook → Effortless → Flow → Polish)
- Conversion-focused pages → CONVERT

Output a one-paragraph content brief and confirm before advancing.

Save state to memory as `[Content Writer] Current Project - Discussion`.

---

### Phase 2: Plan (`/writer:plan`)

**Goal:** Create a detailed outline and SEO strategy before writing.

1. Load discussion state from memory
2. Load `references/content-frameworks.md`
3. Load the platform-specific conventions file for this content type
4. If URLs were provided, fetch and extract key insights
5. Build a detailed outline: section headings, key points per section,
   placement of examples, data, social proof, and CTAs
6. Define SEO strategy if applicable: primary keyword, secondary keywords,
   meta title, meta description, URL slug
7. Present the outline and confirm before advancing

Save state to memory as `[Content Writer] Current Project - Plan`.

---

### Phase 3: Execute (`/writer:execute`)

**Goal:** Write the content following the plan and brand voice.

1. Load plan and writer profile from memory
2. Load the relevant platform conventions reference file
3. If the profile contains a blog URL, fetch 1–2 recent posts to calibrate voice
4. Write section by section following the plan outline

**Sentence formation is governed by STE law** (`references/ste-writing-rules.md`). Load it before writing. The core rules:

- Active voice. One idea per sentence. Aim under 25 words (hard 20/25 cap for SEO metadata and operational email).
- Plain words: use (not utilize/leverage), help (not facilitate), make sure (not ensure), start (not commence/initiate).
- A verb for an action, not a nominalization: "analyze the log", not "perform an analysis".
- No phrasal verbs, no semicolons, no contractions.
- Zero marketing adjectives and zero banned words — these fail the verify gate on every content type.

**Core writing principles (voice, on top of the law):**

- Specific over vague — use concrete numbers, names, examples
- Show don't tell — use scenarios and stories
- Vary sentence length for burstiness — the word cap is a ceiling, not a target
- Natural keyword placement — SEO without stuffing
- Every CTA is first-person: "Start my project" not "Start your project"

**Platform formatting** is governed by the conventions reference files. Load and follow them.

**Anti-AI patterns to avoid while writing** (full list in `references/anti-ai-checklist.md`):

- Overused words: leverage, seamless, robust, pivotal, delve, realm, foster, crucial
- Em dash overuse (—)
- Rule of three everywhere
- Throat-clearing openers ("In today's digital landscape...")
- Generic conclusions ("In conclusion, it's clear that...")
- Vague attributions ("Studies show...")
- Parallel list structures with identical sentence openings
- Negative parallelism ("It's not just X — it's Y")

Present the draft and confirm before advancing.

Save state to memory as `[Content Writer] Current Project - Draft`.

---

### Phase 4: Verify (`/writer:verify`)

**Goal:** STE compliance gate + SEO check + anti-AI audit before shipping.

**Always load `references/ste-writing-rules.md` and `references/anti-ai-checklist.md` for this phase.**

**STE compliance gate (MANDATORY — blocking):**

- Run `node scripts/ste-lint.js --gate=<platform> <draft-file>` on the draft.
- The linter resolves the tier from the platform/format and applies the threshold. It exits 0 on PASS, 1 on FAIL.
- Hard-zero on every tier: `marketing_adjective` == 0 and `banned_word` == 0.
- Thresholds: strict (`total` == 0), prose (`total_per100w` <= 3.0), social (`total_per100w` <= 4.0); em dashes limited by tier.
- If it FAILS: fix the draft against `references/ste-writing-rules.md`, re-run, and repeat until PASS. Never lower the threshold, skip the gate, or ship a failing draft.
- Record `ste_gate: pass` and `ste_per100w` in project state. Ship refuses to run unless `ste_gate` is `pass`.

**SEO check (claude-seo):**

- Check if claude-seo is available
- If yes: run analysis, present findings, apply recommendations
- If no: skip with warning, provide manual SEO checklist

**Anti-AI audit (humanizer):**

- Check if humanizer is available
- If yes: run audit, present AI pattern count, apply fixes
- If no: use `references/anti-ai-checklist.md` for manual audit

**Manual quality checklist:**

- Achieves stated goal from discussion phase
- Follows selected framework structure
- Matches brand voice from profile
- Every claim is specific (no vague superlatives)
- Social proof is attributed with names and titles
- CTAs are first-person and action-specific
- No AI writing patterns remaining

Present findings and apply fixes before advancing.

Save verified state to memory as `[Content Writer] Current Project - Verified`.

---

### Phase 5: Ship (`/writer:ship`)

**Goal:** Save to file and deliver with publishing notes.

**Output path:** `content-writer-output/[type]/[NNN]-[slug].md`

**Directory structure:**

```
content-writer-output/
├── profile/           (PROFILE.md, PRODUCTS.md, CTAS.md, CASE-STUDIES.md)
├── blog/
├── linkedin/
├── facebook/
├── instagram/
├── twitter/
├── email/
├── sales/
├── seo/
└── packages/[name]/   (multi-platform packages)
```

**Frontmatter to include:**

```yaml
---
title: [Title]
platform: [Platform]
framework: [Framework used]
word_count: [Count]
created: [Date]
author: [From profile]
status: draft
seo:
  meta_title: [Meta title]
  meta_description: [Meta description]
  keywords: [Keywords]
---
```

**Publishing notes** are platform-specific. Key reminders:

- Blog: upload to CMS, add featured image, set tags
- LinkedIn: link goes in first comment, post at 12–6 PM Tue–Thu, reply to comments in first hour
- Twitter/X: post as thread, link in final tweet or first reply (never post body), reply in first hour
- Facebook: link in first comment, post at 12–8 PM Tue–Wed, reply to all comments in first hour
- Email: verify unsubscribe link, test render on mobile before sending

Clear project state from memory after shipping. Keep profile in memory.

---

### Auto-Advance (`/writer:next`)

Detect current phase from memory and run the next one automatically:

- No project → "Use /writer:discuss to start"
- Has Discussion, no Plan → run `/writer:plan`
- Has Plan, no Draft → run `/writer:execute`
- Has Draft, no Verified → run `/writer:verify`
- Has Verified → run `/writer:ship`

---

## Profile Creation (`/writer:profile-create`)

A complete profile takes about 5 minutes and covers 10 topics. Run this conversationally —
not as a rigid numbered form. Group related questions, move quickly.

**Step 1: URL scanning (optional)**

Offer to analyze existing content for tone detection:

```
"Do you have any URLs I can analyze — blog posts, LinkedIn articles, anything you've
written? The more examples, the better the tone match."
```

Fetch each URL, analyze for: sentence length patterns, vocabulary level, personality
markers, formatting preferences. Present the detected tone profile and confirm.

**Step 2: Ten-topic questionnaire** (conversational, grouped by theme)

Gather across these topics — adapt the flow to what the user volunteers:

1. **Brand identity** — Name/title, company, domain, what the company does (1–2 sentences)
2. **Industry and market** — Industry/niche, 2–3 competitors, unique positioning
3. **Target audience** — Primary audience (be specific), their pain points, goals, objections
4. **Voice and tone** — 3–5 adjectives, writers/blogs they admire, things to avoid
5. **Content strategy** — Types of content, 3–5 content pillars, primary goal (awareness/leads/conversion/thought leadership)
6. **Products and services** — For each: name, 1-sentence description, target customer, key benefit, price range (optional)
7. **Case studies** — For each: client/project, challenge, solution, results with metrics, can mention publicly?
8. **CTAs** — For each: platform, CTA text, URL
9. **Publishing workflow** — Where they publish, approval process, preferred output format
10. **SEO strategy** — Target keywords (5–10), SEO priority level, any constraints

**Step 3: Confirm and save**

Present a summary of the full profile. On confirmation:

- Save to memory: `[Content Writer] Writer Profile`
- Save to files: `content-writer-output/profile/PROFILE.md`, `PRODUCTS.md`, `CTAS.md`, `CASE-STUDIES.md`

---

## Other Commands

**`/writer:profile-view`** — Display current profile from memory or profile files

**`/writer:profile-edit`** — Edit specific fields (products, CTAs, case studies, tone)

**`/writer:profile-delete`** — Delete profile from memory and files (confirm before deleting)

**`/writer:status`** — Show current phase, profile status, dependency availability, next step

**`/writer:help`** — Show all commands and quick start instructions

**`/writer:update`** — Check npm registry for updates, show changelog preview, confirm before upgrading

---

## Update Check

On first command of each session (once only):

1. Read `~/.claude/skills/content-writer/.version`
2. Check `npm view claude-content-writer version`
3. If newer version exists and not shown this session, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 Content Writer Update Available
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current: v{current}  →  Latest: v{latest}
  Run /writer:update to upgrade.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Mark as shown in session memory. Then continue with the user's command.

---

## Graceful Degradation

When claude-seo or humanizer are unavailable:

```
⚠ Note: [dependency] not available. [Check] skipped.
Content will still be generated. Install dependencies for full quality assurance.
```

Use `references/anti-ai-checklist.md` as the manual fallback for the humanizer check.
Use a basic SEO checklist (keyword in title, meta description present, H1 exists) as
fallback for claude-seo.

---

## Storage Pattern

**Memory** — Runtime fast access. Stores: writer profile, current project state (5 keys).

**Files** — Permanent. Stores: profile files, all generated content with frontmatter.

On save: write file first, update memory second.
On load: check memory first, fall back to file, sync memory from file if needed.
