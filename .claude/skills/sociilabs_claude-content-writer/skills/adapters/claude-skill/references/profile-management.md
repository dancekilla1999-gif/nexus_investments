# Profile Management System

Operational reference for managing writer profiles, products, CTAs, and case studies
on disk. Load this file when handling any `/writer:profile-*` command or when needing
to understand how profile data is stored, retrieved, or updated.

Field and heading names in this file match `skills/state-schema.md`'s Profile Schema
section exactly — that document is the schema authority; this document is the operational
reference for working with it.

---

## Storage model: file-first

All profile data lives in `content-writer-output/profile/`. The profile files are
authoritative on every platform.

On platforms that offer an optional session-cache mechanism (for example, Claude Code's
memory tool), that cache is secondary and non-authoritative — it may be populated FROM the
files for faster in-session lookups, but it is never the source of truth and never the only
place a value lives. This matches `skills/state-schema.md`'s File-First Storage Rule
verbatim.

**On save:** write the file. If a session cache is available, populate it FROM the file
afterward. If the file write fails, do not populate the cache.

**On load:** read the profile files. If a session cache is available, populate it FROM the
files for this session's fast lookups.

**On conflict (cache and file disagree):** the file is authoritative. Always prefer the
file. Refresh the cache to match.

---

## Profile file structure

Profile data is organized under four files, each with the exact headings/fields defined in
`skills/state-schema.md`'s Profile Schema section:

| File | Contains |
|------|---------|
| `PROFILE.md` | Core identity, audience, voice, content strategy, publishing preferences |
| `PRODUCTS.md` | One `### [product name]` subsection per product/service |
| `CTAS.md` | One `### [label]` subsection per CTA template |
| `CASE-STUDIES.md` | One `### [label]` subsection per case study, with rotation status |

### Core profile (PROFILE.md)

Required headings, in order: `# Writer Profile`, `## Identity`, `## Audience`, `## Voice`,
`## Content Strategy`, `## Publishing`.

| Section | What it holds |
|---------|--------------|
| `## Identity` | Name and title, company name and domain, industry/niche |
| `## Audience` | Primary audience — be specific, not "marketers" |
| `## Voice` | Tone (3–5 adjectives), what to avoid, style notes/idiosyncrasies/influences |
| `## Content Strategy` | Content types/formats, 3–5 recurring pillars, primary goal |
| `## Publishing` | Blog URL for tone calibration, article length range, output format, publishing workflow/sequence |

Platform-specific formatting preferences (e.g. LinkedIn prefs, Newsletter prefs) live as
additional bullet items under `## Publishing`.

### Product entry (PRODUCTS.md)

```markdown
### MVP Sprint

- description: 3-week validation process before building. Customer interviews, landing page testing, paid pilots.
- price_range: $5K–$15K
- target_customer: Early-stage founders
- use_when: Discussing validation, avoiding waste
```

Required fields: name (the `### [name]` heading), description, price_range, target_customer,
use_when (trigger condition for when to reference this product).

### CTA entry (CTAS.md)

```markdown
### soft_booking

- type: soft
- copy: "If you're dealing with this, let's talk. Book 30 min — we'll tell you what we think even if the answer is 'you're fine.'"
- platforms: blog, LinkedIn
- url: https://cal.com/example
```

Required fields: label (the `### [label]` heading), type (soft/direct/specific offer), copy
text, platforms (context this CTA is used on), url.

### Case study entry (CASE-STUDIES.md)

```markdown
### HealthTech Platform

- client_context: Healthcare startup, 8 months dev, zero users
- problem: Built without validation
- approach: 30 provider interviews, found different problem, 6-week focused MVP, 5 paid pilots
- outcome: $120K revenue in 6 months, 40 customers
- nda_status: no
- rotation: active
- testimonial: (optional)
```

Required fields: label (the `### [label]` heading), client_context, problem, approach,
outcome, nda_status, rotation status. Testimonial quote is optional.

### Shortcode entry

Shortcodes are documented as a table (see "Shortcode system" below) rather than as
individual profile entries — a shortcode either resolves to a fixed value (booking link,
email, website) or points at a CTA/case study/product entry by name.

---

## Commands reference

### `/writer:profile-create`

See the profile creation flow in SKILL.md. This file covers what gets stored afterward.

After completing the interview:

1. Write `content-writer-output/profile/PROFILE.md` with all core sections filled in
   (don't wait to batch everything — a partially-complete profile is usable)
2. Write separate files for products, CTAs, case studies
3. If a session cache is available, populate it FROM the files just written
4. Confirm with user: "Profile saved. [N] products, [N] CTAs, [N] case studies."

### `/writer:profile-view`

1. Read `PROFILE.md`, `PRODUCTS.md`, `CTAS.md`, `CASE-STUDIES.md`
2. Present `PROFILE.md` organized by its existing sections: Identity → Audience → Voice →
   Content Strategy → Publishing
3. Show product count, CTA count, case study count with rotation breakdown
4. Flag any incomplete sections: "Missing: Blog URL, Newsletter prefs"

### `/writer:profile-edit [field]`

When the user says "update my voice" or "change the booking link" or "add a product":

1. Identify which profile file and section/subsection are affected
2. Show current value: "Current: [value]"
3. Accept new value
4. Write the updated file (and refresh the session cache, if one is available)
5. Confirm: "Updated [field]."

Do not re-run the full interview for edits. Change only what was requested.

### `/writer:profile-delete`

1. List what will be deleted: "This will remove your profile, [N] products, [N] CTAs, [N]
   case studies."
2. Require explicit "yes, delete everything" confirmation
3. Delete the profile files in `content-writer-output/profile/`
4. Clear the session cache, if one is available
5. Confirm deletion

### Adding products, CTAs, case studies

Use `/writer:profile-edit` for all additions. The user can say:

- "Add a product" → prompt for the required fields, append a new `### [name]` subsection to `PRODUCTS.md`
- "Add a CTA" → prompt for label, type, copy, platform, URL, append to `CTAS.md`
- "Add a case study" → prompt for context, problem, approach, outcome, NDA, set rotation to `active`, append to `CASE-STUDIES.md`
- "Edit the MVP Sprint product" → find that subsection, show current values, accept changes

---

## Shortcode system

Shortcodes are `{{name}}` placeholders replaced with actual content at generation time.

**Standard shortcode types:**

| Shortcode | Resolves to |
|-----------|-------------|
| `{{booking_link}}` | Booking URL from profile |
| `{{email}}` | Contact email |
| `{{website}}` | Company domain |
| `{{blog}}` | Blog URL |
| `{{cta:soft}}` | Soft CTA copy text |
| `{{cta:direct}}` | Direct CTA copy text |
| `{{cta:[label]}}` | Any named CTA by label |
| `{{case_study:[label]}}` | Case study URL or reference |
| `{{product:[name]}}` | Product page URL or reference |
| `{{author_name}}` | Author name from profile |
| `{{company_name}}` | Company name from profile |

**When to expand vs. leave as shortcode:**

- Default: expand to actual content (readers see the final version)
- Leave as shortcodes if user says "for CMS" or "I'll fill these in"
- Ask once at the start of a session if unclear, then remember the preference for the rest of the session

---

## Case study rotation

Rotation prevents overusing the same client stories across multiple pieces.

| Status | Meaning | Action |
|--------|---------|--------|
| `active` | Use freely | Default for all new entries |
| `rest` | Used heavily recently | Avoid unless it's a perfect fit and nothing else works |
| `retired` | Outdated or no longer accurate | Never use |

**When to update rotation:**

- After a case study appears in 3+ pieces in one month → set to `rest`
- After 4–6 weeks with no use → return `rest` to `active`
- After a case study is more than 2 years old and the numbers no longer represent current work → set to `retired`

**At generation time:** when selecting case studies, filter `active` first. If none fit the specific topic, check `rest`. If still no fit, write around the gap or note to the user that no suitable case study exists.

---

## Before writing: profile load checklist

Run this before every generation task:

```
1. Read content-writer-output/profile/PROFILE.md
   → Missing? Run /writer:profile-create

2. Verify minimum viable profile:
   - Identity: Name present ✓
   - Audience section present ✓
   - Voice section present ✓
   - At least 1 CTA in CTAS.md ✓

3. Load PRODUCTS.md, CTAS.md, CASE-STUDIES.md
   → Filter case studies: active only (unless topic demands otherwise)

4. Identify platform-specific preferences for this content type
   → Check the Publishing section of PROFILE.md for platform-specific notes
```

**Minimum viable profile:** If Identity, Audience, and Voice sections are present in
PROFILE.md, proceed. Don't block generation for missing optional fields (article length,
blog URL, publishing workflow). Note what's missing and suggest completing it after the
current task.

---

## Integration during content generation

### Voice application

Apply these profile values automatically — don't announce them to the user:

- **Voice adjectives** → tune sentence construction, level of directness, formality
- **Voice notes** → apply idiosyncrasies (use of "we" vs "I", specific phrases they use, topics they lean into)
- **What to avoid** → treat as a hard filter on word choice and framing
- **Blog URL** → fetch 1–2 recent posts to calibrate (only if the topic differs significantly from the user's usual content, and only when network access to fetch the URL is available — otherwise ask the user to paste representative content directly)

### Product references

Reference products naturally when the content topic overlaps with what the product solves.
Never force a product mention. If a piece has no natural product fit, don't include one.

When a product IS relevant:

- Mention by name, in context, not as an ad
- Use the `use_when` trigger condition from the product entry as the qualifier
- CTA to the product comes at the end, not mid-sentence

### CTA placement by platform

| Platform | Embedded CTAs | Closing CTA | Link placement |
|----------|--------------|-------------|----------------|
| Blog article | 1–2 soft, mid-content | 1 direct, end | In text or at closing |
| LinkedIn | 0–1 soft, end of post | — | First comment |
| Twitter/X | 0 in tweet body | Soft ("DM me"), final tweet | Reply to thread |
| Facebook | 0–1 soft, end | — | First comment |
| Instagram | 1 soft, end of caption | "Link in bio" | Bio |
| Email / newsletter | 1–2 soft, inline | 1 direct, end | In text |

Use `{{cta:soft}}` and `{{cta:direct}}` shortcodes during generation, expand before ship.

---

## File structure

```
content-writer-output/
└── profile/
    ├── PROFILE.md          ← core identity, audience, voice, strategy, publishing
    ├── PRODUCTS.md         ← all product entries
    ├── CTAS.md             ← all CTA entries
    └── CASE-STUDIES.md     ← all case study entries with rotation status
```

Each file is human-readable markdown — not a data dump. Format with headers and clear
sections so the user can review and edit in any text editor.

---

## Multi-Profile Management

Content Writer supports multiple profiles for different brands, clients, or content voices.
This is essential for agencies, consultants, or anyone managing content for multiple entities.

### Naming Convention

Profile names should be:
- **Descriptive**: "My-SaaS", "Personal-Blog", "Client-Acme"
- **Unique**: No two profiles share the same name
- **File-safe**: Use hyphens instead of spaces (e.g., "My-Brand" not "My Brand")

### Storage by Platform

**Claude Code:**
- Files stored at `content-writer-output/profile/`
- Single active profile per workspace
- Switch profiles with `/writer:profile-use [name]`

**Claude AI (Web/App):**
- Profiles stored in Claude's memory
- Multiple profiles remembered simultaneously
- Per-project profile assignment (different projects can use different profiles)
- Switch with: "Use [name] profile" or "/writer:profile-use [name]"

**ChatGPT Custom GPT:**
- Profiles output as files for user to save
- User uploads profile file at session start
- Natural language: "Use My-SaaS profile" then upload the file

**Gemini Gem:**
- Profiles output as files for user to save
- User uploads profile file at session start
- Natural language: "Switch to Client-Acme profile" then upload

### Profile Selection Workflow

When user starts a content request:

1. **Check for active profile**
   - If active profile exists → use it
   - If no active profile → proceed to step 2

2. **List available profiles**
   - If only one profile → activate it automatically
   - If multiple profiles → ask: "Which profile should I use? [list]"
   - If no profiles → offer to create one

3. **Remember the selection**
   - Store in memory/state: "This [project/conversation] uses [name] profile"
   - Include profile name in PROJECT-STATE.md

### Creating Additional Profiles

User request: "Create a new profile called [name]"

Process:
1. Run the 10-topic questionnaire
2. Output profile as `PROFILE-[name].md` artifact/file
3. Store/remember the new profile
4. Ask: "Switch to this profile now?" (optional)

### Listing Profiles

User request: "List my profiles" or "Show all profiles"

Output format:
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

User request: "Use [name] profile" or "Switch to [name]"

Process:
1. Verify profile exists
2. Update active profile: "This project now uses [name] profile"
3. Confirm switch with brief profile summary
4. Apply new profile to subsequent content generation

### Viewing a Profile

User request: "Show my [name] profile" or "View profile"

Output the complete profile as markdown artifact with all sections:
- Identity, Audience, Voice, Content Strategy, Publishing
- Products, CTAs, Case Studies

### Editing a Profile

User request: "Edit [name] profile"

Process:
1. Display current profile
2. Ask which sections to update
3. Apply changes
4. Output updated profile
5. Confirm: "Profile [name] updated"

### Deleting a Profile

User request: "Delete [name] profile"

Process:
1. Confirm: "Delete profile [name]? This cannot be undone."
2. On confirmation: Remove from memory/storage
3. If it was active profile, clear active assignment
4. Confirm deletion

---

## Edge cases

**Profile file is missing but expected:**
Run `/writer:profile-create`. There is no other recovery path — the file is the only place
profile data lives.

**User says "I moved offices" or "we changed our pricing":**
Treat as an edit. Identify which section/subsection is affected, update the file, confirm.

**Case study client asked to be removed:**
Set rotation to `retired`. Don't delete — the structure is still useful for reference. If the user explicitly says "delete it," delete the subsection from `CASE-STUDIES.md`.

**User adds a 10th product:**
No limit. But if the product list grows beyond ~8 entries, ask whether older products should be retired or archived — context windows have limits, and loading 10 product entries on every generation task adds noise.

**Profile is 80% complete but user wants to write now:**
Generate with what exists. Note at the end: "Missing: Newsletter prefs, Blog URL. Add these with /writer:profile-edit."

**Shortcode used in content but not in profile:**
Flag it before shipping: "{{shortcode_name}} in the content doesn't have a defined value. What should it resolve to?"
