# Setup Guide: Google Gemini (Gem)

Run Content Writer on Google Gemini. You create a Gem with bundled knowledge sources.

This guide covers Content Writer v2.4.0.

---

## Prerequisites

- A Google account with access to Gemini (gemini.google.com)
- A Gemini Advanced subscription for Gem creation

---

## Overview

On Google Gemini, Content Writer runs as a **Gem**. A Gem is a custom version of Gemini. It has instructions and up to 10 knowledge sources. Gems are the Google version of the ChatGPT Custom GPT.

**Important limit:** A Gemini Gem allows only 10 knowledge sources. The Content Writer Gem merges the Twitter/X, Facebook, and Instagram conventions into one `social-conventions.md` file. This keeps the Gem inside the limit. The Gem also excludes `content-packages.md` for multi-platform content packages. See the Feature Degradation section below.

---

## Installation Steps

### Step 1: Verify the Character Limit

**Before you use these instructions, confirm that the full text fits inside the character limit of the Gem builder UI in Gemini.**

Gemini publishes no official instruction-length limit. Community reports suggest a range of about 10,000 to 30,000 characters. Confirm the limit before you finalize the Gem:

1. Go to [gemini.google.com](https://gemini.google.com)
2. Click **"Gem Manager"** or **"Gems"**
3. Create a new Gem
4. Paste the instructions from Step 2
5. Confirm that the UI accepts the full text and does not truncate it

### Step 2: Create a New Gem

1. Go to [gemini.google.com](https://gemini.google.com)
2. Click **"Gems"** in the left sidebar
3. Click **"New Gem"** or **"Create Gem"**
4. Name the Gem: `Content Writer`

### Step 3: Paste the Instructions

The instructions file is here:

```
skills/adapters/gemini/INSTRUCTIONS.md
```

**In the Gem builder:**

1. Open `skills/adapters/gemini/INSTRUCTIONS.md`
2. Copy the full contents
3. Paste the text into the **"Instructions"** field in the Gem builder
4. The instructions set:
   - The five-phase workflow (Discuss, Plan, Execute, Verify, Ship)
   - Profile-first enforcement
   - State-carrying rules
   - Knowledge source references
   - The feature degradation notice for the content-packages exclusion

### Step 4: Upload Knowledge Sources

The knowledge files are here:

```
skills/adapters/gemini/knowledge/
```

**Files to upload (10 files):**

1. `anti-ai-checklist.md`: Anti-AI pattern auditing checklist
2. `content-frameworks.md`: Copywriting frameworks (PAS, AIDA, BAB, LEMA, and more)
3. `email-content-conventions.md`: Email content best practices
4. `profile-management.md`: Profile creation questionnaire
5. `research-workflow.md`: URL analysis and research methods
6. `sales-content-conventions.md`: Sales copy conventions
7. `seo-meta-conventions.md`: SEO metadata rules
8. `social-conventions.md`: **Merged file** for Twitter/X, Facebook, and Instagram conventions. All three platforms sit in one file.
9. `state-schema.md`: The full state document schema
10. `web-content-conventions.md`: Landing and product page conventions

**In the Gem builder:**

1. Go to the **"Knowledge"** or **"Sources"** section
2. Click **"Add Knowledge Source"** or **"Upload"**
3. Upload all 10 files from `skills/adapters/gemini/knowledge/`
4. Wait for the processing to finish

**Important:** This Gem uses exactly 10 knowledge sources. This is the maximum. The three social platforms merge into `social-conventions.md`. The multi-platform content packages file (`content-packages.md`) stays out.

### Step 5: Save the Gem

1. Review the instructions and the knowledge sources
2. Click **"Save"** or **"Create"**
3. The Gem is now available in the Gemini interface

---

## Using Content Writer

### Start a Project

Open the Content Writer Gem. Describe what you want:

> "Write me a LinkedIn post about startup funding"

Or start with profile creation:

> "Create my writer profile"

### The Five Phases

The Gem guides you through:

1. **Discuss**: Gather topic, platform, audience, and goals
2. **Plan**: Build the outline and the SEO strategy
3. **Execute**: Write the draft
4. **Verify**: Run the SEO, anti-AI, and STE checks
5. **Ship**: Present the final content with publishing notes

### State Management (Critical)

**A Gemini Gem cannot write back to knowledge sources.** At the end of each phase, the Gem outputs a full `PROJECT-STATE.md` as a code block. You must:

1. **Copy** the full code block
2. **Save** it to a file named `PROJECT-STATE.md`
3. **Paste** it back word for word at the start of the next session

**Example at phase end:**

```markdown
---
phase: discuss
platform: linkedin
format: post
topic: startup funding
audience: entrepreneurs
awareness_stage: problem-aware
goal: leads
framework: PAS
length: 200
cta: newsletter_signup
research_urls: 
key_points: bootstrapping, VC, angel
ste_gate: manual
updated_at: 2026-07-04T12:00:00Z
---

## Discussion Brief

[Content here...]

## Outline

## Draft

## Verified Content
```

**Never say "I saved your state".** The Gem cannot save to knowledge sources. You save and re-paste the state document yourself.

---

## Feature Degradation: Content Packages Not Available

The 10-knowledge-source limit forces one cut. This Gem **excludes** `content-packages.md`. That file gives guidance for coordinated multi-platform content packages.

**If a user asks for a multi-platform content package,** the Gem tells them:

> "Multi-platform content packaging is not available in this Gemini Gem due to the 10-source knowledge limit. This capability is available in the Claude Code, Claude.ai, or ChatGPT adapters instead."

**Workaround:** Use the Claude Code, Claude.ai, or ChatGPT adapter for multi-platform content packaging.

---

## Profile Management

You need a writer profile before you generate content. If you do not have one, the Gem runs the 10-topic questionnaire from `profile-management.md`:

1. Brand identity
2. Industry and market
3. Target audience
4. Voice and tone
5. Content strategy
6. Products and services
7. Case studies
8. CTAs
9. Publishing workflow
10. SEO strategy

**Save your profile:** The Gem outputs the finished profile as markdown files. Save these files. Paste them at the start of future sessions.

---

## Capabilities vs. Claude Code

| Feature | Gemini Gem | Claude Code |
|---------|------------|-------------|
| **Invocation** | Start a chat with the Gem | Slash commands (`/writer:*`) |
| **State persistence** | Manual save and re-paste of PROJECT-STATE.md | Automatic file storage |
| **Profile storage** | Manual file management | Automatic file storage |
| **URL fetching** | Paste article text (no network fetch) | Full network access |
| **SEO and humanizer integration** | Manual checklist (via `anti-ai-checklist.md` and `seo-meta-conventions.md`) | Automatic skill invocation |
| **STE writing law** | Manual self-lint (no Node linter) | Automatic linter gate |
| **Multi-platform content packages** | **Not available** (10-source limit) | Available |
| **Social platform conventions** | Merged into one file | Separate files |
| **Auto-update check** | Not available | Available |

---

## Network Access

A Gemini Gem has **no network access** to fetch URLs. If a step needs a URL fetch (for example, a scan of a blog for tone detection), the Gem asks you to paste the article text or 2 to 3 representative paragraphs directly.

---

## Knowledge Source Reference

The Gem has access to exactly 10 knowledge sources:

| File | Purpose |
|------|---------|
| `content-frameworks.md` | Framework selection (PAS, AIDA, BAB, LEMA, SCQA, 4-Point, CONVERT) |
| `anti-ai-checklist.md` | Patterns to avoid during writing and verification |
| `seo-meta-conventions.md` | SEO metadata rules |
| `web-content-conventions.md` | Landing pages, product pages, web pages |
| `email-content-conventions.md` | Newsletters, campaigns, sequences |
| `social-conventions.md` | **Merged:** Twitter/X, Facebook, and Instagram conventions (all three) |
| `sales-content-conventions.md` | Sales pages, funnels, case studies, testimonials |
| `profile-management.md` | Profile creation, rotation lifecycle |
| `research-workflow.md` | URL analysis and research inputs |
| `state-schema.md` | Full schema for PROJECT-STATE.md |

**Not included:** `content-packages.md` (multi-platform packages), out because of the 10-source limit.

**STE writing law:** The 10-source limit leaves no room for a separate STE file. So the STE law appends into `anti-ai-checklist.md` under a heading named "STE Writing Rules (appended)". You do not upload a separate STE source.

---

## The STE Writing Law (v2.4.0)

Content Writer v2.4.0 makes ASD-STE100 Simplified Technical English the writing law for all content. The Gem checks this law at the verify step.

The Gem cannot run the Node linter. So the STE gate is a **manual self-lint**. You read the draft against the STE rules and count the violations yourself. Record `ste_gate: manual` in the state block.

The law sets three tiers:

- **strict** (SEO metadata, operational email): zero violations
- **prose** (blog, web, sales, case studies, newsletters): 3.0 or fewer violations per 100 words
- **social** (LinkedIn, Twitter/X, Facebook, Instagram): 4.0 or fewer violations per 100 words

The marketing-adjective count and the banned-word count must be zero on every tier. A draft that fails does not ship.

---

## Verify It Worked

After you create the Gem:

1. Open the Gem from the Gemini sidebar
2. Type: "Write me a LinkedIn post about AI tools"
3. Confirm that the Gem asks about your profile, or offers to create one
4. Finish the profile creation flow
5. Work through all five phases (Discuss, Plan, Execute, Verify, Ship)
6. Confirm that the final output has:
   - YAML frontmatter with all fields
   - Correct platform-specific formatting
   - Publishing notes
7. At the verify step, confirm that the Gem runs the manual STE self-lint. The social tier for a LinkedIn post allows 4.0 or fewer violations per 100 words. The marketing-adjective and banned-word counts must be zero. A draft that fails does not ship.
8. Save the PROJECT-STATE.md at phase end. Confirm that it has all frontmatter fields, and that `ste_gate` reads `manual`.
9. Start a fresh conversation. Paste the saved state. Confirm that the Gem continues from the correct phase.
10. **Test the content-packages exclusion:** Ask for a "multi-platform content package". Confirm that the Gem tells you this capability is not available, and that it suggests the other adapters.

For detailed manual testing steps, see `docs/checklists/gemini-manual-test.md`.

---

## Troubleshooting

**"I cannot create a Gem"**
- Confirm that you have a Google account with Gemini access
- Gem creation may need a Gemini Advanced subscription
- Check regional availability. Gems may not be available in all regions.

**"Instructions are too long"**
- Confirm the character count before you paste
- If the UI truncates the text, you may need a shorter instructions file. Check for updates to the adapter.

**"Knowledge sources not loading"**
- Confirm that you uploaded exactly 10 files (the maximum)
- Check the file sizes. Each file should stay well under any limit.
- Remove and re-add the knowledge sources

**"State not persisting between sessions"**
- This is expected. You must save and re-paste PROJECT-STATE.md yourself.
- A Gemini Gem cannot write back to knowledge sources

**"Content packages not available"**
- This is by design because of the 10-source limit
- Use the Claude Code, Claude.ai, or ChatGPT adapter for multi-platform content packaging
