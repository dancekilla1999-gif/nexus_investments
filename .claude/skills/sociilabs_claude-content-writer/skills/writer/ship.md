---
name: writer:ship
description: Finalize and save — write to file with frontmatter, generate publishing notes, clear project state
---

# /writer:ship — Ship Content

@~/.claude/skills/shared-context.md

## Objective

Save the verified content to disk with proper metadata, generate platform-specific publishing notes, and clear project state from memory.

## Step 1: Load verified content

Load `content-writer-output/profile/PROJECT-STATE.md`.

Check that `phase: verify` is present in the frontmatter. If missing: "No verified content found. Run `/writer:verify` first."

**STE gate check (blocking).** Read the `ste_gate` frontmatter field. It must be `pass` (or `manual`, the Node-unavailable fallback). If it is `fail`, empty, or absent: stop and say "The STE compliance gate has not passed. Run `/writer:verify` and clear the gate before shipping." Do not ship content that has not cleared the gate.

Read:
- Body sections: ## Verified Content (the final content), ## Discussion Brief (for topic, angle, audience), ## Outline (for framework, SEO metadata)
- Frontmatter fields: platform, format, framework, length, cta, seo_primary_keyword, seo_secondary_keywords, seo_meta_title, seo_meta_description, seo_slug, draft_word_count, ste_gate, ste_per100w

If Claude Code's memory tool is available, populate it as a read-through cache for faster re-reads within the same session.

## Step 2: Generate filename

Format: `NNN-[slug].md`

- **NNN**: auto-increment based on existing files in the output directory for this type
- **slug**: title or topic → lowercase, hyphens, no special characters, max 50 characters

Examples: `001-why-mvp-validation-fails.md`, `014-linkedin-post-hiring-developers.md`

## Step 3: Determine output path

```
content-writer-output/
├── blog/          ← blog articles
├── linkedin/      ← LinkedIn posts
├── twitter/       ← Twitter/X tweets and threads
├── facebook/      ← Facebook posts
├── instagram/     ← Instagram captions
├── email/         ← newsletters, campaigns, sequences
├── sales/         ← sales pages, landing pages, case studies
├── seo/           ← SEO metadata only
└── packages/[name]/  ← multi-platform content packages
```

Create the directory if it doesn't exist.

## Step 4: Write frontmatter

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
  meta_title: [meta title — from plan state]
  meta_description: [meta description — from plan state]
  primary_keyword: [keyword]
  slug: [URL slug]
---
```

Omit SEO block for social posts and email.

## Step 5: Write the file

Structure:
1. Frontmatter (YAML block above)
2. Full content
3. Publishing notes section (see Step 6)

## Step 6: Generate publishing notes

Add a `## Publishing Notes` section at the end of the file.

**Blog articles:**
```
## Publishing Notes
- Upload to CMS as draft; set category and tags before publishing
- Add featured image (recommended: 1200×630px)
- SEO metadata set in frontmatter above — paste into CMS SEO fields
- Internal links: check for opportunities to link to existing content
- Share to LinkedIn 2+ hours after publishing (link in first comment)
- Share to newsletter if applicable
```

**LinkedIn posts:**
```
## Publishing Notes
- Best posting window: 12–6 PM Tue–Thu (local time)
- Paste content to LinkedIn; do NOT include the link in the post body
- Post the link in the first comment immediately after publishing
- Respond to every comment in the first 60 minutes
- Share the post to Stories after publishing for early engagement boost
```

**Twitter/X threads:**
```
## Publishing Notes
- Best posting window: 9 AM–3 PM Tue–Thu (local time)
- Post tweet 1, then reply to it with tweet 2, reply to that with tweet 3, etc.
- Complete the full thread within 3–5 minutes of starting
- Never put links in tweet body — add to final tweet or first reply
- Stay available for the first 30–60 minutes to reply to responses
- Premium account: 10x reach advantage — worth it if posting consistently
```

**Facebook posts:**
```
## Publishing Notes
- Best posting window: 12–8 PM Tue–Wed (local time)
- Do NOT include the link in the post body — put it in the first comment
- Post the link in the first comment immediately after publishing
- Respond to every comment within the first 60 minutes
- Share to relevant Groups where rules allow (significantly higher reach than Pages)
```

**Instagram captions:**
```
## Publishing Notes
- Best posting window: 9 AM or 12 PM Wed–Thu (local time)
- Visual/image must be prepared separately before posting
- Caption hook must appear in the first 125 characters (above the "more" fold)
- Hashtags: place in caption after line breaks, or in first comment
- Share post to Stories immediately after posting with "New post" sticker
- Respond to all comments within the first 60 minutes
```

**Email:**
```
## Publishing Notes
- Test render on mobile before sending — majority of opens are mobile
- Verify unsubscribe link is functional
- Send a test to yourself first
- Best send time: Tuesday or Thursday, 9–11 AM (recipient local time)
- Subject line is in the frontmatter — A/B test if your platform supports it
- Check plain-text version renders cleanly
```

**Sales / landing pages:**
```
## Publishing Notes
- Upload to CMS or page builder
- A/B test headline if traffic volume supports it
- Verify all CTAs link correctly
- Add trust signals (logos, testimonials) as separate design elements
- Set up conversion tracking before publishing
```

## Step 7: Mark project complete

Update `content-writer-output/profile/PROJECT-STATE.md`:

1. Update frontmatter — set `phase: complete` and `updated_at: [ISO timestamp]`.

Do NOT delete the file — a completed PROJECT-STATE.md with `phase: complete` is what tells the phase state machine to route back to `/writer:discuss` for a new project.

If Claude Code's memory tool is available, clear these entries as a secondary step:
- `[Content Writer] Current Project - Discussion`
- `[Content Writer] Current Project - Plan`
- `[Content Writer] Current Project - Draft`
- `[Content Writer] Current Project - Verified`

**Do NOT delete** the writer profile entries (`[Content Writer]`, `[Content Writer Product]`, `[Content Writer CTA]`, `[Content Writer Case Study]`).

## Step 8: Confirm delivery

```
Content shipped to: content-writer-output/[type]/[filename].md

Platform:    [platform]
Framework:   [framework]
Word count:  [count]
Status:      draft

Publishing notes attached to file.
Run /writer:discuss to start a new project.
```
