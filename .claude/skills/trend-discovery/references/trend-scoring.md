# Trend Scoring Methodology

This document defines the scoring system used to evaluate and rank trending developer topics on X/Twitter. The methodology produces a composite score from 1.0 to 10.0 that reflects a topic's current potential for high-engagement content.

---

## Scoring Formula

```
Trend Score = (Recency * 0.30) + (Velocity * 0.25) + (Engagement_Density * 0.25) + (Niche_Relevance * 0.20)
```

Each dimension is scored on a 1-10 scale. The weighted sum produces a final score from 1.0 to 10.0.

**Score Interpretation:**
- **8.0-10.0**: Hot trend. Create content immediately. Post within 6-12 hours for maximum impact.
- **6.0-7.9**: Strong trend. Good content opportunity. Plan content for the next 24-48 hours.
- **4.0-5.9**: Moderate interest. Viable for content if it aligns with your niche. Can be scheduled for the weekly calendar.
- **2.0-3.9**: Low activity. Only worth covering if it directly hits your core niche or you have a unique angle.
- **1.0-1.9**: Minimal traction. Skip unless you are trying to be early on a topic that you believe will spike.

---

## Dimension 1: Recency (Weight: 30%)

Recency measures how recently the topic emerged or experienced a significant spike in conversation volume. Fresher trends have higher content potential because the audience has not yet been saturated with takes.

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 10 | Broke in the last 6 hours. Very few content creators have covered it yet. |
| 9 | Emerged in the last 12 hours. Early adopters are posting but mainstream coverage is thin. |
| 8 | Emerged in the last 24 hours. Growing awareness but still room for original takes. |
| 7 | Active for 1-2 days. Well-known among engaged audiences but still generating new angles. |
| 6 | Active for 3-5 days. Multiple threads and takes already exist. Need a unique angle to stand out. |
| 5 | Active for 1-2 weeks. Becoming saturated. Only contrarian or deep-dive content will perform. |
| 4 | Active for 2-4 weeks. Mostly played out. Only niche-specific or data-driven content adds value. |
| 3 | Active for 1-2 months. Established conversation. Hard to add new value. |
| 2 | Active for 3-6 months. Old news for engaged audiences. Only evergreen treatment works. |
| 1 | Has been around for 6+ months. No recency value. Treat as evergreen topic instead. |

### Measurement in Live Mode

When X MCP tools are available:
1. Search for the topic keyword with time filters
2. Compare tweet volume in the last 6 hours vs. the previous 6 hours
3. Check the oldest tweet in the search results to estimate when the conversation started
4. If the earliest high-engagement tweet is less than 24 hours old, score 8+

### Measurement in Offline Mode

When operating without live data:
1. Use your knowledge cutoff to estimate when you last saw significant discussion of this topic
2. For topics tied to specific events (e.g., a conference), use the event date to estimate recency
3. For perennial topics (AI/LLMs, career advice), default recency score to 5 (always somewhat fresh)
4. For seasonal topics, score based on proximity to their peak season

---

## Dimension 2: Velocity (Weight: 25%)

Velocity measures the rate of growth in conversation volume. A topic that is accelerating has more viral potential than one that is steady or declining, even if the steady topic has higher absolute volume.

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 10 | Exponential growth. Tweet volume doubling every few hours. Trending hashtag. |
| 9 | Rapid acceleration. 5x growth in 12 hours. Multiple KOLs jumping in. |
| 8 | Strong growth. 3x volume increase in 24 hours. Organic spread across communities. |
| 7 | Steady growth. 2x volume increase in 24 hours. Growing beyond initial community. |
| 6 | Moderate growth. Noticeable increase in mentions. Some cross-pollination to adjacent niches. |
| 5 | Stable volume. Consistent conversation level without significant growth or decline. |
| 4 | Slowing down. Volume peaked recently and is beginning to decline. |
| 3 | Declining. Noticeably fewer new tweets than 24 hours ago. |
| 2 | Fading. Only sporadic mentions. The conversation has largely moved on. |
| 1 | Dead or dormant. No meaningful new conversation activity. |

### Measurement in Live Mode

Calculate velocity using tweet volume over time:

```
Velocity Ratio = (tweets in last 6 hours) / (tweets in previous 6 hours)

Velocity Ratio -> Score Mapping:
  > 5.0  -> 10
  3.0-5.0 -> 9
  2.0-3.0 -> 8
  1.5-2.0 -> 7
  1.2-1.5 -> 6
  0.8-1.2 -> 5
  0.5-0.8 -> 4
  0.3-0.5 -> 3
  0.1-0.3 -> 2
  < 0.1   -> 1
```

Also check for KOL amplification:
- If 3+ accounts with 50K+ followers tweeted about this topic in the last 12 hours, add +1 to velocity score (cap at 10)
- If the topic is trending on X's Explore page, automatic score of 9+

### Measurement in Offline Mode

For offline velocity estimation:
- Perennial topics (AI/LLMs, career): default velocity 5 (steady)
- Topics tied to an event happening TODAY: velocity 8-9
- Topics tied to an event happening THIS WEEK: velocity 7
- Topics tied to an event happening THIS MONTH: velocity 5-6
- Topics with no specific timing trigger: velocity 3-4

---

## Dimension 3: Engagement Density (Weight: 25%)

Engagement density measures the average engagement per tweet on a topic. High density means the audience is actively interacting with content on this topic, not just scrolling past. This is the strongest signal that YOUR content on this topic will also perform well.

### Scoring Rubric

| Score | Average Engagement per Tweet (likes + retweets + replies) |
|-------|----------------------------------------------------------|
| 10 | 1000+ average engagement per tweet |
| 9 | 500-999 average engagement |
| 8 | 200-499 average engagement |
| 7 | 100-199 average engagement |
| 6 | 50-99 average engagement |
| 5 | 25-49 average engagement |
| 4 | 10-24 average engagement |
| 3 | 5-9 average engagement |
| 2 | 2-4 average engagement |
| 1 | 0-1 average engagement |

### Measurement in Live Mode

1. Search for the topic keyword, sorted by recency
2. Pull the 20 most recent tweets on the topic
3. For each tweet, sum likes + retweets + replies
4. Calculate the median (not mean, to avoid outlier skew from viral tweets)
5. Map the median to the scoring rubric above

**Engagement Quality Signals:**
- Reply-to-like ratio > 0.3: Topic drives debate (great for growth)
- Retweet-to-like ratio > 0.2: Topic has high shareability
- Bookmark-to-like ratio > 0.1: Topic has reference value (great for authority building)

### Measurement in Offline Mode

Use historical engagement baselines by topic category:

| Category | Typical Engagement Density Score |
|----------|--------------------------------|
| AI/LLM announcements | 8-9 |
| Framework debates | 7-8 |
| Career/salary posts | 7-8 |
| Security incidents | 7-9 (during incident) |
| Developer productivity | 5-6 |
| Open source | 4-6 |
| Build in public | 5-7 |
| Developer humor | 6-8 |
| Holy wars | 8-9 |
| Testing/QA | 4-5 |
| Database topics | 4-5 |
| DevOps/Cloud | 5-6 |

---

## Dimension 4: Niche Relevance (Weight: 20%)

Niche relevance measures how closely a topic aligns with the user's stated niche or, if no niche is specified, the general software developer audience.

### Scoring Rubric (When User Specifies a Niche)

| Score | Criteria |
|-------|----------|
| 10 | Directly within the user's core niche. Example: "React Server Components" for a React developer. |
| 9 | Closely related to the user's niche. Example: "TypeScript 6.0 release" for a React developer. |
| 8 | Adjacent technology. Example: "Vercel pricing change" for a React developer. |
| 7 | Same domain. Example: "CSS Container Queries" for a React developer. |
| 6 | Related discipline. Example: "Frontend testing best practices" for a React developer. |
| 5 | General developer interest that overlaps. Example: "AI coding tools" for a React developer. |
| 4 | Developer-relevant but not niche-specific. Example: "Tech layoffs" for a React developer. |
| 3 | Tangentially related. Example: "Rust performance benchmarks" for a React developer. |
| 2 | Different domain. Example: "Kubernetes 2.0" for a React developer. |
| 1 | Unrelated to the user's niche. Example: "Mobile app design trends" for a backend Go developer. |

### Scoring Rubric (General Developer Audience)

When no niche is specified, score based on breadth of developer appeal:

| Score | Criteria |
|-------|----------|
| 10 | Universally relevant to all developers (career advice, industry news). |
| 9 | Relevant to 80%+ of developers (AI tools, productivity). |
| 8 | Relevant to 60%+ of developers (popular framework updates). |
| 7 | Relevant to 40%+ of developers (specific language news). |
| 6 | Relevant to 20%+ of developers (niche framework or tool). |
| 5 | Relevant to 10%+ of developers. |
| 4 | Relevant to a small but engaged community. |
| 3 | Niche interest with limited cross-appeal. |
| 2 | Very narrow audience. |
| 1 | Not meaningfully relevant to developers. |

---

## Worked Example: Scoring "React Server Components"

Let us walk through scoring "React Server Components" as a trending topic for a frontend developer.

**Context**: It is mid-April 2026. React has recently released an update to Server Components with new streaming capabilities. Several prominent React developers have posted threads about the changes.

### Recency: 7/10

The update was announced 2 days ago. There is growing awareness and discussion, but the initial wave of "breaking news" posts has passed. Room exists for deeper analysis, tutorials, and opinion pieces. Scoring 7 because the topic is 1-2 days old with ongoing conversation.

### Velocity: 7/10

Tweet volume has roughly doubled compared to the same period last week. Multiple KOLs (Dan Abramov, Lee Robinson, Kent C. Dodds) have posted about it. The conversation is spreading from React-specific accounts to general frontend accounts. Not exponential growth, but steady and strong.

### Engagement Density: 8/10

A sample of recent tweets on this topic shows a median engagement of approximately 250 (likes + retweets + replies). Several tutorial threads have crossed 1000 engagements. The reply-to-like ratio is 0.25, indicating active discussion. The bookmark-to-like ratio is 0.12, indicating the audience wants to save technical content for later.

### Niche Relevance: 10/10

For a frontend developer, React Server Components is directly within their core niche. This is the highest possible relevance score.

### Composite Score

```
Trend Score = (7 * 0.30) + (7 * 0.25) + (8 * 0.25) + (10 * 0.20)
            = 2.10 + 1.75 + 2.00 + 2.00
            = 7.85
```

**Result: 7.9/10** — Strong trend. This is a prime content opportunity for a frontend developer. Recommend creating content within the next 24-48 hours. Best angles: tutorial (high save potential), hot take on whether RSC is the right approach (high reply potential), or comparison with alternative approaches like HTMX (high share potential).

---

## Applying Scores to Content Decisions

Once topics are scored, use the following decision matrix:

| Score Range | Action | Content Type | Urgency |
|-------------|--------|--------------|---------|
| 8.0-10.0 | Create content NOW | Quick take, thread, or live reaction | Post within 6 hours |
| 6.0-7.9 | Schedule content | Planned thread, tutorial, or opinion piece | Post within 48 hours |
| 4.0-5.9 | Add to calendar | Scheduled content for a slow day | Post within 1 week |
| 2.0-3.9 | Monitor only | Bookmark for potential future spike | No immediate action |
| 1.0-1.9 | Skip | Not worth covering unless it spikes | No action |

**Special Cases:**
- A topic scoring 4.0 overall but 9+ on niche relevance should be treated as a 6.0+ for your specific audience
- A topic scoring 8.0+ that is declining in velocity (score 3 or below) is in the "last call" window — post quickly or skip entirely
- Evergreen topics with a 5.0 score can be posted at any time and are ideal for filling slow days in the content calendar
