---
name: writer:plan
description: Research and plan content — create detailed outline, define SEO strategy, prep all inputs for execution
---

# /writer:plan — Plan Content

@~/.claude/skills/shared-context.md

## Objective

Produce a detailed execution plan before writing begins. The plan should be specific enough that execution is mechanical — no decisions left to make mid-draft.

## Step 1: Load state

Load `content-writer-output/profile/PROJECT-STATE.md`.

Check that `phase: discuss` is present in the frontmatter. If the file is missing or does not have `phase: discuss`: "No discussion state found. Run `/writer:discuss` first."

Read the ## Discussion Brief body section and all frontmatter fields (platform, format, topic, angle, audience, awareness_stage, goal, framework, length, cta, research_urls, key_points).

If Claude Code's memory tool is available, populate it as a read-through cache for faster re-reads within the same session.

Also load:
- Writer profile (`content-writer-output/profile/PROFILE.md` — check file first, memory second)
- Platform-specific conventions file for this content type (see reference table in SKILL.md)
- `references/content-frameworks.md`

## Step 2: Research (if inputs provided)

If discussion state contains `research_urls`, fetch each URL and extract:
- Core argument or claim
- Supporting data points and statistics
- What this source gets wrong or leaves out (the gap = the angle)
- Exact phrases the audience uses (language to mirror in the content)

If no URLs were provided, check the discussion state for topic + audience, then:
- Note what the standard advice on this topic says (to know what to challenge or extend)
- Pull from profile case studies: which active case study fits this topic best?
- Identify the one proof point that makes the argument concrete

Load `references/research-workflow.md` if deeper research guidance is needed.

## Step 3: Build the outline

Using the selected framework from discussion state, create a section-by-section outline.

Each section entry must include:
- **Heading** (or tweet number for threads, slide number for carousels)
- **Core point** — the one idea this section makes
- **Proof or example** — the specific evidence, case study reference, or scenario
- **Word count target** (for long-form) or **character target** (for social)
- **Where CTAs appear** — note which sections carry embedded CTAs vs. the closing CTA

For social formats (LinkedIn, Twitter, Facebook, Instagram):
- List each post/tweet/slide as a numbered item
- Note the hook — the exact first line or first-slide claim
- Note where the save/share CTA appears

## Step 4: SEO strategy (if applicable)

For blog articles, landing pages, product pages, or any content with search intent:

- **Primary keyword:** the single term this piece should own
- **Secondary keywords:** 3–5 related terms to weave in naturally
- **Search intent:** informational / commercial / transactional — confirm the outline matches
- **Meta title** (under 60 characters, front-loaded with keyword)
- **Meta description** (under 160 characters, includes keyword, states the value clearly)
- **URL slug** (lowercase, hyphens, primary keyword in slug)

Load `references/seo-meta-conventions.md` for the current rules before writing these.

## Step 5: Voice calibration

If the profile includes a blog URL and the content type is blog or long-form:
- Fetch 1–2 recent posts
- Note: sentence length patterns, vocabulary level, how they open sections, how direct they are
- Add a "voice notes for this piece" line to the plan

If no blog URL exists: rely on the profile's voice adjectives and avoid list.

**Note the STE tier** for this content type (see `references/ste-writing-rules.md`). Execute forms every sentence to the STE law, and verify runs a linter gate against it:
- SEO metadata, operational email → **strict** tier (zero tolerance)
- LinkedIn, Twitter/X, Facebook, Instagram → **social** tier
- blog, web, landing, sales, case studies, newsletters → **prose** tier

Add a one-line "STE tier: [strict/prose/social]" reminder to the voice notes so execute writes to the right ceiling.

## Step 6: Save plan state

Update `content-writer-output/profile/PROJECT-STATE.md`:

1. Update frontmatter — set `phase: plan`, and set these fields:
   - `seo_primary_keyword: [keyword]`
   - `seo_secondary_keywords: [list]`
   - `seo_meta_title: [title]`
   - `seo_meta_description: [description]`
   - `seo_slug: [slug]`
   - `platform_conventions_file: [which reference file was loaded]`
   - `voice_notes: [calibration notes for this piece]`
   - `proof_points: [which case studies and data points to use, in which sections]`
   - `cta_placement: [where each CTA appears]`
   - `updated_at: [ISO timestamp]`

2. Write the full outline under the `## Outline` body heading (keep the `## Discussion Brief` section unchanged).

If Claude Code's memory tool is available, mirror the same values into memory as a secondary cache step (save as `[Content Writer] Current Project - Plan`).

## Step 7: Present and confirm

Show the outline clearly. Ask: "Does this cover everything, or should we adjust any section before I start writing?"

Accept edits. Update the plan state in memory. Then instruct:
**Run `/writer:execute` or `/writer:next` to generate the content.**
