---
name: writer:profile-delete
description: Delete the writer profile and all associated data — requires explicit confirmation
---

# /writer:profile-delete — Delete Profile

@~/.claude/skills/shared-context.md

## Objective

Permanently delete the writer profile from memory and disk. Cannot be undone.

## Step 1: Load and inventory what will be deleted

Read profile files in `content-writer-output/profile/`:
- PROFILE.md
- PRODUCTS.md
- CTAS.md
- CASE-STUDIES.md

Count from files:
- Core profile sections present
- Products: N (count `### [product]` subsections)
- CTAs: N (count `### [label]` subsections)
- Case studies: N (count `### [label]` subsections)

If files don't exist, fall back to `[Content Writer]` memory entries and count from there.

## Step 2: Show exactly what gets deleted

> "This will permanently delete:
> - [N] core profile entries (identity, voice, audience, strategy)
> - [N] products
> - [N] CTAs
> - [N] case studies
> - Profile files in content-writer-output/profile/
>
> Content files in content-writer-output/ (blog, linkedin, etc.) are NOT deleted.
>
> This cannot be undone. Type 'yes, delete everything' to confirm, or anything else to cancel."

## Step 3: Execute only on explicit confirmation

The user must type exactly the confirmation phrase or an equivalent explicit statement ("yes delete it," "go ahead," "confirmed"). Any ambiguous response cancels.

If cancelled: "Deletion cancelled. Profile unchanged."

## Step 4: Delete

On confirmed deletion:

1. Delete the four profile files from `content-writer-output/profile/`
2. Delete all `[Content Writer]` memory entries (profile, products, CTAs, case studies, shortcodes)
3. Do NOT touch content output files in other directories

## Step 5: Confirm

> "Profile deleted. Run `/writer:profile-create` to start fresh."

Do not add "I'm sorry to see it go" or other filler. Just confirm and instruct.
