# 🚀 Content Writer v2.3.0 is Here - Multi-Profile Support!

We're excited to announce the release of Content Writer v2.3.0 with one of the most requested features: **multi-profile support**! 🎉

---

## What's New in v2.3.0

### ✨ Multi-Profile System

You can now create and manage **unlimited writer profiles** for different brands, clients, or content voices. Each profile includes:
- Brand identity, audience, voice & tone
- Content strategy and publishing preferences  
- Products/services with descriptions
- CTAs for different platforms
- Case studies with metrics

**Why this matters:** If you manage content for multiple clients or brands, you can now switch between completely different voices without re-creating profiles every time.

---

## Platform Updates

### 🤖 Claude AI (Web/Desktop App)

The biggest upgrade! Claude AI now supports:
- **Per-project profile assignment** - Each Claude Project remembers its own profile
- **Memory-based storage** - No manual file management needed
- **New commands:**
  - "List my profiles" - See all your profiles
  - "Use [name] profile" - Switch active profile
  - "Create profile called [name]" - Make new profiles

**Download:** [content-writer-v2.3.0-claude-ai.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-claude-ai.zip)

### 💻 Claude Code (Terminal/IDE)

- `/writer:profile-list` - Display all available profiles
- `/writer:profile-use [name]` - Switch to a different profile
- File-based storage in `content-writer-output/profile/`

**Download:** [content-writer-v2.3.0-claude-code.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-claude-code.zip)

### 💬 ChatGPT (Custom GPT)

- Natural language profile commands
- "Create profile called...", "Use [name] profile", "List my profiles"
- File-based profile storage (upload/download)

**Download:** [content-writer-v2.3.0-chatgpt.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-chatgpt.zip)

### 🔷 Gemini (Gem)

- Natural language profile switching
- "Switch to [name] profile", "Show all profiles"
- File-based profile storage

**Download:** [content-writer-v2.3.0-gemini.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-gemini.zip)

---

## Quick Start Example

**Scenario:** You manage content for 3 different brands

**Claude AI workflow:**
1. Create Project A → "Create profile called SaaS-Brand"
2. Create Project B → "Create profile called Personal-Blog"  
3. Create Project C → "Create profile called Client-Acme"

Now each project automatically uses its assigned profile. Switching projects = switching brands instantly!

**Claude Code workflow:**
```bash
/writer:profile-create SaaS-Brand
/writer:profile-create Personal-Blog
/writer:profile-list
# Shows: SaaS-Brand, Personal-Blog

/writer:profile-use Personal-Blog
/writer:discuss "blog post about productivity"
```

---

## Other Improvements

- ✅ **Ship Script** - Automated release process (`npm run ship [patch|minor|major]`)
- ✅ **Updated Documentation** - Complete README rewrite with platform comparisons
- ✅ **Adapter Sync** - All platform adapters now use the same canonical reference files
- ✅ **Better Setup Guides** - Step-by-step instructions for each platform

---

## Breaking Changes

None! This is a backward-compatible minor release. Existing single-profile workflows continue to work exactly as before.

---

## Downloads

| Platform | Download Link | Size |
|----------|----------------|------|
| **Claude Code** | [content-writer-v2.3.0-claude-code.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-claude-code.zip) | 128 KB |
| **Claude AI** | [content-writer-v2.3.0-claude-ai.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-claude-ai.zip) | 128 KB |
| **ChatGPT** | [content-writer-v2.3.0-chatgpt.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-chatgpt.zip) | 124 KB |
| **Gemini** | [content-writer-v2.3.0-gemini.zip](https://github.com/sociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-gemini.zip) | 118 KB |
| **Complete** | [content-writer-v2.3.0-complete.zip](https://github.comociilabs/claude-content-writer/releases/download/v2.3.0/content-writer-v2.3.0-complete.zip) | 586 KB |

---

## We'd Love Your Feedback!

- How many profiles are you planning to create?
- Which platform are you using most?
- Any issues with the new multi-profile workflow?

Drop your thoughts below! 👇

---

**Full Changelog:** [CHANGELOG.md](https://github.com/sociilabs/claude-content-writer/blob/master/CHANGELOG.md)

**Release Page:** https://github.com/sociilabs/claude-content-writer/releases/tag/v2.3.0
