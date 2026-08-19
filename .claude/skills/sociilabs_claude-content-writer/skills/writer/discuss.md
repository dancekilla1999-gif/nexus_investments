---
name: writer:discuss
description: Start a new content project — gather requirements, clarify decisions, identify content type and framework
---

# /writer:discuss — Start Content Project

@~/.claude/skills/shared-context.md

## Objective

Gather everything needed before touching the keyboard. No content is generated in this phase — only requirements, context, and decisions.

## Step 1: Profile check

Check for profile files first:

1. Check `content-writer-output/profile/PROFILE.md`
2. If file exists — load it; if Claude Code's memory tool is available, populate it as a read-through cache for faster re-reads within the same session
3. If neither file nor memory cache exists — check for legacy `[Content Writer] Name` in memory (one-time upgrade path)
4. If no profile exists anywhere — say:

> "No writer profile found. Let's create one first — it takes about 5 minutes and makes every piece of content sound like you."

Then run `/writer:profile-create`. After completion, return here.

If profile exists, load: name, voice, audience, content types, CTAs, case studies.

## Step 2: Gather requirements (conversational — not a form)

Ask about these, grouped naturally. Don't fire them as a numbered list:

**Topic and angle:**
- What's the subject?
- What specific perspective or argument?
- What do you want the reader to think, feel, or do differently after reading?

**Platform and format:**
- Where is this going? (blog, LinkedIn, Twitter/X, Facebook, Instagram, email, landing page, sales page, case study, product description, SEO metadata)
- Any length or format constraints beyond platform defaults?

**Audience:**
- Who specifically? (not "marketers" — "founders of 5–20 person SaaS teams who've raised a seed round")
- What do they already believe about this topic?
- What stage of awareness? (Unaware / Problem-aware / Solution-aware / Product-aware)

**Research inputs:**
- Any URLs, data, case studies, or sources to incorporate?
- Any specific statistics or claims to include or challenge?

**CTA:**
- What should the reader do after reading?
- Which CTA from the profile fits? (load and suggest the appropriate one)

## Step 3: Select framework

Based on platform + goal + audience awareness stage, recommend one. Reference `references/content-frameworks.md` for full guidance.

Quick selection logic:
- Sales pages, landing pages → AIDA or PASTOR
- Problem-focused content, cold outreach → PAS
- Transformation stories, case studies → BAB
- Thought leadership → LEMA or SCQA
- Long-form articles → 4-Point
- Conversion-focused pages → CONVERT

State the recommendation and why. Confirm with the user before locking it in.

## Step 4: Save state

Write to `content-writer-output/profile/PROJECT-STATE.md`:

```yaml
---
phase: discuss
platform: [platform]
format: [format]
topic: [topic]
angle: [one-sentence contrarian or unique take]
audience: [specific description]
awareness_stage: [unaware/problem-aware/solution-aware/product-aware]
goal: [what the reader should do or think after reading]
framework: [selected framework]
length: [word count or platform default]
cta: [which CTA label from profile]
research_urls: [any URLs provided]
key_points: [3–5 bullets of what to cover]
seo_primary_keyword: 
seo_secondary_keywords: 
seo_meta_title: 
seo_meta_description: 
seo_slug: 
platform_conventions_file: 
voice_notes: 
proof_points: 
cta_placement: 
draft_word_count: 
cta_expanded: 
seo_score: 
ai_patterns_fixed: 
manual_check: 
updated_at: [ISO timestamp]
---

## Discussion Brief

[One-paragraph brief — platform, format, topic, angle, audience, awareness stage, goal, framework, CTA label, research URLs, key points, written as prose]

## Outline

## Draft

## Verified Content
```

If Claude Code's memory tool is available, mirror the same values into memory as a secondary cache step (save as `[Content Writer] Current Project - Discussion`).

## Step 5: Confirm and advance

Present a one-paragraph brief — not a formatted table. Read it aloud in your head; if it sounds like a form, rewrite it as a sentence.

Example:
> "So we're writing a LinkedIn carousel for startup founders who are problem-aware — they know validation matters but keep skipping it. The angle: most validation advice is too slow to actually change behavior. Framework is BAB. CTA is the soft booking link. Ready to plan?"

Wait for confirmation, then instruct: **Run `/writer:plan` or `/writer:next` to continue.**
