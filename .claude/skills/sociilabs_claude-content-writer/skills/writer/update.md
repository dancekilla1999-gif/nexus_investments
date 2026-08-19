---
name: writer:update
description: Check npm for a newer version of content-writer and upgrade with changelog preview
---

# /writer:update — Update Content Writer

@~/.claude/skills/shared-context.md

## Objective

Check if a newer version is available and upgrade if the user confirms. Show what's changed before upgrading.

## Step 1: Read installed version

```bash
cat ~/.claude/skills/content-writer/.version
```

If the file doesn't exist: "Can't determine installed version. Proceeding with registry check."

## Step 2: Check registry

```bash
npm view claude-content-writer version
```

## Step 3: Compare

**If up to date:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Content Writer is up to date
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Version: v[current]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If update available:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 Update Available
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current:  v[installed]
  Latest:   v[registry]

  [Changelog preview — read from registry or CHANGELOG.md]

  Update now? (yes / no)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 4: Upgrade on confirmation

If user confirms:

```bash
npm install -g claude-content-writer@latest
```

On success:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Updated to v[new version]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  v[old] → v[new]
  
  [Full changelog for this version]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

On failure: report the npm error message verbatim. Don't try to diagnose it — just show the output.

If user declines: "Update skipped. Still on v[installed]."

## Session tracking

After showing the update notification once in a session, do not show it again. Store `updateNotificationShown = true` in session memory and skip the check on subsequent commands.
