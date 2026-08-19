---
name: post-creator
description: Create complete, ready-to-publish single tweets from a topic or rough idea with multiple format variants
auto_invoke: true
---

# Post Creator

Create complete, ready-to-publish single tweets from any topic or rough idea. Generates 3 variants in different formats, scored for engagement.

## Instructions

1. **Parse the topic/idea** from `$ARGUMENTS`
2. **Generate viral hooks first** — Before writing posts, generate 5 scroll-stopping hook options using the hook archetypes from `../viral-hook-generator/references/hook-patterns.md` and voice archetypes from `../viral-hook-generator/references/dev-voice-archetypes.md`. Score each hook on Curiosity (0-10), Specificity (0-10), and Algorithm-Friendliness (0-10). Select the top 3 hooks to use as openers for each post variant.
3. **Identify the best 3 post formats** from `references/post-formats.md` that fit the topic
4. **Generate 3 complete post variants** — each using one of the top-scored hooks as its opener, in a different format:
   - Each post must be complete and ready to publish (not just a hook)
   - Include hook + body + CTA in one tweet
   - Stay within 280 characters (or clearly mark if it's a long-form post)
   - Use CTA patterns from `references/cta-patterns.md`
5. **Score each post** using engagement-prediction logic:
   - Hook Strength (0-20)
   - Reply Potential (0-20)
   - Share Potential (0-20)
   - Save Potential (0-15)
   - Algorithm Fit (0-15)
   - Audience Match (0-10)
   - Total: 0-100
6. **Rank by total score** (highest first)

## Output Format

```
🎣 Hook Generation for: [TOPIC]

Top hooks selected (scored by Curiosity + Specificity + Algorithm-Friendliness):
1. "[Hook text]" — Total: XX/30 (C: X | S: X | A: X)
2. "[Hook text]" — Total: XX/30 (C: X | S: X | A: X)
3. "[Hook text]" — Total: XX/30 (C: X | S: X | A: X)

---

📝 Posts for: [TOPIC]

1. (Score: XX/100 — [Format Type])
   "[Complete tweet text]"
   
   Breakdown: Hook X/20 | Reply X/20 | Share X/20 | Save X/15 | Algo X/15 | Audience X/10

2. (Score: XX/100 — [Format Type])
   "[Complete tweet text]"
   
   Breakdown: Hook X/20 | Reply X/20 | Share X/20 | Save X/15 | Algo X/15 | Audience X/10

3. (Score: XX/100 — [Format Type])
   "[Complete tweet text]"
   
   Breakdown: Hook X/20 | Reply X/20 | Share X/20 | Save X/15 | Algo X/15 | Audience X/10

🕐 Best time to post: [recommendation based on content type]
💡 Tip: [one specific improvement suggestion for the top-scoring post]
```

## Key Rules
- Every post must be COMPLETE — not a hook that trails off
- Vary the formats across the 3 variants
- Use specific numbers and details over vague claims
- No external links in the tweet body (suggest self-reply for links)
- Max 2 hashtags, placed naturally
- End with engagement driver (question, CTA, or strong closer)
