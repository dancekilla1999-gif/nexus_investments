---
name: thread-composer
description: Compose optimized multi-tweet threads with proven structures for developer audiences
auto_invoke: true
---

# Thread Composer

Compose 5-15 tweet threads with optimal structure, formatting, and engagement hooks for developer content.

## Instructions

1. **Parse the topic and key points** from `$ARGUMENTS`
2. **Select the best thread architecture** from `references/thread-structures.md`:
   - Listicle, Story Arc, Tutorial, Case Study, or Comparison
   - Choose based on topic type and key points provided
3. **Compose the thread** following `references/formatting-rules.md`:
   - **Tweet 1 (Hook)**: Scroll-stopping opener. NO links. Maximum curiosity. Use hook patterns from viral-hook-generator.
   - **Tweets 2-N (Body)**: One idea per tweet. 200-250 characters optimal. Bridge sentences between tweets.
   - **Final Tweet (CTA)**: Call-to-action (follow, bookmark, share). Summarize value delivered.
   - **Self-Reply**: Place any links in a self-reply AFTER the thread, not in the thread itself.
4. **Validate**:
   - Each tweet is under 280 characters
   - Character count shown for each tweet
   - No tweet is just a transition — every tweet delivers value
   - Thread flows logically without repeating points
5. **Score the thread** for overall engagement potential

## Output Format

```
🧵 Thread: [TOPIC]
Architecture: [Listicle/Story Arc/Tutorial/Case Study/Comparison]
Thread length: [N] tweets

---

1/ [Hook tweet — no links, maximum curiosity]
[XXX chars]

2/ [Body tweet — one idea, bridge from previous]
[XXX chars]

3/ [Body tweet]
[XXX chars]

...

N/ [CTA tweet — summarize + call to action]
[XXX chars]

---

📎 Self-reply (post after thread):
[Links, resources, and references mentioned in thread]

📊 Thread Score: XX/100
🕐 Best time to post: [recommendation]
💡 Pro tip: [thread-specific advice]
```

## Key Rules
- Hook tweet makes or breaks the thread — spend 50% of effort here
- Every tweet should be standalone-valuable (people may see only one in their feed)
- Use line breaks within tweets for readability
- Thread should be 5-12 tweets for optimal engagement (longer = higher drop-off)
- Include at least one "quotable" tweet (something people will screenshot/retweet)
- Number format: "1/" not "1." or "(1)" — thread convention on X
