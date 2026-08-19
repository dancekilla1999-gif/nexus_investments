# Feature Degradation Matrix

This page compares platform capabilities. It shows what each adapter gains or loses against Claude Code.

---

## Summary

Content Writer runs on five platforms. Each platform has different capabilities. This matrix shows which features work by default. It also shows which features have a fallback and which features do not work on each platform.

| Capability | Claude Code | Claude.ai/API | ChatGPT | Gemini | Headless/MCP |
|------------|:-----------:|:-------------:|:-------:|:------:|:------------:|
| **URL tone scanning** | Native | Degraded | Fallback | Fallback | Unavailable |
| **Auto-update check** | Native | Unavailable | Unavailable | Unavailable | Unavailable |
| **SEO integration** | Native | Fallback | Fallback | Fallback | Fallback |
| **Anti-AI integration** | Native | Fallback | Fallback | Fallback | Fallback |
| **STE compliance gate** | Native | Degraded | Fallback | Fallback | Native |
| **Multi-platform content packages** | Native | Native | Native | **Unavailable** | Native |
| **File persistence** | Native | Degraded | Degraded | Degraded | Native |

The STE compliance gate is built in from v2.4.0. It always applies. It does not become optional on any platform.

---

## Detailed Breakdown

### 1. URL Tone Scanning

Profile creation can scan a blog or content URL. It finds the existing tone and style automatically.

| Platform | Status | Behavior |
|----------|--------|----------|
| **Claude Code** | Native | Full network access. The tool fetches URLs automatically. |
| **Claude.ai/API** | Degraded | Container network access varies. If the network fails, paste the article text. |
| **ChatGPT** | Fallback | No network access. Paste 2 to 3 sample paragraphs. |
| **Gemini** | Fallback | No network access. Paste 2 to 3 sample paragraphs. |
| **Headless/MCP** | Unavailable | No network access in the server. The caller must fetch and provide the content. |

**What to do:** On a degraded platform or an unavailable platform, paste 2 to 3 paragraphs of your writing when the tool prompts you during profile creation.

---

### 2. Auto-Update Check

This check reads the npm registry one time per session. It tells you about new versions.

| Platform | Status | Behavior |
|----------|--------|----------|
| **Claude Code** | Native | Runs `npm view claude-content-writer version` on the first command. |
| **Claude.ai/API** | Unavailable | No npm access. You get no update notification. |
| **ChatGPT** | Unavailable | No npm access. You get no update notification. |
| **Gemini** | Unavailable | No npm access. You get no update notification. |
| **Headless/MCP** | Unavailable | No npm access. Check for updates in your automation. |

**What to do:** On other platforms, check for updates by hand. Use GitHub releases or npm:
```bash
npm view claude-content-writer version
```

---

### 3. SEO Integration

The claude-seo skill runs SEO optimization automatically. It covers keyword analysis, meta tags, and title scoring.

| Platform | Status | Behavior |
|----------|--------|----------|
| **Claude Code** | Native | The skill runs automatically if you install claude-seo. |
| **Claude.ai/API** | Fallback | Use the manual SEO checklist in `seo-meta-conventions.md`. |
| **ChatGPT** | Fallback | Use the manual SEO checklist in the `seo-meta-conventions.md` knowledge file. |
| **Gemini** | Fallback | Use the manual SEO checklist in the `seo-meta-conventions.md` knowledge source. |
| **Headless/MCP** | Fallback | Use the manual SEO checklist. The caller runs it or uses an external SEO tool. |

**Fallback details:** The manual checklist covers:
- Primary keyword in the title, the H1, and the first 100 words
- Meta description present and under 160 characters
- URL slug contains the primary keyword
- Image alt tags describe the image
- Balance of internal links and external links

---

### 4. Anti-AI Integration

The humanizer skill finds and removes AI writing patterns automatically.

| Platform | Status | Behavior |
|----------|--------|----------|
| **Claude Code** | Native | The skill runs automatically if you install humanizer. |
| **Claude.ai/API** | Fallback | Run a manual audit with the `anti-ai-checklist.md` patterns. |
| **ChatGPT** | Fallback | Run a manual audit with the `anti-ai-checklist.md` knowledge file. |
| **Gemini** | Fallback | Run a manual audit with the `anti-ai-checklist.md` knowledge source. |
| **Headless/MCP** | Fallback | Run a manual audit. The caller runs it or uses an external tool. |

**Fallback details:** The manual checklist covers about 25 patterns:
- Overused words: `leverage`, `seamless`, `robust`, `delve`, `realm`, `foster`, `crucial`
- Too many em dashes
- Rule of three
- Throat-clearing openers
- Generic conclusions
- Vague attributions
- Parallel list structures
- Negative parallelism

---

### 5. STE Compliance Gate

The STE compliance gate checks each draft against the ASD-STE100 writing law in `references/ste-writing-rules.md`. The `scripts/ste-lint.js` linter counts violations. It runs the gate for the strict, prose, and social tiers.

| Platform | Status | Behavior |
|----------|--------|----------|
| **Claude Code** | Native | The linter runs automatically during verify. |
| **Claude.ai/API** | Degraded | The skill bundles the linter. It runs when code execution is available. If not, run a manual self-lint. |
| **ChatGPT** | Fallback | Run a manual self-lint against the writing law. |
| **Gemini** | Fallback | Run a manual self-lint. The STE law is appended into `anti-ai-checklist.md` because of the 10-source limit. |
| **Headless/MCP** | Native | The linter runs automatically in the pipeline. |

**What to do:** The gate blocks ship until it passes. On every tier the `marketing_adjective` count must be zero and the `banned_word` count must be zero. The prose tier caps `total_per100w` at 3.0. The social tier caps it at 4.0. The strict tier requires a total of zero.

Unlike SEO integration and anti-AI integration, this gate does not degrade into an optional step. It is built in and it always applies.

---

### 6. Multi-Platform Content Packages

This feature coordinates content across many platforms and releases it together. For example: a blog post, a LinkedIn summary, and a Twitter thread.

| Platform | Status | Behavior |
|----------|--------|----------|
| **Claude Code** | Native | Full `content-packages.md` guidance. |
| **Claude.ai/API** | Native | Full `content-packages.md` guidance. |
| **ChatGPT** | Native | Full `content-packages.md` knowledge file. |
| **Gemini** | **Unavailable** | Not available. The 10-knowledge-source limit excludes it. |
| **Headless/MCP** | Native | Full `content-packages.md` guidance. |

**What to do on Gemini:** Use the Claude Code, Claude.ai, or ChatGPT adapter for multi-platform content packages. The Gem tells users this:

> "Multi-platform content packaging is not available in this Gemini Gem due to the 10-source knowledge limit. This capability is available in the Claude Code, Claude.ai, or ChatGPT adapters instead."

**Documentation reference:** See `skills/adapters/gemini/INSTRUCTIONS.md` line 53 to 57 for the exact exclusion statement. It matches this matrix.

---

### 7. File Persistence

The tool reads and writes PROJECT-STATE.md and profile files automatically.

| Platform | Status | Behavior |
|----------|--------|----------|
| **Claude Code** | Native | The tool stores files automatically in `content-writer-output/`. |
| **Claude.ai/API** | Degraded | The container has a real filesystem, but it is ephemeral. Re-upload the state unless you reuse the same container ID. |
| **ChatGPT** | Degraded | No filesystem access. Save and re-paste PROJECT-STATE.md by hand. |
| **Gemini** | Degraded | No filesystem access. Save and re-paste PROJECT-STATE.md by hand. |
| **Headless/MCP** | Native | The tool stores files automatically in `content-writer-output/`. |

**What to do on a degraded platform:**

At the end of each phase, the adapter outputs a full `PROJECT-STATE.md` as a code block:

1. **Copy** the full code block
2. **Save** it to a file named `PROJECT-STATE.md`
3. **Paste** it back word for word at the start of your next session

This applies to ChatGPT, Gemini, and API use without container reuse.

---

## Quick Reference: Picking a Platform

| If you need... | Use... |
|----------------|--------|
| **Full automation** | Claude Code or Headless/MCP |
| **Web chat interface** | Claude.ai, ChatGPT, or Gemini |
| **URL scanning for tone** | Claude Code (most reliable) |
| **Multi-platform content packages** | Claude Code, Claude.ai, ChatGPT, or Headless/MCP (NOT Gemini) |
| **Zero setup** | Claude.ai (Skill already uploaded) or ChatGPT (Custom GPT created one time) |
| **Automation and n8n pipelines** | Headless/MCP server |
| **Manual SEO and anti-AI acceptable** | Any platform (all have fallback checklists) |

---

## Platform-Specific Notes

### Claude Code
- **Best for:** Power users, developers, and content pipelines
- **Key advantage:** Full network access, automatic file persistence, and the skill ecosystem
- **Limitation:** Needs the Claude Code CLI installation

### Claude.ai / Claude API
- **Best for:** Web-based use with some automation needs
- **Key advantage:** Real filesystem in the code-execution container
- **Limitation:** The container is ephemeral. State needs re-upload or container reuse.

### ChatGPT
- **Best for:** ChatGPT Plus and Team users who want a Custom GPT
- **Key advantage:** Familiar interface and 14 knowledge files (no content limits)
- **Limitation:** No network access and manual state management

### Gemini
- **Best for:** Google ecosystem users
- **Key advantage:** Works with Google services
- **Limitation:** The 10-knowledge-source limit excludes the content-packages capability

### Headless/MCP
- **Best for:** Automation, n8n workflows, and programmatic content generation
- **Key advantage:** Native file persistence, structured input and output, and no blocking prompts
- **Limitation:** No network access. Needs an MCP-capable client.

---

## Requirements Coverage

This matrix meets requirement **DOCS-02** from the project requirements:

> DOCS-02 requires a matrix of which capabilities degrade or fall back on which platform, and how.

Each cell in the matrix above states one of these:
- **Native:** works automatically without user action
- **Degraded or Fallback:** works with less automation. The text names the fallback.
- **Unavailable:** does not work on this platform. The text names an alternative platform.
