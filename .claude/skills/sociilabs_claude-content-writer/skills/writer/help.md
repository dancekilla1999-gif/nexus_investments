---
name: writer:help
description: Show all available commands, what each does, and how to get started
---

# /writer:help — Help & Commands

@~/.claude/skills/shared-context.md

## Objective

Display all commands in a scannable format with just enough context to know which one to run.

## Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Content Writer v2.0 — Commands
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  WORKFLOW

  /writer:discuss [topic]   Start a content project — requirements
                            and framework selection
  /writer:plan              Research, outline, SEO strategy
  /writer:execute           Write the content
  /writer:verify            SEO check + anti-AI audit
  /writer:ship              Save to file with publishing notes
  /writer:next              Auto-advance to whatever's next

  PROFILE

  /writer:profile-create    Build a new writer profile
  /writer:profile-view      See current profile
  /writer:profile-edit      Update any field — voice, CTAs,
                            products, case studies
  /writer:profile-delete    Delete profile and all data

  UTILITIES

  /writer:status            Current phase, profile, next step
  /writer:help              This screen
  /writer:update            Check for updates

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  QUICK START

  First time:
    /writer:profile-create   → then
    /writer:discuss "topic"  → /writer:next (repeat until shipped)

  Returning:
    /writer:discuss "topic"  → /writer:next (repeat)

  Not sure where you are:
    /writer:status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

After displaying help, check `content-writer-output/profile/` for state to surface:
- No PROFILE.md → "No profile found. Run `/writer:profile-create` to get started."
- PROFILE.md exists, check `PROJECT-STATE.md`:
  - `phase` field present → "Active project detected: [topic], phase [phase]. Run `/writer:next` to continue."
- Otherwise: nothing to add.
