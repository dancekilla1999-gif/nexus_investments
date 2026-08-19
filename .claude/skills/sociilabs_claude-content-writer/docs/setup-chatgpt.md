# Setup Guide: ChatGPT (Custom GPT)

Use Content Writer on ChatGPT. Create a Custom GPT with bundled knowledge files.

---

## Prerequisites

- ChatGPT Plus, Team, or Enterprise subscription (Custom GPTs need a paid plan)
- Access to the GPT Builder interface

---

## Overview

On ChatGPT, Content Writer runs as a **Custom GPT**. A Custom GPT is a version of ChatGPT with custom instructions and knowledge files. You create it once in the GPT Builder. Then you use it whenever you need content.

---

## Installation Steps

### Step 1: Open GPT Builder

1. Go to [chat.openai.com](https://chat.openai.com) and sign in
2. Click **"Explore GPTs"** in the sidebar
3. Click **"Create"** (or "My GPTs" → "Create a GPT")

### Step 2: Paste the Instructions

The instructions file has this path:

```
skills/adapters/chatgpt/INSTRUCTIONS.md
```

**In the GPT Builder:**

1. In the **"Instructions"** section (or Configure tab), paste the full contents of `INSTRUCTIONS.md`
2. The instructions define:
   - The five-phase workflow (Discuss → Plan → Execute → Verify → Ship)
   - Profile-first enforcement
   - State-carrying rules
   - Knowledge file references

**Character limit note:** ChatGPT instructions have an approximate 8,000 character limit. The `INSTRUCTIONS.md` file fits within this limit (actual: about 4,400 characters).

### Step 3: Upload Knowledge Files

The knowledge files have this path:

```
skills/adapters/chatgpt/knowledge/
```

**Files to upload (14 files):**

1. `anti-ai-checklist.md`: Anti-AI pattern auditing checklist
2. `content-frameworks.md`: Copywriting frameworks (PAS, AIDA, BAB, LEMA, etc.)
3. `content-packages.md`: Multi-platform content package guidance
4. `email-content-conventions.md`: Email content best practices
5. `facebook-conventions.md`: Facebook-specific formatting
6. `instagram-conventions.md`: Instagram caption conventions
7. `profile-management.md`: Profile creation questionnaire
8. `research-workflow.md`: URL analysis and research methods
9. `sales-content-conventions.md`: Sales copy conventions
10. `seo-meta-conventions.md`: SEO metadata rules
11. `state-schema.md`: Complete state document schema
12. `twitter-conventions.md`: Twitter/X content conventions
13. `web-content-conventions.md`: Landing and product page conventions

**In the GPT Builder:**

1. Go to the **"Knowledge"** section (or Configure → Knowledge)
2. Click **"Upload Files"**
3. Select all 14 files from `skills/adapters/chatgpt/knowledge/`
4. Wait for the uploads to finish. ChatGPT scans each file for safety.

**Limits:** ChatGPT allows up to 20 knowledge files per GPT and 512MB per file. The 14 files fit well within these limits.

### Step 4: Configure GPT Details

**Name:** `Content Writer`

**Description:** 
```
Professional content generation system. Creates blog articles, social posts, email content, and SEO metadata that sounds human, not AI-generated. Uses a five-phase workflow with built-in brand voice profiles.
```

**Conversation Starters** (optional but helpful):
- "Write me a blog post about..."
- "Create a LinkedIn post about..."
- "Start a new content project"
- "Create my writer profile"

### Step 5: Save and Publish

1. Click **"Save"** (top right)
2. Choose visibility:
   - **Only me**: Private to your account
   - **Anyone with a link**: Shareable URL
   - **Public**: Listed in the GPT Store (optional)
3. Click **"Confirm"**

Your Custom GPT is now ready to use.

---

## Using Content Writer

### Start a Project

Open your Content Writer GPT and describe what you want:

> "Write me a LinkedIn post about the future of remote work"

Or start with profile creation:

> "Create my writer profile"

### The Five Phases

The GPT guides you through five phases:

1. **Discuss**: Gather topic, platform, audience, and goals
2. **Plan**: Build the outline and SEO strategy
3. **Execute**: Write the draft
4. **Verify**: Run SEO, STE, and anti-AI checks
5. **Ship**: Present the final content with publishing notes

### State Management (Critical)

**ChatGPT cannot write back to knowledge files.** At the end of every phase, the GPT outputs a complete `PROJECT-STATE.md` as a code block. You must do these steps:

1. **Copy** the entire code block
2. **Save** it to a file named `PROJECT-STATE.md`
3. **Paste** it back word for word at the start of your next session

**Example at phase end:**

```markdown
---
phase: discuss
platform: linkedin
format: post
topic: future of remote work
audience: tech professionals
awareness_stage: problem-aware
goal: engagement
framework: PAS
length: 150
cta: comment
research_urls: 
key_points: flexibility, productivity, tools
ste_gate: manual
updated_at: 2026-07-04T12:00:00Z
---

## Discussion Brief

[Content here...]

## Outline

## Draft

## Verified Content
```

**Never say "I saved your state".** The GPT cannot save to knowledge files. Always save and re-paste the state document yourself.

### Per-GPT Memory in ChatGPT (Optional)

ChatGPT offers a per-GPT "memory" feature. This feature can help with state continuity:

- Memory is **optional**. Users or org admins can turn it off.
- Memory is **best-effort**. It is not a durable store.
- Builders can turn it on for their GPTs.

**Do not depend on memory as the only state store.** Always use the PROJECT-STATE.md save and re-paste method. Memory is only a convenience that smooths continuity within a session.

---

## Profile Management

Before you generate content, you need a writer profile. If you do not have one, the GPT runs the 10-topic questionnaire from `profile-management.md`:

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

**Save your profile:** The GPT outputs the finished profile as markdown files. Save these files and paste them at the start of future sessions.

---

## Capabilities vs. Claude Code

| Feature | ChatGPT Custom GPT | Claude Code |
|---------|-------------------|-------------|
| **Invocation** | Start a conversation with the GPT | Slash commands (`/writer:*`) |
| **State persistence** | Manual save and re-paste of PROJECT-STATE.md | Automatic file storage |
| **Profile storage** | Manual file management | Automatic file storage |
| **URL fetching** | Paste article text (no network fetch) | Full network access |
| **SEO and humanizer integration** | Manual checklist (through `anti-ai-checklist.md` and `seo-meta-conventions.md`) | Automatic skill invocation |
| **Multi-platform packages** | Available (through `content-packages.md`) | Available |
| **Auto-update check** | Not available | Available |

---

## Network Access

ChatGPT Custom GPTs have **no network access** to fetch URLs. If a step needs a URL fetch (for example, a scan of a blog for tone detection), the GPT asks you to paste the article text or 2 to 3 representative paragraphs.

---

## Knowledge File Reference

The GPT has access to these 14 knowledge files:

| File | Purpose |
|------|---------|
| `content-frameworks.md` | Framework selection (PAS, AIDA, BAB, LEMA, SCQA, 4-Point, CONVERT) |
| `anti-ai-checklist.md` | Patterns to avoid during writing and verification |
| `seo-meta-conventions.md` | SEO metadata rules |
| `web-content-conventions.md` | Landing pages, product pages, web pages |
| `email-content-conventions.md` | Newsletters, campaigns, sequences |
| `twitter-conventions.md` | Twitter/X tweets and threads |
| `facebook-conventions.md` | Facebook posts and pages |
| `instagram-conventions.md` | Instagram captions |
| `sales-content-conventions.md` | Sales pages, funnels, case studies, testimonials |
| `profile-management.md` | Profile creation, rotation lifecycle |
| `research-workflow.md` | URL analysis and research inputs |
| `state-schema.md` | Complete schema for PROJECT-STATE.md |
| `content-packages.md` | Multi-platform content package guidance |

---

## The STE Gate (v2.4.0)

v2.4.0 makes ASD-STE100 Simplified Technical English the writing law for all content. The verify step checks each draft against this law. The check uses three tiers:

- **strict**: SEO metadata and operational email. Zero violations.
- **prose**: blog, web, sales, case studies, and newsletters. 3.0 or fewer violations per 100 words.
- **social**: LinkedIn, Twitter/X, Facebook, and Instagram. 4.0 or fewer violations per 100 words.

The marketing-adjective count and the banned-word count must be zero on every tier. A draft that fails the gate does not ship.

ChatGPT cannot run the Node linter. So the STE gate is a manual self-lint. Check the draft by hand against the rules in the `ste-writing-rules.md` knowledge file before you ship.

---

## Verify It Worked

After you create your Custom GPT:

1. Open the GPT from "My GPTs" or the sidebar
2. Type: "Write me a LinkedIn post about productivity hacks"
3. Confirm the GPT asks about your profile (or offers to create one)
4. Complete the profile creation flow
5. Work through all five phases (Discuss → Plan → Execute → Verify → Ship)
6. At the verify step, run a manual STE self-lint against the `ste-writing-rules.md` rules. Fix any violation before you ship.
7. Confirm the final output has these parts:
   - YAML frontmatter with all fields
   - Correct platform-specific formatting
   - Publishing notes
8. Save the PROJECT-STATE.md at phase end. Confirm it has all 28 frontmatter fields.
9. Start a fresh conversation, paste the saved state, and confirm the GPT continues from the correct phase

For detailed manual testing steps, see `docs/checklists/chatgpt-manual-test.md`.

---

## Troubleshooting

**"I do not see my GPT"**
- Check "My GPTs" in the sidebar
- Confirm you saved the GPT (not just created a draft)

**"Instructions are too long"**
- The INSTRUCTIONS.md file is about 4,400 characters, well under the 8,000 limit
- If you added custom instructions, trim them to fit

**"Knowledge files not loading"**
- Confirm all 14 files uploaded without error (check for upload errors)
- Remove and re-add the knowledge files
- Check that each file is under 512MB

**"State not persisting between sessions"**
- This is expected. You must save and re-paste PROJECT-STATE.md by hand.
- The optional memory feature in ChatGPT is not a substitute for manual state management
