---
name: writer:next
description: Auto-advance to the next phase — detects current state and runs the appropriate command
---

# /writer:next — Auto-Advance

@~/.claude/skills/shared-context.md

## Objective

Detect current workflow state from memory and run the next phase automatically. One command instead of five.

## Phase detection logic

Check `content-writer-output/profile/PROJECT-STATE.md` for the `phase` field:

| Condition | Run next | Message |
|-----------|----------|---------|
| No `PROJECT-STATE.md` file and no profile files | `/writer:profile-create` | "No profile found. Let's set that up first." |
| Profile exists, no `PROJECT-STATE.md` file | `/writer:discuss` | "No active project. Starting discussion phase." |
| `phase: discuss` | `/writer:plan` | "Discussion complete. Moving to plan." |
| `phase: plan` | `/writer:execute` | "Plan complete. Generating content." |
| `phase: execute` | `/writer:verify` | "Draft complete. Running quality check." |
| `phase: verify` | `/writer:ship` | "Verified. Shipping content." |
| `phase: complete` | — | "Workflow complete. Run `/writer:discuss` to start a new project." |

## Execution

Do not pause between detection and execution. Detect the state, announce the phase in one line, then immediately run it.

Do not ask "Should I continue?" — that's what this command is for.
