---
name: content-writer
description: |
  Professional content generation with phased workflow (discuss→plan→execute→verify→ship),
  SEO optimization, and anti-AI auditing. Multi-profile support for unlimited brands.
  
  USE for: blog posts, LinkedIn, Twitter/X, Facebook, Instagram, email newsletters,
  landing pages, sales pages, case studies, product descriptions, SEO metadata.
  
  COMMANDS: /writer:discuss, /writer:plan, /writer:execute, /writer:verify, /writer:ship,
  /writer:next, /writer:profile-create, /writer:profile-list, /writer:profile-use,
  /writer:profile-view, /writer:profile-edit, /writer:status, /writer:help
  
  ALWAYS use for content requests like "write me a LinkedIn post" or "draft a blog article."
---

# Content Writer v2.0 — Claude AI Edition

Professional content generation system for Claude.ai. Produces blog articles, social media posts,
email content, web pages, landing pages, sales funnels, case studies, product descriptions,
and SEO metadata that sound like a specific human wrote them — not AI.

**Multi-Profile Support:** Create unlimited profiles (e.g., "My-SaaS", "Personal-Blog", "Client-A")
and assign different profiles to different projects. Claude remembers all profiles and which
profile is active for each project.

Integrated with:

- **ASD-STE100 Simplified Technical English** — the sentence-formation law, applied at execute and enforced by a linter gate at verify. See `references/ste-writing-rules.md`.
- **claude-seo** — SEO optimization at the verify phase
- **humanizer** — Anti-AI pattern auditing at the verify phase

---

## Reference Files

Before generating any content, load the relevant reference file(s) for the content type
and platform requested. These files contain current, research-backed conventions.

| File                                      | Load when                                                   |
| ----------------------------------------- | ----------------------------------------------------------- |
| `references/content-frameworks.md`        | Planning phase — framework selection                        |
| `references/ste-writing-rules.md`         | Execute phase — always (writing law); Verify phase — always (gate contract) |
| `references/anti-ai-checklist.md`         | Verify phase — always                                       |
| `references/seo-meta-conventions.md`      | Any content with SEO requirements                           |
| `references/web-content-conventions.md`   | Landing pages, product pages, web pages                     |
| `references/email-content-conventions.md` | Newsletters, campaigns, sequences                           |
| `references/twitter-conventions.md`       | Twitter/X tweets and threads                                |
| `references/facebook-conventions.md`      | Facebook posts and pages                                    |
| `references/instagram-conventions.md`     | Instagram captions                                          |
| `references/sales-content-conventions.md` | Sales pages, funnels, case studies, testimonials, proposals |
| `references/state-schema.md`              | State management — phase machine, profile schema, storage rules |

Load only what's needed for the current task. Never load all files at once.

---

## Profile-First Enforcement

**CRITICAL: No content is generated without a writer profile.**

### Profile Storage Model (Claude AI)

On Claude.ai, profiles are stored in **Claude's memory** (not files). Each profile has:
- A unique name (e.g., "My-SaaS", "Personal-Blog")
- Complete profile data (brand identity, voice, products, CTAs, case studies)
- Project-to-profile assignments tracked per conversation

### Profile Check on Content Request

When a user requests content, check:

1. **Is there an active profile for this project?** 
   - If YES → Use that profile
   - If NO → Check if any profiles exist

2. **If no active profile but profiles exist:**
   ```
   "I see you have these profiles: [list from memory]
   Which profile should I use for this project?"
   ```
   - Wait for user selection
   - Remember: "This project uses [profile-name] profile"
   - Proceed with content creation

3. **If no profiles exist at all:**
   ```
   "No writer profile found. Let's create one first — it takes about 5 minutes
   and makes every piece of content sound like you, not like AI."
   
   → Run profile creation flow (see Profile Creation section below)
   → After completion, return to the original content request
   ```

---

## The Five Phases

Every content request follows this sequence. Use `/writer:next` to auto-advance.

```
Discuss → Plan → Execute → Verify → Ship
```

State is tracked in **Claude's memory** for the current project:
- Current phase (discuss, plan, execute, verify, ship, complete)
- Project brief, outline, draft, and verified content
- All frontmatter fields per `references/state-schema.md`

### Phase 1: Discuss (`/writer:discuss [topic]`)

**Goal:** Understand what to write and why before touching the keyboard.

**Before starting:** Confirm active profile. If none assigned, run profile selection flow above.

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

**Remember state:** Store in memory — `phase: discuss`, plus all gathered fields (topic, angle, audience, awareness_stage, goal, framework, length, cta, research_urls, key_points).

---

### Phase 2: Plan (`/writer:plan`)

**Goal:** Create a detailed outline and SEO strategy before writing.

1. Recall discussion state from memory (topic, audience, framework, etc.)
2. Load `references/content-frameworks.md`
3. Load the platform-specific conventions file for this content type
4. If URLs were provided, fetch and extract key insights:
   - **If code-execution has network access**: fetch the URL directly
   - **If not**: ask the user to paste the article text or 2-3 representative paragraphs instead
5. Build a detailed outline: section headings, key points per section,
   placement of examples, data, social proof, and CTAs
6. Define SEO strategy if applicable: primary keyword, secondary keywords,
   meta title, meta description, URL slug
7. Present the outline and confirm before advancing

**Remember state:** Update memory — `phase: plan`, plus SEO fields (seo_primary_keyword, seo_secondary_keywords, seo_meta_title, seo_meta_description, seo_slug, platform_conventions_file, voice_notes, proof_points, cta_placement).

---

### Phase 3: Execute (`/writer:execute`)

**Goal:** Write the content following the plan and brand voice.

1. Recall plan state and active profile from memory
2. Load the relevant platform conventions reference file
3. If the profile contains a blog URL, fetch 1–2 recent posts to calibrate voice:
   - **If code-execution has network access**: fetch the URL directly
   - **If not**: ask the user to paste 2-3 representative paragraphs instead
4. Write section by section following the plan outline

**Sentence formation is governed by STE law** (`references/ste-writing-rules.md`). Load it before writing:

- Active voice. One idea per sentence. Aim under 25 words (hard 20/25 cap for SEO metadata and operational email).
- Plain words: use (not utilize/leverage), help (not facilitate), make sure (not ensure), start (not commence/initiate).
- A verb for an action, not a nominalization ("analyze the log", not "perform an analysis").
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

**Remember state:** Update memory — `phase: execute`, plus `draft_word_count`.

---

### Phase 4: Verify (`/writer:verify`)

**Goal:** STE compliance gate + SEO check + anti-AI audit before shipping.

**Always load `references/ste-writing-rules.md` and `references/anti-ai-checklist.md` for this phase.**

**STE compliance gate (MANDATORY — blocking):**

- **If code execution is available**: write the draft to a file and run `node scripts/ste-lint.js --gate=<platform> <draft-file>` (the linter ships in this skill's `scripts/` folder). It resolves the tier and exits 0 (PASS) or 1 (FAIL).
- **If code execution is not available**: run the STE self-lint checklist from `references/ste-writing-rules.md` by hand, and record `ste_gate: manual`.
- Hard-zero on every tier: `marketing_adjective` == 0 and `banned_word` == 0.
- Thresholds: strict (`total` == 0), prose (`total_per100w` <= 3.0), social (`total_per100w` <= 4.0).
- If it FAILS: fix the draft against the law, re-check, and repeat until PASS. Never skip the gate or ship a failing draft. Record `ste_gate: pass` and `ste_per100w`.

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

**Remember state:** Update memory — `phase: verify`, plus `seo_score`, `ai_patterns_fixed`, `ste_gate`, `ste_per100w`, and `manual_check`. Ship refuses to run unless `ste_gate` is `pass` (or `manual`).

---

### Phase 5: Ship (`/writer:ship`)

**Goal:** Output final content as artifact with publishing notes.

**Output as Claude Artifact:** Present the final content in a code block with filename:

```markdown
File: content-writer-output/[platform]/[NNN]-[slug].md
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

[Full content here]
```

The user can then:
- View the content in the artifact panel
- Copy/download the markdown
- Edit directly in the artifact
- Save to their local system

**Publishing notes** (platform-specific):

- Blog: upload to CMS, add featured image, set tags
- LinkedIn: link goes in first comment, post at 12–6 PM Tue–Thu, reply to comments in first hour
- Twitter/X: post as thread, link in final tweet or first reply (never post body), reply in first hour
- Facebook: link in first comment, post at 12–8 PM Tue–Wed, reply to all comments in first hour
- Email: verify unsubscribe link, test render on mobile before sending

**Remember state:** Update memory — `phase: ship` or `phase: complete`.

---

### Auto-Advance (`/writer:next`)

Detect current phase from memory and run the next one automatically:

- No project state in memory → run `/writer:discuss`
- `phase: discuss` → run `/writer:plan`
- `phase: plan` → run `/writer:execute`
- `phase: execute` → run `/writer:verify`
- `phase: verify` → run `/writer:ship`
- `phase: ship` or `phase: complete` → "Workflow finished — run `/writer:discuss` to start a new project"

---

## Profile Management Commands

### Profile Creation (`/writer:profile-create [profile-name]`)

A complete profile takes about 5 minutes and covers 10 topics. Run this conversationally —
not as a rigid numbered form. Group related questions, move quickly.

**Profile Naming:**
- Use descriptive names: "My-SaaS", "Personal-Blog", "Client-Acme"
- Store name in memory: "Profile [name] created"
- One profile per brand/voice you write for

**Step 1: URL scanning (optional)**

Offer to analyze existing content for tone detection:

```
"Do you have any URLs I can analyze — blog posts, LinkedIn articles, anything you've
written? The more examples, the better the tone match."
```

For each URL provided:
- **If code-execution has network access**: fetch the URL directly, analyze for sentence length patterns, vocabulary level, personality markers, formatting preferences
- **If not**: ask the user to paste 2-3 representative paragraphs instead, analyze those

Present the detected tone profile and confirm.

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

1. **Output as artifact** with filename: `PROFILE-[name].md`
2. **Store in memory:** "Profile [name] saved with: [key details summary]"
3. **If this is the first profile or user says "use for this project":**
   - Remember: "This project uses [name] profile"

---

### Profile List (`/writer:profile-list`)

Display all profiles Claude remembers:

```
┌─────────────────────────────────────────────────────────────┐
│  Available Profiles                                         │
├─────────────────────────────────────────────────────────────┤
│  • My-SaaS        (active for this project)                 │
│  • Personal-Blog                                            │
│  • Client-Acme                                              │
└─────────────────────────────────────────────────────────────┘
```

If no profiles exist:
```
"No profiles found. Create one with /writer:profile-create [name]"
```

---

### Profile Use (`/writer:profile-use [profile-name]`)

Switch the active profile for the current project:

1. Check if profile exists in memory
2. If YES:
   - Remember: "This project now uses [name] profile"
   - Confirm: "Switched to [name] profile for this project"
3. If NO:
   - Error: "Profile '[name]' not found. Available profiles: [list]"
   - Suggest: "Create it with /writer:profile-create [name]"

---

### Profile View (`/writer:profile-view [profile-name]`)

Display a profile's details:
- If name provided → show that profile
- If no name → show active profile for this project
- If no active profile → show error

Output as artifact: `PROFILE-[name].md`

---

### Profile Edit (`/writer:profile-edit [profile-name]`)

Edit specific fields of a profile:
- If name provided → edit that profile
- If no name → edit active profile
- Ask which fields to edit (products, CTAs, case studies, tone, etc.)
- Update in memory
- Output updated profile as artifact

---

### Profile Delete (`/writer:profile-delete [profile-name]`)

Delete a profile from memory:
- Confirm before deleting
- If it was the active profile for this project, clear that assignment
- Remove from memory

---

## Other Commands

**`/writer:status`** — Show current project state:
- Active profile (if any)
- Current phase (discuss/plan/execute/verify/ship/complete)
- Brief summary of what's been done
- Next recommended step

**`/writer:help`** — Show all commands and quick start instructions

**`/writer:update`** — Check npm registry for updates, show changelog preview

---

## Update Check

On first command of each session (once only):

1. Check `npm view claude-content-writer version`
2. If newer version exists and not shown this session, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 Content Writer Update Available
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current: v{current}  →  Latest: v{latest}
  Visit: https://github.com/arslan-sociilabs/content-writer
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

## Storage Pattern (Claude AI)

**Memory is the source of truth.** On Claude.ai:

- **Profiles** are stored in Claude's memory with their name as the key
- **Project state** (current phase, brief, outline, draft) is tracked per conversation
- **Project-to-profile assignments** are remembered: "This project uses [profile]"
- **Artifacts** are used for all file-like outputs (profiles, drafts, final content)

**On load:** Check memory for active profile and current phase.  
**On save:** Update memory + output artifact for user visibility.

---

## Multi-Project Workflow Example

**Project A (SaaS Company):**
```
User: /writer:profile-create My-SaaS
[Creates profile, outputs artifact, stores in memory]

User: Write a LinkedIn post about our new feature
[Uses My-SaaS profile, generates content, outputs artifact]
```

**Project B (Personal Blog):**
```
User: /writer:profile-create Personal-Blog
[Creates second profile, both now exist in memory]

User: /writer:profile-list
[Shows: My-SaaS, Personal-Blog]

User: /writer:profile-use Personal-Blog
[Sets Personal-Blog as active for this project]

User: Write a blog post about remote work
[Uses Personal-Blog profile, different voice than Project A]
```

**Back to Project A:**
```
User: /writer:next
[Continues using My-SaaS profile — each project remembers its own assignment]
```

---

## Security Note

Because profiles and state are stored in memory, they persist for the duration of the
conversation and across chats within the same Claude Project. However, memory may be
cleared or reset. For critical profiles, users should download the profile artifacts
and re-upload them to Project Knowledge for persistence.
