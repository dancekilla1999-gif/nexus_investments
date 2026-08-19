---
name: writer:execute
description: Generate content following the plan, applying selected framework, brand voice, and platform conventions
---

# /writer:execute — Generate Content

@~/.claude/skills/shared-context.md

## Objective

Write the content. Every structural and strategic decision was made in discuss and plan. This phase is execution — follow the plan, apply the voice, produce the draft.

**This phase forms every sentence with STE discipline.** Load `references/ste-writing-rules.md` now and keep it open. It is the writing law for this engine. The verify phase runs a linter (`scripts/ste-lint.js`) against these same rules, and no content ships until that gate passes. Writing to the law here means the gate passes on the first try.

## Step 1: Load all state

Load `content-writer-output/profile/PROJECT-STATE.md`.

Check that `phase: plan` is present in the frontmatter. If missing: "No plan found. Run `/writer:plan` first."

Read:
- Frontmatter fields: platform, format, topic, angle, audience, awareness_stage, goal, framework, length, cta, research_urls, key_points, seo_primary_keyword, seo_secondary_keywords, seo_meta_title, seo_meta_description, seo_slug, platform_conventions_file, voice_notes, proof_points, cta_placement
- Body sections: ## Discussion Brief, ## Outline

If Claude Code's memory tool is available, populate it as a read-through cache for faster re-reads within the same session.

Also load writer profile (`content-writer-output/profile/PROFILE.md` — check file first, memory second): voice adjectives, avoid list, voice notes.

## Step 2: Load platform conventions

From the plan state, identify the platform conventions file and load it:

| Platform | File |
|----------|------|
| Blog / web pages / landing pages | `references/web-content-conventions.md` |
| Email (newsletters, campaigns, sequences) | `references/email-content-conventions.md` |
| LinkedIn | `references/content-frameworks.md` (LinkedIn section) |
| Twitter / X | `references/twitter-conventions.md` |
| Facebook | `references/facebook-conventions.md` |
| Instagram | `references/instagram-conventions.md` |
| Sales pages, case studies, testimonials | `references/sales-content-conventions.md` |
| SEO metadata | `references/seo-meta-conventions.md` |

Load only the file(s) needed. Do not load all files.

## Step 3: Write section by section

Follow the outline exactly. For each section:

1. Write the section's core point first — one clear statement
2. Add the proof: specific number, named case study, concrete scenario
3. Expand with supporting detail if the section has word count to fill
4. Transition to the next section naturally — no "In the next section" throat-clearing

**Sentence formation — STE law (from `references/ste-writing-rules.md`):**
- Active voice. "The parser reads the file", not "the file is read by the parser".
- One idea per sentence. Aim under 25 words. For SEO metadata and operational email, keep the hard 20/25-word cap.
- Use the short common word: use (not utilize/leverage), help (not facilitate), make sure (not ensure), before (not prior to), start (not commence/initiate), also (not additionally/furthermore).
- Use a verb for an action: "analyze the log", not "perform an analysis of the log".
- No phrasal verbs: "start" not "spin up", "contact" not "reach out", "launch" not "roll out".
- No semicolons. Write two sentences. No contractions. Expand "don't" to "do not".
- Zero marketing adjectives and zero banned words — these fail the verify gate on every content type. Never write: seamless, robust, powerful, cutting-edge, effortless, empower, unlock, comprehensive, utilize, leverage.

**Core writing principles (voice, on top of the law):**
- Specific over vague: "saved $40K in Q1" not "saved money"
- Show don't tell: scenario > summary
- Vary sentence length for burstiness: a three-word sentence next to a longer one. The word cap is a ceiling, not a target — even lengths read like AI.
- Mirror the audience's language: use the phrases from research, not marketing polish
- Every CTA is first-person: "Start my project" not "Start your project"

## Step 4: Apply anti-AI discipline while writing

Two layers. Catch both as you write, not after.

**Layer 1 — STE self-lint (form).** Run this over each section before moving on (full checklist in `references/ste-writing-rules.md`):
1. Any sentence over its cap? Split it.
2. Any semicolon? Replace it with a period.
3. Any contraction? Expand it.
4. Any passive voice with a known actor? Make it active.
5. Any "-ing" main verb, nominalization ("perform an analysis"), or phrasal verb ("spin up")? Use a plain verb.
6. Any marketing adjective or banned word? Remove it. These fail the verify gate on every tier.
7. Same thing named two ways? Pick one name.

**Layer 2 — anti-AI tells (higher-level).** These kill credibility:
- Em dashes (—) → use periods or line breaks. Limit: 1 per 500 words (0 for SEO metadata and operational email).
- Negative parallelism: "It's not just X — it's Y"
- Rule of three in every paragraph
- Symmetric list structures with identical openings
- Generic inspirational conclusions
- Throat-clearing openers: "In today's fast-paced world..."
- Vague attributions: "Studies show..." → name the study

Full pattern list in `references/anti-ai-checklist.md` — load it if unsure. STE fixes the form of a sentence. The anti-AI checklist fixes the tells. Apply both.

## Step 5: Insert CTAs

Follow CTA placement from the plan state. Use the shortcode labels from the profile:
- `{{cta:soft}}` for embedded soft CTAs
- `{{cta:direct}}` for closing CTAs
- Expand to actual copy at this stage (or leave as shortcodes if user specified CMS integration in discussion)

First-person CTA copy: "Book my call" not "Book a call." "Get the full framework" not "Download our guide."

## Step 6: Apply platform formatting

Follow the loaded conventions file for the exact formatting rules. Key defaults:
- Blog: H2 every 300–400 words, 2–3 sentence paragraphs max
- LinkedIn: line break every 2–3 lines, link in first comment noted in publishing notes
- Twitter/X: numbered tweets (1/N), links in reply to thread — never in tweet body
- Instagram: hook in first 125 characters, line breaks every 2–3 lines
- Email: mobile-first structure, preheader in first 1–2 lines of body

## Step 7: Save draft state

Update `content-writer-output/profile/PROJECT-STATE.md`:

1. Update frontmatter — set `phase: execute`, and set these fields:
   - `draft_word_count: [count]`
   - `cta_expanded: [yes/no — whether shortcodes were expanded]`
   - `updated_at: [ISO timestamp]`

2. Write the full draft under the `## Draft` body heading (keep the `## Discussion Brief` and `## Outline` sections unchanged).

If Claude Code's memory tool is available, mirror the same values into memory as a secondary cache step (save as `[Content Writer] Current Project - Draft`).

Present the full draft. Then instruct:
**Run `/writer:verify` or `/writer:next` to quality-check the content.**
