---
name: writer:status
description: Show current workflow phase, profile status, dependency availability, and next step
---

# /writer:status — Current Status

@~/.claude/skills/shared-context.md

## Objective

Give the user a complete snapshot of the current state: what's loaded, where in the workflow they are, and what to do next.

## Step 1: Gather state

Check for profile files in `content-writer-output/profile/`:
- PROFILE.md → profile loaded?

Check `content-writer-output/profile/PROJECT-STATE.md` for:
- `phase` field → current workflow phase

Check tool availability:
- claude-seo: available or not
- humanizer: available or not

## Step 2: Determine current phase

| Condition | Current phase | Next step |
|-----------|--------------|-----------|
| No profile files | Not started | `/writer:profile-create` |
| Profile exists, no `PROJECT-STATE.md` | No active project | `/writer:discuss` |
| `phase: discuss` | Discuss ✓ | `/writer:plan` |
| `phase: plan` | Plan ✓ | `/writer:execute` |
| `phase: execute` | Execute ✓ | `/writer:verify` |
| `phase: verify` | Verify ✓ | `/writer:ship` |
| `phase: complete` | Complete | Run `/writer:discuss` to start new project |

## Step 3: Display

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Content Writer Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Profile:   [Name at Company] / Not loaded
  Products:  [N] / None
  CTAs:      [N] / None
  Cases:     [N active, N resting] / None

  Workflow:
  [✓] Discuss   — [topic, if set]
  [✓] Plan      — [framework, if set]
  [✓] Execute   — [word count, if generated]
  [✓] Verify    — [ai patterns fixed, seo score]
  [ ] Ship

  Next:      /writer:[command]

  Dependencies:
  claude-seo:  [available / not available]
  humanizer:   [available / not available]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Show checkmarks only for completed phases. Leave uncompleted phases as `[ ]`. Don't show phases that haven't been reached yet if it makes the display confusing — show at minimum the current phase and next step.
