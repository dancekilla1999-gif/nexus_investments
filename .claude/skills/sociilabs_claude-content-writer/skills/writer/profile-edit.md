---
name: writer:profile-edit
description: Edit any part of the writer profile — identity, voice, products, CTAs, or case studies — without re-running the full interview
---

# /writer:profile-edit — Edit Profile

@~/.claude/skills/shared-context.md

## Objective

Update specific profile fields without touching anything else. Change only what was asked. Never re-run the full interview.

Load `references/profile-management.md` for memory key conventions before making changes.

## Step 1: Load current profile

Read profile files:
- `content-writer-output/profile/PROFILE.md`
- `content-writer-output/profile/PRODUCTS.md`
- `content-writer-output/profile/CTAS.md`
- `content-writer-output/profile/CASE-STUDIES.md`

If files don't exist: check `[Content Writer]` memory entries as fallback. If neither exists: "No profile found. Run `/writer:profile-create` first."

## Step 2: Identify what to edit

The user will specify what they want to change. Map their request to the affected memory key(s):

| User says | Memory keys affected |
|-----------|---------------------|
| "Update my voice" / "change my tone" | `[Content Writer] Voice`, `[Content Writer] Voice notes` |
| "Change the booking link" | `[Content Writer CTA] [label]` |
| "Add a product" | New `[Content Writer Product] [name]` entry |
| "Edit the [product] product" | `[Content Writer Product] [name]` |
| "Add a CTA" | New `[Content Writer CTA] [label]` entry |
| "Update the [case study] case study" | `[Content Writer Case Study] [label]` |
| "Add a case study" | New `[Content Writer Case Study] [label]` entry |
| "Change my audience" | `[Content Writer] Audience` |
| "Update the company description" | `[Content Writer] Business` |
| "Change the article length" | `[Content Writer] Article length` |
| "Set [case study] to resting" | `[Content Writer Case Study] [label]` — update rotation field |
| "Retire [case study]" | `[Content Writer Case Study] [label]` — set rotation to "retired" |

If the request is ambiguous, show the current value first and ask what should change.

## Step 3: Show current value

> "Current [field]: [value]"

Then accept the new value. Don't ask "Are you sure?" — they said edit, not delete.

## Step 4: Update file, then memory cache

1. Update the relevant file in `content-writer-output/profile/`
   - Core fields → `PROFILE.md`
   - Products → `PRODUCTS.md`
   - CTAs → `CTAS.md`
   - Case studies → `CASE-STUDIES.md`
2. Update the memory entry with the new value (secondary cache populated FROM the file)

If the file write fails, do not update memory and report the error.

## Step 5: Confirm

> "Updated: [field] → [new value]"

One line. No ceremony.

## Adding products, CTAs, or case studies

When adding new entries, prompt only for the required fields. Required fields by type:

**Product:** name, 1-sentence description, target customer, key benefit, price range (optional), "use when" trigger condition

**CTA:** label, type (soft/direct/specific offer), copy text, platforms it works on, URL or action

**Case study:** label, client context (named or anonymized), problem, approach, specific outcome with metrics, NDA status, rotation status (default: active)

After adding: "Added [type]: [name]. Now at [N] total."

## Deleting individual entries

To delete a single product, CTA, or case study (not the whole profile):

1. Show the entry: "Deleting: [full entry text]"
2. Confirm: "Are you sure? This can't be undone. (yes/no)"
3. On yes: remove from memory and from the relevant file
4. Confirm: "Deleted [label]."

Do not offer this proactively — only when explicitly requested.
