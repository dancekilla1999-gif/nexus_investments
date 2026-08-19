# Content Writer

> A multi-platform content system with a structured workflow, SEO optimization, anti-AI auditing, and a hard Simplified Technical English gate. It supports unlimited brand profiles across Claude Code, Claude AI, ChatGPT, and Gemini.

[![Version](https://img.shields.io/badge/version-2.4.1-blue.svg)](https://github.com/sociilabs/claude-content-writer/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/claude-content-writer.svg)](https://www.npmjs.com/package/claude-content-writer)

---

## What it does

Content Writer runs content creation through five steps: discuss, plan, execute, verify, and ship. Each piece goes through this workflow instead of one prompt. The result reads like a specific person wrote it, not like AI.

### Key features

1. **Multi-profile support**: Create unlimited writer profiles for different brands, clients, or voices. Switch between them per project.
2. **Brand voice capture**: The system builds a writer profile before it writes. The output matches your tone, not a generic AI default.
3. **Simplified Technical English (STE) law**: Every sentence follows ASD-STE100 discipline: active voice, one idea per sentence, plain words, no phrasal verbs, no semicolons. This is the sentence-formation law for all content.
4. **STE compliance gate**: A linter (`scripts/ste-lint.js`) checks every draft at the verify step. A draft that fails the gate does not ship. See [How the STE gate works](#how-the-ste-gate-works).
5. **SEO integration**: Keyword targeting, meta tags, and title work happen at the verify step, not as an afterthought.
6. **Anti-AI auditing**: The verify step flags and removes about 25 markers that make AI text easy to spot.
7. **Multi-platform**: Works on Claude Code (terminal), Claude AI (web and app), ChatGPT (Custom GPT), and Gemini (Gem).

---

## Quick downloads

| Platform | Download | Setup guide |
|----------|----------|-------------|
| **Claude Code** (Terminal/IDE) | [`content-writer-v2.4.1-claude-code.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-claude-code.zip) | [Setup guide](docs/setup-claude-code.md) |
| **Claude AI** (Web/App) | [`content-writer-v2.4.1-claude-ai.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-claude-ai.zip) | [Setup guide](docs/setup-claude-ai.md) |
| **ChatGPT** (Custom GPT) | [`content-writer-v2.4.1-chatgpt.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-chatgpt.zip) | [Setup guide](docs/setup-chatgpt.md) |
| **Gemini** (Gem) | [`content-writer-v2.4.1-gemini.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-gemini.zip) | [Setup guide](docs/setup-gemini.md) |
| **Complete package** | [`content-writer-v2.4.1-complete.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-complete.zip) | |

*For all releases, see the [Releases page](https://github.com/sociilabs/claude-content-writer/releases).*

---

## Installation

### Claude Code (Terminal)

```bash
npx skills add sociilabs/claude-content-writer
```

Check the install:
```
/writer:help
```

### Claude AI (Web/Desktop app)

1. Download [`content-writer-v2.4.1-claude-ai.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-claude-ai.zip)
2. Go to [claude.ai](https://claude.ai) → Settings → Capabilities → Skills
3. Upload the extracted `claude-skill/` folder
4. Start: "Write me a LinkedIn post about..."

### ChatGPT (Custom GPT)

1. Download [`content-writer-v2.4.1-chatgpt.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-chatgpt.zip)
2. Go to [chatgpt.com](https://chatgpt.com) → Explore → Create a GPT
3. Upload `INSTRUCTIONS.md` and all files from the `knowledge/` folder
4. Start: "Write me a blog post about..."

### Gemini (Gem)

1. Download [`content-writer-v2.4.1-gemini.zip`](https://github.com/sociilabs/claude-content-writer/releases/latest/download/content-writer-v2.4.1-gemini.zip)
2. Go to [gemini.google.com](https://gemini.google.com) → Gems → New Gem
3. Paste `INSTRUCTIONS.md` into the instructions
4. Upload all files from the `knowledge/` folder
5. Start: "Create content about..."

---

## Quick start

### Claude Code

```bash
# 1. Create your first profile
/writer:profile-create My-Brand

# 2. Start content creation
/writer:discuss "blog post about SaaS pricing strategies"

# 3. Move through the steps
/writer:plan
/writer:execute
/writer:verify
/writer:ship
```

### Claude AI / ChatGPT / Gemini

State what you want:

> "Write me a LinkedIn post about remote work productivity"

The system does three things:
1. Checks for a profile, and creates one if you have none
2. Guides you through the five-step workflow
3. Writes the content to an artifact or a file

---

## How the STE gate works

Version 2.4.0 makes ASD-STE100 Simplified Technical English the writing law for every content type. The full law lives in `references/ste-writing-rules.md`.

At the verify step, the linter checks the draft:

```bash
node scripts/ste-lint.js --gate=<platform> <draft-file>
```

The linter maps the platform to a tier and applies a threshold. It exits 0 on pass and 1 on fail.

| Tier | Content types | Gate |
|------|---------------|------|
| **strict** | SEO metadata, operational email | zero violations |
| **prose** | blog, web, sales, case studies, newsletters | 3.0 or fewer violations per 100 words |
| **social** | LinkedIn, Twitter/X, Facebook, Instagram | 4.0 or fewer violations per 100 words |

Two rules apply on every tier: the marketing-adjective count and the banned-word count must both be zero. A single `seamless`, `robust`, `utilize`, or `leverage` fails the gate.

The gate keeps your brand voice. It blocks slop, not deliberate style. A draft that fails does not ship. On Claude Code, the MCP server, and the Claude AI skill, the linter runs the check. On ChatGPT and Gemini, the writer runs the same rules as a manual self-lint.

You can run the linter on any file yourself:

```bash
npm run lint:ste -- content-writer-output/blog/001-my-post.md
```

---

## Multi-profile system

**Manage many brands, clients, or voices.** Each profile holds:

- Brand identity, audience, and voice
- Content strategy and publishing preferences
- Products and services with descriptions
- CTAs for each platform
- Case studies with metrics

### Commands by platform

| Action | Claude Code | Claude AI | ChatGPT | Gemini |
|--------|-------------|-----------|---------|--------|
| **Create profile** | `/writer:profile-create Name` | "Create profile called Name" | "Create profile called Name" | "Create profile called Name" |
| **List profiles** | `/writer:profile-list` | "List my profiles" | "List my profiles" | "Show all profiles" |
| **Switch profile** | `/writer:profile-use Name` | "Use Name profile" | "Use Name profile" | "Switch to Name profile" |
| **View profile** | `/writer:profile-view Name` | "Show my Name profile" | "Show my Name profile" | "View Name profile" |
| **Edit profile** | `/writer:profile-edit Name` | "Edit Name profile" | "Edit Name profile" | "Edit Name profile" |

### Per-project profiles

**Claude AI**: Each Claude Project keeps its own profile. Project A can use "My-SaaS" while Project B uses "Personal-Blog".

**Claude Code**: One active profile per workspace. Switch with `/writer:profile-use`.

**ChatGPT/Gemini**: Upload a different profile file for each conversation.

---

## The five steps

| Step | What it does | Output |
|------|-------------|--------|
| **Discuss** | Gathers topic, platform, audience, goal, and framework | One-paragraph content brief |
| **Plan** | Builds the outline, researches SEO, maps examples | Detailed plan and keyword targets |
| **Execute** | Writes the content to the plan and the brand voice, formed to STE law | Complete draft |
| **Verify** | Runs the STE gate, the SEO check, and the anti-AI audit | Quality report with fixes |
| **Ship** | Adds metadata, writes publishing notes | Production-ready file |

Ship refuses to run unless the STE gate passed.

---

## Content types

**Long-form:**
- Blog articles (1,500 to 2,500 words)
- Landing pages (1,000 to 2,500 words)
- Case studies (1,000 to 2,000 words)
- Web pages, product pages

**Short-form:**
- LinkedIn posts
- Twitter/X (single or thread)
- Instagram captions
- Facebook posts
- Product descriptions, testimonials

**Email:**
- Newsletters
- Campaign emails
- Nurture sequences (3 to 10 emails)

**SEO assets:**
- Meta descriptions
- Title tags
- Schema markup

---

## Platform comparison

| Feature | Claude Code | Claude AI | ChatGPT | Gemini |
|---------|-------------|-----------|---------|--------|
| **Invocation** | Slash commands | Natural language | Natural language | Natural language |
| **Multi-profile** | ✅ Switch via commands | ✅ Per-project assignment | ✅ File upload | ✅ File upload |
| **State storage** | Files (`PROJECT-STATE.md`) | Claude memory | Manual save/paste | Manual save/paste |
| **Output format** | Files on disk | Artifacts | Text/code blocks | Text/code blocks |
| **Network access** | ✅ Full | ⚠️ Varies | ⚠️ Varies | ⚠️ Varies |
| **STE gate** | ✅ Linter runs | ✅ Linter runs (bundled) | ⚠️ Manual self-lint | ⚠️ Manual self-lint |
| **SEO/Humanizer** | ✅ Automatic | ⚠️ Manual fallback | ⚠️ Manual fallback | ⚠️ Manual fallback |
| **Multi-platform packages** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No (10-file limit) |

---

## Voice profile system

When you create a profile, the system does three things:

1. **URL scan** (optional): You give a blog or website URL. The system reads the tone.
2. **10-topic questionnaire**: Brand identity, audience, voice, content strategy, products, case studies, CTAs, publishing workflow, and SEO strategy.
3. **Writing samples** (optional): You paste examples for a direct voice match.

The system applies the profile to every draft. You cannot write content without a profile. This is on purpose.

---

## Directory structure

```
content-writer/
├── SKILL.md                     # Claude Code skill entry point
├── skills/
│   ├── writer/                  # Claude Code command files
│   │   ├── discuss.md
│   │   ├── plan.md
│   │   ├── execute.md
│   │   ├── verify.md
│   │   ├── ship.md
│   │   └── profile-*.md
│   ├── shared-context.md
│   ├── state-schema.md
│   └── adapters/
│       ├── claude-skill/        # Claude AI skill bundle (bundles ste-lint.js)
│       │   ├── SKILL.md
│       │   ├── references/
│       │   └── scripts/
│       ├── chatgpt/             # ChatGPT Custom GPT
│       │   ├── INSTRUCTIONS.md
│       │   └── knowledge/
│       ├── gemini/              # Gemini Gem
│       │   ├── INSTRUCTIONS.md
│       │   └── knowledge/
│       └── mcp-server/          # MCP server for headless use
├── references/                  # Canonical reference docs
│   ├── ste-writing-rules.md     # The STE writing law and gate contract
│   ├── content-frameworks.md
│   ├── anti-ai-checklist.md
│   ├── seo-meta-conventions.md
│   └── ...
├── docs/                        # Setup guides and checklists
│   ├── setup-claude-code.md
│   ├── setup-claude-ai.md
│   ├── setup-chatgpt.md
│   ├── setup-gemini.md
│   ├── setup-headless.md
│   └── checklists/
└── scripts/                     # Build and utility scripts
    ├── ste-lint.js              # The STE compliance linter
    ├── postinstall.js
    ├── verify-writer-commands.js
    ├── build-adapter-knowledge.js
    └── ship.js
```

---

## Development

### Building adapter files

After you change a reference file, rebuild the adapters:

```bash
npm run build:adapters
```

This copies the canonical references to each adapter folder. For Gemini, it merges the STE law into `anti-ai-checklist.md` to stay within the 10-source limit.

### Verification

Run the checks:

```bash
npm run verify
```

This validates the state schema, checks the migration, and self-tests the STE linter. The release script runs it first, so a broken linter blocks the release.

### The STE linter

Run the linter on any draft or file:

```bash
npm run lint:ste -- <file>
```

Add `--gate=<platform>` to run the tiered gate and get an exit code:

```bash
node scripts/ste-lint.js --gate=linkedin draft.md
```

### Releasing

The ship script handles the version, the build, and the packaging:

```bash
# Patch release (2.4.1 -> 2.4.2)
npm run ship patch

# Minor release (2.4.1 -> 2.5.0)
npm run ship minor

# Major release (2.4.1 -> 3.0.0)
npm run ship major

# With npm publish
npm run ship minor -- --publish
```

The script does six things:
1. Updates the `package.json` version
2. Updates `CHANGELOG.md`
3. Builds the adapter files
4. Creates the distribution zips in `dist/`
5. Commits and tags
6. Publishes to npm if you pass `--publish`

---

## Documentation

- [Claude Code setup](docs/setup-claude-code.md): Terminal and IDE install
- [Claude AI setup](docs/setup-claude-ai.md): Web and desktop app with the multi-profile workflow
- [ChatGPT setup](docs/setup-chatgpt.md): Custom GPT configuration
- [Gemini setup](docs/setup-gemini.md): Gem configuration
- [Headless / MCP setup](docs/setup-headless.md): MCP server for scripts and automation
- [Feature comparison](docs/feature-degradation-matrix.md): Platform capabilities

### Manual test checklists

- [Claude AI manual test](docs/checklists/claude-ai-manual-test.md)
- [ChatGPT manual test](docs/checklists/chatgpt-manual-test.md)
- [Gemini manual test](docs/checklists/gemini-manual-test.md)

---

## Dependencies

**Required:** None. The system works on its own.

**Better with:**
- [`claude-seo`](https://github.com/YourUsername/claude-seo): SEO analysis
- [`humanizer`](https://github.com/YourUsername/humanizer): AI pattern detection

When these tools are present, the verify step runs the checks for you. When they are absent, the system gives you manual checklists. The STE gate is built in and always runs.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the release history.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/sociilabs/claude-content-writer/issues)
- **Discussions:** [GitHub Discussions](https://github.com/sociilabs/claude-content-writer/discussions)
- **Email:** support@sociilabs.com

---

## Who it is for

- **Founders and operators** who produce content often without a dedicated writer
- **Developers who build content pipelines** and want a repeatable, auditable process
- **Agencies and consultants** who manage content for many brands with different voices
- **Multi-platform users** who want one workflow across Claude, ChatGPT, and Gemini

If you write content once a week and have no process problem, this is too much. If you produce content at volume and want steady quality without hand-checking every draft, this is for you.
