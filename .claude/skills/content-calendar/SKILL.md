---
name: content-calendar
description: Generate weekly content plans with content pillars, cadence, and growth-stage-adapted strategies
auto_invoke: true
---

# Content Calendar

Generate a complete 7-day content plan tailored to your developer niche, follower count, and growth goals.

## Instructions

1. **Parse inputs** from `$ARGUMENTS`:
   - Developer niche (e.g., "React developer", "DevOps engineer")
   - Follower count (for growth-stage adaptation)
   - Goals (e.g., "grow to 10K", "build thought leadership")

2. **Determine growth stage** and adapt strategy:
   - **0-1K followers**: Reply-heavy (70% replies, 30% original). Focus: build Real-graph scores. 1-2 tweets/day + 1 thread/week.
   - **1K-10K followers**: Balanced. 1 thread/week + 1-2 daily tweets + selective replies.
   - **10K-50K followers**: Authority building. Add thought leadership, signature frameworks, Spaces.
   - **50K+ followers**: Platform building. Newsletter, premium content, selective partnerships.

3. **Apply content pillars** from `references/content-pillars.md`:
   - Educational (40%) | Thought Leadership (20%) | Building in Public (20%) | Community (15%) | Personal (5%)
   - Adjust percentages by growth stage

4. **Follow weekly cadence** from `references/weekly-cadence.md`:
   - Mon=Thread, Tue=Hot take, Wed=Code tip, Thu=BTS update, Fri=Community, Sat=Story, Sun=Rest

5. **Incorporate seasonal context** from `references/seasonal-dev-events.md` if relevant

6. **Generate content for each day**:
   - Use viral-hook-generator patterns for hook drafts
   - Use posting-schedule logic for optimal times
   - Match content type to pillar allocation
   - Include specific topic ideas based on niche + current trends

7. **Add daily reply targets** and weekly growth goals

## Output Format

```
📅 Content Calendar: [NICHE]
Growth Stage: [stage] ([follower count] followers)
Strategy: [1-sentence strategy summary]

| Day | Type | Topic | Hook Draft | Time (ET) | Pillar |
|-----|------|-------|------------|-----------|--------|
| Mon | Thread (8 tweets) | [topic] | "[hook]" | 8:30 AM | Educational |
| Tue | Hot take | [topic] | "[hook]" | 12:15 PM | Thought Leadership |
| Wed | Code tip | [topic] | "[hook]" | 8:00 AM | Educational |
| Thu | Build in public | [topic] | "[hook]" | 5:30 PM | Building in Public |
| Fri | Community | [topic] | [engagement activity] | 9:00 AM | Community |
| Sat | Story | [topic] | "[hook]" | 10:00 AM | Personal |
| Sun | Rest | — | — | — | — |

📊 Daily Targets:
- Reply to [N] tweets from [niche]-relevant accounts (esp. [follower range])
- Engage with [N] threads in your niche
- [Stage-specific daily goal]

🎯 Weekly Goals:
- [Impressions target]
- [New followers target]
- [Engagement rate target]
- [Content pieces to create]

💡 This Week's Opportunities:
- [Trending topic 1 in niche]
- [Seasonal event/relevance]
- [Suggested collaboration/engagement target]
```

## Key Principles
- Quality over quantity — better to skip a day than post filler
- Replies are content too — especially at 0-1K stage
- Every piece should serve the growth strategy, not just fill a slot
- Adapt the calendar to what's actually trending, not just the template
