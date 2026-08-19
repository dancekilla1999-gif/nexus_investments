# Setup Guide: Claude Code

Install and run Content Writer on Claude Code, the original platform.

---

## Prerequisites

- Claude Code installed and authenticated (`claude` CLI command available)
- Node.js 14+ and npm installed

---

## Install

Run the install command:

```bash
npx skills add sociilabs/claude-content-writer
```

This command:
1. Downloads the content-writer package from npm
2. Runs the postinstall script, which copies skill files to `~/.claude/skills/`
3. Sets up the `/writer:*` command namespace

---

## Verify Installation

After you install, check that the skill is available:

```
/writer:help
```

You see a help message that lists all available commands.

---

## Quick Start

### 1. Create your voice profile (required before first use)

```
/writer:profile-create
```

This runs a 10-topic questionnaire. It covers brand identity, audience, voice and tone, products, case studies, and more. You can also give a URL to your existing content for automatic tone detection.

### 2. Start a content project

```
/writer:discuss "blog post about SaaS pricing strategies"
```

### 3. Move through the phases

```
/writer:plan
/writer:execute
/writer:verify
/writer:ship
```

Or use `/writer:next` to advance to the next phase.

---

## Migration Note for Existing Users

If you have an existing Content Writer installation from before v2.2.0, the system stored your project state and profile data with Claude Code's memory tool. As of v2.2.0, state storage uses the portable file-based format at:

```
content-writer-output/profile/PROJECT-STATE.md
```

**No manual action is required.** The next time you run any `/writer:*` command after you update, the system does a one-time upgrade:

1. Checks for legacy memory entries
2. Moves them to the new file-based format
3. Keeps using the file format from then on

The system keeps your existing profiles and in-progress projects. You can access them right after the automatic migration.

---

## File Storage Location

Content Writer stores all data on your machine, in your project directory:

```
content-writer-output/
├── profile/
│   ├── PROFILE.md
│   ├── PRODUCTS.md
│   ├── CTAS.md
│   ├── CASE-STUDIES.md
│   └── PROJECT-STATE.md
├── blog/
├── linkedin/
├── facebook/
├── instagram/
├── twitter/
├── email/
├── sales/
├── seo/
└── packages/
```

All files are plain markdown with YAML frontmatter. They are portable and easy to read.

---

## The STE Writing Gate (v2.4.0)

v2.4.0 adds ASD-STE100 Simplified Technical English as the writing law for all content. The law lives in `references/ste-writing-rules.md`. The verify step runs a linter (`scripts/ste-lint.js`) that checks each draft against the law.

The linter uses three tiers:

- **strict**: SEO metadata and operational email. Zero violations.
- **prose**: blog, web, sales, case studies, and newsletters. 3.0 or fewer violations per 100 words.
- **social**: LinkedIn, Twitter/X, Facebook, and Instagram. 4.0 or fewer violations per 100 words.

On every tier, the marketing-adjective count and the banned-word count must both be zero. A draft that fails the gate does not ship.

The `/writer:verify` command runs the linter for you:

```bash
node scripts/ste-lint.js --gate=<platform> <draft>
```

To run the linter by hand, use:

```bash
npm run lint:ste -- <file>
```

The project state adds two fields for this gate: `ste_gate` and `ste_per100w`.

---

## Troubleshooting

**"Profile not found"**
Run `/writer:profile-create`. You must create the profile before generation.

**"SEO check fails"**
Install it by hand: `npx skills add AgriciDaniel/claude-seo`

**"Anti-AI audit fails"**
Install it by hand: `npx skills add blader/humanizer`

**Output does not match your tone**
Update your profile with more writing samples: `/writer:profile-edit`. Paste 2 to 3 paragraphs that you wrote and that show how you sound.

---

## Verify It Worked

Run all five workflow commands from start to finish:

1. `/writer:profile-create`: Complete the profile questionnaire
2. `/writer:discuss "test blog post about AI tools"`: Start a test project
3. `/writer:plan`: Review and confirm the outline
4. `/writer:execute`: Generate the draft
5. `/writer:verify`: Run SEO, anti-AI, and STE checks
6. `/writer:ship`: Save the final output

If all six commands finish without errors, your Claude Code adapter works correctly.

For manual testing steps, see the test checklist at `docs/checklists/claude-code-manual-test.md` when it is available.
