---
name: writer:verify
description: Quality check — SEO optimization, anti-AI audit, and manual review before shipping
---

# /writer:verify — Verify Content Quality

@~/.claude/skills/shared-context.md

## Objective

Catch every problem before the content ships. SEO check, anti-AI audit, and a manual quality pass. Nothing leaves this phase that wouldn't hold up to scrutiny.

## Step 1: Load draft

Load `content-writer-output/profile/PROJECT-STATE.md`.

Check that `phase: execute` is present in the frontmatter. If missing: "No draft found. Run `/writer:execute` first."

Read:
- Body section: ## Draft (the full draft content)
- Frontmatter fields: platform, format, framework, seo_primary_keyword, seo_secondary_keywords, seo_meta_title, seo_meta_description, seo_slug

If Claude Code's memory tool is available, populate it as a read-through cache for faster re-reads within the same session.

Also load these — this phase always uses both:
- `references/anti-ai-checklist.md`
- `references/ste-writing-rules.md` (the writing law and the tiered gate contract)

## Step 2: SEO check

**If claude-seo is available:**
- Run `/seo:analyze` on the content
- Present findings with scores
- Ask: "Apply recommendations? (yes / no / manual)"
- Apply approved changes and note them

**If claude-seo is not available:**
- Run a manual SEO check:
  - [ ] Primary keyword appears in: title/headline, first 100 words, at least one H2, meta description
  - [ ] Meta title is under 60 characters and front-loads the keyword
  - [ ] Meta description is 150–160 characters and includes the keyword
  - [ ] URL slug is lowercase, hyphened, and contains the primary keyword
  - [ ] No keyword stuffing — reads naturally
  - [ ] Internal/external links included where appropriate
  - [ ] Image alt text suggestions included (for blog articles)
- Note: "claude-seo not available — manual SEO check applied."

Skip SEO check entirely for content types with no search intent (social posts, email newsletters).

## Step 3: Anti-AI audit

**If humanizer is available:**
- Run `/humanizer:audit` on the content
- Present pattern count by category
- Ask: "Apply fixes? (yes / no / manual)"
- Apply approved fixes

**If humanizer is not available:**
- Run the manual anti-AI checklist from `references/anti-ai-checklist.md`
- Work through these categories in order:
  1. Vocabulary: scan for the red-flag word list
  2. Structure: check for symmetric list overuse, rule-of-three in every section
  3. Punctuation: count em dashes — maximum 1 per 500 words
  4. Opening: does any section begin with a throat-clearing phrase?
  5. Endings: does any section end with generic inspiration or vague stakes?
  6. Attributions: are all statistics named and sourced?
  7. Voice: does this sound like the writer's profile adjectives, or like a content farm?

Report what was found and fixed. If everything is clean, say so explicitly — don't leave the user guessing.

## Step 4: STE compliance gate (MANDATORY — blocking)

This gate is a hard requirement. Content that fails it does not ship. The rules are in `references/ste-writing-rules.md`.

**Determine the tier** from the `platform`/`format` frontmatter. The linter resolves it automatically, so pass the platform (or format) string as the gate type.

**Run the linter on the draft file.** The draft lives in the `## Draft` body section of `PROJECT-STATE.md`. Write the current draft text to a temporary file and lint it:

```
node scripts/ste-lint.js --gate=<platform> <path-to-draft-file>
```

Example: `node scripts/ste-lint.js --gate=linkedin /tmp/draft.md`

Read the JSON report and the final `GATE (<tier>): PASS|FAIL` line. Exit code 0 means pass, 1 means fail.

**If the gate FAILS:**
1. Read each failure line. Each names the violated counter (for example `banned_word`, `marketing_adjective`, `total_per100w`, `em_dash`).
2. Fix the draft against `references/ste-writing-rules.md`. Common fixes: replace banned words with the plain word, remove marketing adjectives, split long sentences, remove semicolons, cut em dashes below the tier limit.
3. Re-run the linter. Repeat until the gate returns PASS.
4. Do not lower the threshold, do not skip the gate, and do not advance to ship with a failing gate. The gate is not advisory.

**Hard-zero rule (every tier):** `marketing_adjective` and `banned_word` must both be 0. A single instance of `seamless`, `robust`, `utilize`, `leverage`, `empower`, `comprehensive`, or any other listed word fails the gate regardless of content type.

**If Node is not available in this environment** (rare — the skill requires Node >= 14): run the Step 3 STE self-lint checklist from `references/ste-writing-rules.md` by hand instead, and record `ste_gate: manual` in Step 7. This is the only permitted fallback, and it must be stated to the user.

Record the final `total_per100w` and the PASS result — you will write them to state in Step 7.

## Step 5: Quality checklist

Manual check — these can't be automated:

**Content quality:**
- [ ] Achieves the stated goal from the discussion phase
- [ ] Follows the selected framework's structure (verify against `references/content-frameworks.md`)
- [ ] Every claim is specific — no vague superlatives, no "many companies"
- [ ] Social proof is attributed: named person, title, company
- [ ] At least one proof point is internal (case study or direct experience from the profile)
- [ ] The hook (first line or headline) is strong enough to stop the scroll

**Voice quality:**
- [ ] Matches the profile's voice adjectives
- [ ] Avoids everything on the profile's "avoid" list
- [ ] Reads like the writer, not like a report

**Platform compliance:**
- [ ] Formatting matches the platform conventions file loaded during execute
- [ ] CTAs are correct type, correctly placed, first-person copy
- [ ] Link placement follows platform rules (first comment vs. body vs. bio)
- [ ] Character/word count is within the optimal range for this platform and format

## Step 6: Apply all fixes

Compile all changes from SEO, anti-AI, the STE gate, and manual checks. Apply to the content in one pass — don't present separate revised versions. Present the final corrected content once. The STE gate must still return PASS on this final version — if any late fix re-introduced a violation, re-run the linter (Step 4) before continuing.

## Step 7: Save verified state

Update `content-writer-output/profile/PROJECT-STATE.md`:

1. Update frontmatter — set `phase: verify`, and set these fields:
   - `seo_score: [score if claude-seo ran, or "manual" if not]`
   - `ai_patterns_fixed: [count or "none found"]`
   - `ste_gate: [pass — or "manual" only if Node was unavailable]`
   - `ste_per100w: [the final total_per100w from the linter, or "manual"]`
   - `manual_check: passed`
   - `updated_at: [ISO timestamp]`

2. Write the final corrected content under the `## Verified Content` body heading (keep the `## Discussion Brief`, `## Outline`, and `## Draft` sections unchanged).

If Claude Code's memory tool is available, mirror the same values into memory as a secondary cache step (save as `[Content Writer] Current Project - Verified`).

Present the verified draft. Then instruct:
**Run `/writer:ship` or `/writer:next` to save and deliver.**
