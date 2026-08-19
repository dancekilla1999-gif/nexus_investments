# Setup Guide: Claude.ai (Web Chat) and Claude API

Use Content Writer on claude.ai's web interface or through the Claude API with Skills.

---

## Prerequisites

- A Claude.ai account (Free, Pro, Team, or Enterprise)
- For API usage: API access enabled on your account

---

## Overview

On Claude.ai and the Claude API, Content Writer runs as a **Skill**. A Skill is a bundle of instructions and reference files. Claude loads the Skill when your description matches it. Claude Code uses slash commands. Skills work in a different way. You describe what you want to create, and Claude loads the Content Writer skill.

**Key Features for Claude AI:**
- **Multi-Profile Support:** Create unlimited profiles (brands, voices, clients) and assign different profiles to different projects
- **Memory-Based Storage:** Claude's memory stores profiles and project state. You do not manage files by hand.
- **Artifact Output:** All content appears as artifacts you can view, edit, and download

---

## Installation Steps

### Step 1: Download the Skill Bundle

Find the Skill bundle at:

```
skills/adapters/claude-skill/
```

This folder contains:
- `SKILL.md`: the skill definition and instructions
- `references/`: all content strategy reference files

### Step 2: Upload to Claude.ai

**Via Web Interface:**

1. Go to [claude.ai](https://claude.ai) and sign in
2. Click your profile icon → **Settings**
3. Navigate to **Capabilities** → **Skills**
4. Click **"Create Skill"** or **"Upload Skill"**
5. Upload the entire `skills/adapters/claude-skill/` folder
6. Name it "Content Writer" (or any name you prefer)
7. Save the skill

**Via Claude API (for API integrators):**

Use the Skills upload endpoint:

```bash
curl -X POST https://api.anthropic.com/v1/skills \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@skills/adapters/claude-skill/SKILL.md" \
  -F "references[]=@skills/adapters/claude-skill/references/content-frameworks.md" \
  # ... include all reference files
```

See the [Claude API Skills documentation](https://platform.claude.com/docs) for the full API details.

### Step 3: Activate the Skill

After upload, the skill is available in your Claude.ai conversations. You do not need to invoke it. Claude loads the skill when your request matches its description.

---

## Using Content Writer

### Quick Start (First Time)

Describe what you want to create:

> "Write me a LinkedIn post about AI productivity tools"

Claude will:
1. Load the Content Writer skill automatically
2. Check if you have any profiles
3. If no profiles exist, offer to create one
4. If profiles exist, ask which one to use for this project
5. Start the five-phase workflow

### The Five Phases

The skill guides you through:

1. **Discuss:** gather requirements (topic, platform, audience, goals)
2. **Plan:** build the outline and SEO strategy
3. **Execute:** write the draft content
4. **Verify:** run SEO, anti-AI, and STE checks
5. **Ship:** present the final content as an artifact with publishing notes

### The STE Compliance Gate

Version 2.4.0 adds ASD-STE100 Simplified Technical English as the writing law for all content. A linter checks the draft at the Verify step. The linter is `scripts/ste-lint.js`, bundled in the skill. When code execution is available, the skill runs the linter. When code execution is not available, the skill runs the same rules as a manual self-lint.

The linter uses three tiers:
- **Strict:** SEO metadata and operational email. Zero violations.
- **Prose:** blog, web, sales, case studies, and newsletters. 3.0 or fewer per 100 words.
- **Social:** LinkedIn, Twitter/X, Facebook, and Instagram. 4.0 or fewer per 100 words.

Marketing-adjective and banned-word counts must be zero on every tier. A draft that fails does not ship. The Verify phase writes two new state fields: `ste_gate` and `ste_per100w`.

---

## Multi-Profile Management

### Creating Profiles

Create a unique profile for each brand, client, or voice you write for:

> `/writer:profile-create My-SaaS`
> `/writer:profile-create Personal-Blog`
> `/writer:profile-create Client-Acme`

Each profile includes:
- Brand identity and industry
- Target audience
- Voice and tone preferences
- Products and services
- Case studies
- CTAs and publishing workflow

### Viewing Available Profiles

List all your profiles:

> `/writer:profile-list`

Output shows:
```
┌─────────────────────────────────────────────────────────────┐
│  Available Profiles                                         │
├─────────────────────────────────────────────────────────────┤
│  • My-SaaS        (active for this project)                 │
│  • Personal-Blog                                            │
│  • Client-Acme                                              │
└─────────────────────────────────────────────────────────────┘
```

### Switching Profiles

Change which profile is active for the current project:

> `/writer:profile-use Personal-Blog`

Each Claude Project remembers its own profile assignment. A switch in one project does not affect the others.

### Viewing a Profile

Display a profile's details:

> `/writer:profile-view My-SaaS`

Outputs the full profile as an artifact you can review or download.

### Editing a Profile

Update specific fields:

> `/writer:profile-edit My-SaaS`

Claude will ask which fields to update (products, CTAs, tone, etc.).

### Deleting a Profile

Remove a profile:

> `/writer:profile-delete Client-Acme`

---

## Project-to-Profile Assignment

**Each Claude Project can use a different profile.**

**Example workflow:**

**Project A (SaaS Marketing):**
```
User: /writer:profile-use My-SaaS
[Project A now uses My-SaaS profile for all content]

User: Write a LinkedIn post about our new feature
[Generated using My-SaaS voice and CTAs]
```

**Project B (Personal Blog):**
```
User: /writer:profile-use Personal-Blog
[Project B uses Personal-Blog profile]

User: Write a blog post about remote work
[Generated using Personal-Blog voice, completely different from Project A]
```

**Project C (Client Work):**
```
User: /writer:profile-use Client-Acme
[Project C uses Client-Acme profile]

User: Write a case study
[Generated using Client-Acme's brand guidelines]
```

Each project keeps its own profile assignment across chats.

---

## State Management (Automatic)

**No manual state management needed.** Claude remembers:

- Current phase for each project
- Active profile for each project  
- Project brief, outline, draft, and verified content

**To continue a project:** return to the same Claude Project and say:
> `/writer:next`

Claude will detect the current phase and continue from there.

**To start fresh:** Say:
> `/writer:discuss "new topic"`

---

## Artifact Output

All content appears as **Claude Artifacts**. Artifacts are interactive panels where you can:

- **View** the formatted content
- **Edit** directly in the artifact
- **Copy** to clipboard
- **Download** as markdown files

**Profile artifacts:** Named `PROFILE-[name].md`
**Content artifacts:** Named `content-writer-output/[platform]/[NNN]-[slug].md`

---

## Profile-First Enforcement

Content Writer **requires** a profile. If you request content without an active profile:

1. **If no profiles exist:** Claude offers to create one
2. **If profiles exist:** Claude asks which one to use

You cannot generate content without selecting or creating a profile first.

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `/writer:profile-create [name]` | Create a new writer profile |
| `/writer:profile-list` | Show all available profiles |
| `/writer:profile-use [name]` | Set active profile for this project |
| `/writer:profile-view [name]` | Display a profile's details |
| `/writer:profile-edit [name]` | Edit specific profile fields |
| `/writer:profile-delete [name]` | Delete a profile |
| `/writer:discuss [topic]` | Start content discussion phase |
| `/writer:plan` | Create outline and SEO strategy |
| `/writer:execute` | Write the draft content |
| `/writer:verify` | Run SEO and anti-AI checks |
| `/writer:ship` | Output final content as artifact |
| `/writer:next` | Auto-advance to next phase |
| `/writer:status` | Show current project state |
| `/writer:help` | Show all commands |
| `/writer:update` | Check for skill updates |

---

## Network Access Limitations

Claude API code-execution containers have **no network access**. Claude.ai web containers have **varying** network access based on your settings.

If URL fetching fails (e.g., for tone detection during profile creation), the skill will ask you to paste the article text or 2 to 3 representative paragraphs directly.

---

## Capabilities vs. Claude Code

| Feature | Claude.ai/API Skill | Claude Code |
|---------|---------------------|-------------|
| **Invocation** | Description-triggered | Slash commands (`/writer:*`) |
| **Profile storage** | Claude memory (unlimited profiles) | Files in `content-writer-output/profile/` |
| **Project-to-profile mapping** | Automatic per-project | Manual file management |
| **State persistence** | Claude memory across chats | File-based PROJECT-STATE.md |
| **Output** | Artifacts (view/edit/download) | Files on disk |
| **URL fetching** | May need you to paste content | Full network access |
| **SEO/humanizer integration** | Manual checklist fallback | Automatic skill invocation |
| **Multi-profile** | Yes, unlimited profiles per account | Yes, but file-based switching |

---

## Verify It Worked

After setup, test the skill:

1. Start a new conversation on claude.ai
2. Type: "Write me a LinkedIn post about remote work productivity"
3. Verify Claude loads the Content Writer skill
4. If no profiles exist, create one with `/writer:profile-create Test-Profile`
5. If profiles exist, select one when prompted
6. Work through all five phases
7. Verify the final output appears as an artifact with frontmatter
8. Test `/writer:profile-list` to see your profiles
9. Create a second Claude Project and verify you can use a different profile

For detailed manual testing steps, see `docs/checklists/claude-ai-manual-test.md`.

---

## Tips for Multi-Profile Success

1. **Name profiles descriptively:** Use brand names or client names (e.g., "Acme-Corp", "My-Personal-Blog")

2. **One profile per project:** Assign different profiles to different Claude Projects for clean separation

3. **Profile persistence:** Profiles exist in Claude's memory. They persist across:
   - Chats within the same Claude Project
   - Sessions on the same account
   
4. **Backup important profiles:** For critical profiles, download the profile artifact and save it locally. You can re-upload it to Project Knowledge if needed.

5. **Switching profiles mid-project:** You can switch profiles at any time with `/writer:profile-use [name]`. New content will use the new profile's voice and CTAs.

---

## Troubleshooting

**"No profiles found" but I created one:**
- Claude stores profiles per account. Make sure you sign into the same account.
- Try `/writer:profile-list` to refresh the list.

**Profile not persisting across projects:**
- Each Claude Project has its own profile assignment. This is by design. Use `/writer:profile-use` in each project.

**Want the same profile across all projects:**
- Create the profile once, then use `/writer:profile-use [name]` in each new project.

**Content does not match my brand voice:**
- Check `/writer:profile-view` to verify the active profile
- Make sure you use the correct profile for this project
