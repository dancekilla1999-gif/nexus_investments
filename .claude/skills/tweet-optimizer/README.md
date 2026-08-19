# Tweet Optimizer

> Rewrite and optimize tweets for maximum algorithmic reach on X/Twitter using open-source algorithm signals.

## Usage

```
/x-optimize [draft tweet]
```

## What It Does

Analyzes your draft tweet against X's actual algorithm signals (Reply +54x, Bookmark +40x, Like +30x, etc.), identifies weaknesses, and produces 3 optimized variants: Reply-optimized, Share-optimized, and Save-optimized. Each variant includes a score breakdown and explanation of changes.

## Example

```
/x-optimize "Just launched my new side project! Check it out at mysite.com"

Original Score: 34/100
Issues: External link (-5x penalty), no hook, no reply trigger

Variant 1 [Score: 78/100] Reply-Optimized:
   "After 6 months of building in secret, it's live.
   
   The problem: [specific pain point]
   The solution: [what you built]
   
   What would you want to see in v2?"

Variant 2 [Score: 74/100] Share-Optimized:
   ...
```

## Dependencies

None — standalone optimization skill.

## Files

- `SKILL.md` — Skill instructions
- `references/algorithm-signals.md` — X algorithm signal weights
- `references/negative-signals.md` — Penalty signals to avoid
- `references/engagement-multipliers.md` — Bonus multipliers
- `scripts/score_tweet.py` — Scoring script
