# Content Calendar

> Generate 7-day content plans with content pillars, cadence, and growth-stage-adapted strategies.

## Usage

```
/x-calendar [niche] [follower count] [goals]
```

## What It Does

Creates a complete 7-day content plan tailored to your developer niche, current follower count, and growth goals. Adapts strategy by growth stage (0-1K, 1K-10K, 10K-50K, 50K+). Applies content pillar distribution: Educational (40%), Thought Leadership (20%), Building in Public (20%), Community (15%), Personal (5%). Includes daily topics, hooks, posting times, reply targets, and weekly metrics goals.

## Example

```
/x-calendar "fullstack dev" 2500 "grow to 5K"

Growth Stage: 1K-10K (Balanced approach)

| Day | Type | Topic | Pillar | Time |
|-----|------|-------|--------|------|
| Mon | Thread | 5 Next.js patterns I use daily | Educational | 9:00 AM ET |
| Tue | Hot Take | Why I stopped using ORMs | Thought Leadership | 12:00 PM ET |
| Wed | Code Tip | One-liner: debounce in 3 lines | Educational | 9:00 AM ET |
| Thu | BIP Update | Week 12: shipped auth system | Building in Public | 5:00 PM ET |
| Fri | Question | What's your deploy stack? | Community | 12:00 PM ET |
| Sat | Story | My worst production outage | Personal | 10:00 AM ET |
| Sun | Rest | — | — | — |

Daily Reply Target: 10 quality replies
Weekly Goal: 50K impressions, +150 followers
```

## Dependencies

References patterns from: viral-hook-generator, posting-schedule, post-creator, trend-discovery, thread-composer.
