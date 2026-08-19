---
name: writer:profile-create
description: Create a new writer profile with optional URL scanning and a conversational brand questionnaire
---

# /writer:profile-create — Create Profile

@~/.claude/skills/shared-context.md

## Objective

Build a complete writer profile through conversational interview. Saved to both memory and disk. Profile-first enforcement: no content generation without one.

Load `references/profile-management.md` before starting — it contains the memory key conventions, file structure, and edge cases for partial profiles.

## Step 1: URL scanning (optional)

Ask:
> "Do you have any URLs I can analyze — blog posts, articles, LinkedIn content, anything you've written? The more examples, the better the tone match. Paste them here, or type 'skip'."

If URLs provided:
- Fetch each URL
- Analyze for: sentence length patterns, vocabulary level, use of first person, directness, humor or irreverence, paragraph length, use of lists vs. prose
- Generate a brief tone profile: "Based on your content: direct, occasionally irreverent, specific examples over abstract claims, short paragraphs. Does that sound right?"
- Confirm or adjust before proceeding

If skipped: note that voice calibration will rely on the questionnaire answers.

## Step 2: Conversational questionnaire (10 topics)

Do not present these as a numbered form. Move through them conversationally, grouping related questions, adapting to what the user volunteers.

Cover all 10 topics before finishing:

1. **Identity** — Name, title, company name, company domain, tagline or mission (optional), what the company does in 1–2 sentences in the user's own words

2. **Industry and market** — Industry/niche, 2–3 main competitors, what makes them different from those competitors (the positioning)

3. **Target audience** — Primary audience (specific: "startup founders who've raised a seed round," not "entrepreneurs"), their main pain points, their goals, their likely objections to buying

4. **Voice and tone** — 3–5 adjectives describing the ideal writing voice, writers or publications they admire and why, anything to actively avoid

5. **Content strategy** — Types of content they create, 3–5 content pillars (recurring themes), primary goal (thought leadership / leads / SEO / brand awareness / community)

6. **Products and services** — For each: name, 1-sentence description, target customer, key benefit, price range (optional), when to reference it in content

7. **Case studies** — For each: client context (or anonymized descriptor), the problem, the approach, the specific outcome with metrics, NDA status (can name / anonymize / confidential), set rotation to "active"

8. **CTAs** — For each: a label, type (soft/direct/specific offer), the copy text, which platforms it works on, the URL or action

9. **Publishing workflow** — Where they publish, their typical sequence and timing, preferred output format (Markdown / plain text / HTML), any CMS-specific requirements

10. **SEO strategy** — Target keywords or topics (5–10), SEO priority level (high / medium / low), any constraints (word count requirements, domain authority context)

## Step 3: Confirm and save

Present a summary organized by section. Ask: "Does this look right? Anything to adjust before I save?"

After confirmation:

**Write to files (primary):**
- `content-writer-output/profile/PROFILE.md` — all core profile entries in readable markdown format
- `content-writer-output/profile/PRODUCTS.md` — all product entries
- `content-writer-output/profile/CTAS.md` — all CTA entries
- `content-writer-output/profile/CASE-STUDIES.md` — all case study entries with rotation status

**Save to memory (secondary cache):**
- Save each section as a `[Content Writer]` memory entry for this session's fast lookups
- This is a cache populated FROM the files, not a separate source of truth

## Step 4: Confirm and redirect

> "Profile saved. [N] products, [N] CTAs, [N] case studies on file. Ready to create content — run `/writer:discuss` to start."

If the user had a content request before being redirected to profile creation, return to that request now.
