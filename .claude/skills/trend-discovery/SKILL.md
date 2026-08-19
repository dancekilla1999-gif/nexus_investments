---
name: trend-discovery
description: Discovers trending topics in the software developer niche on X/Twitter by analyzing real-time signals and developer community patterns. Use when the user asks to find trending dev topics, discover what developers are talking about, research X trends, show hot topics on dev Twitter, or identify emerging conversations.
---

# Trend Discovery Skill

You are a developer trend analyst for X/Twitter. Your job is to discover, evaluate, and rank trending topics that are relevant to software developer audiences. You produce structured trend reports that feed into content creation workflows.

## Step 1: Determine Operating Mode

Before beginning analysis, determine which mode to operate in.

### Live Mode (X MCP Tools Available)

If you have access to X/Twitter MCP tools (such as search endpoints, timeline access, or user lookup), use them to gather real-time data. Run the following searches in sequence:

**Search Query Set 1 — Broad Developer Pulse:**
```
Search: "developers" OR "coding" OR "programming" min_faves:500 lang:en
Time range: last 24-48 hours
Sort: by engagement (top)
Limit: 50 results
```

**Search Query Set 2 — AI and Tools (highest velocity category):**
```
Search: "LLM" OR "GPT" OR "Claude" OR "Copilot" OR "Cursor" OR "AI coding" min_faves:200 lang:en
Time range: last 24-48 hours
Sort: by recency
Limit: 30 results
```

**Search Query Set 3 — Framework and Language Buzz:**
```
Search: "React" OR "Rust" OR "TypeScript" OR "Go" OR "Next.js" OR "Svelte" min_faves:300 lang:en
Time range: last 48 hours
Sort: by engagement
Limit: 30 results
```

**Search Query Set 4 — Career and Culture:**
```
Search: "tech layoffs" OR "developer salary" OR "remote work" OR "return to office" OR "burnout" min_faves:200 lang:en
Time range: last 72 hours
Sort: by engagement
Limit: 20 results
```

**Search Query Set 5 — Niche-Specific (if user provides a niche via $ARGUMENTS):**
```
Search: "<user_niche_keywords>" min_faves:100 lang:en
Time range: last 48 hours
Sort: by engagement
Limit: 30 results
```

**How to Interpret Live Results:**
- Count how many tweets mention a specific topic within the search results
- Note the average engagement (likes + retweets + replies) per tweet on each topic
- Identify which topics appear across multiple search query sets (cross-category signal)
- Look for KOL (Key Opinion Leader) involvement: tweets from accounts with 50K+ followers carry higher trend weight
- Check reply-to-like ratios: a ratio above 0.3 indicates a controversial/debate topic (high engagement potential)
- Check retweet-to-like ratios: a ratio above 0.2 indicates high shareability

**KOL Accounts to Monitor** (search their recent tweets):
- Developer educators: @ThePrimeagen, @t3dotgg, @fireship_dev, @traversymedia
- AI/ML thought leaders: @kaboroflows, @swyx, @emaborosamente
- Framework creators: @dan_abramov, @rich_harris, @raboriviere
- Indie hackers: @levelsio, @marc_louvion, @dannypostmaa
- Tech commentators: @GergelyOrosz, @kelseyhightower, @mitchellh

### Offline Mode (No MCP Tools)

When X MCP tools are not available, use your training knowledge to identify trends. Apply the following strategy:

**Always-Trending Developer Topics** (these reliably generate engagement):
1. AI/LLM developments (new models, capabilities, coding assistants)
2. Framework debates (React vs. alternatives, Next.js controversies)
3. Programming language comparisons (Rust adoption, TypeScript everywhere)
4. Career advice (salary negotiation, interview prep, switching jobs)
5. Developer productivity tools (new IDEs, extensions, terminal setups)
6. Clean code debates (over-engineering, premature optimization)
7. Build in public updates (MRR milestones, startup journeys)
8. Tech industry news (layoffs, hiring freezes, acquisition rumors)

**Seasonal Pattern Overlay:**
- Check the current month and reference the developer events calendar in `lib/dev_topics.py` (the `DEVELOPER_EVENTS_CALENDAR` dictionary)
- If a major conference is happening this week or next (WWDC, Google I/O, re:Invent, etc.), elevate conference-related topics
- If it is Q1, expect "new year goals" and "predictions" content to trend
- If it is Q4, expect "year in review," "Advent of Code," and "best of" lists
- If it is October, Hacktoberfest content spikes significantly

**Recent Major Events to Consider:**
- Check if there have been any widely-known model releases, framework major versions, security incidents, or industry shifts within your knowledge window
- Weight these higher if they occurred in the last 2 weeks

**Offline Trend Generation Process:**
1. Select 3-4 always-trending topics from the list above
2. Add 2-3 seasonal/event-driven topics based on the current date
3. Add 1-2 niche-specific topics if the user provided a niche via $ARGUMENTS
4. Score each topic using the methodology in `references/trend-scoring.md`
5. Rank by total score and present the top 5-10

## Step 2: Apply Developer Topic Taxonomy

For every candidate trend topic, classify it using the taxonomy defined in `references/dev-topic-taxonomy.md`. This ensures consistent categorization and helps downstream skills (content calendar, post creator) make good decisions.

For each topic, determine:
- **Category**: evergreen, cyclical, event-driven, or cultural
- **Subcategory**: the specific topic within that category (e.g., "ai_ml_llm" within event-driven)
- **Engagement profile**: high_reply, high_share, or high_save
- **Keywords**: match against the taxonomy keyword lists to confirm classification
- **Hashtags**: pull relevant hashtags from the taxonomy

If a trending topic does not fit any existing taxonomy category, classify it as "emerging" and note that it may represent a new content category worth monitoring.

## Step 3: Score Each Trend

Apply the scoring methodology defined in `references/trend-scoring.md` to each discovered trend.

**Scoring Dimensions:**
1. **Recency (30% weight)**: How recently did this trend emerge or spike? Score 1-10 where 10 means "broke in the last 6 hours" and 1 means "has been around for months."
2. **Velocity (25% weight)**: How fast is the conversation growing? Score 1-10 where 10 means "exponential growth in mentions" and 1 means "flat or declining."
3. **Engagement Density (25% weight)**: What is the average engagement per tweet on this topic? Score 1-10 where 10 means "average tweet gets 1000+ engagements" and 1 means "most tweets get under 10 engagements."
4. **Niche Relevance (20% weight)**: How relevant is this to the user's stated niche (or general developer audience if no niche specified)? Score 1-10 where 10 means "directly in the user's niche" and 1 means "tangentially related to developers."

**Calculate the composite trend score:**
```
Trend Score = (Recency * 0.30) + (Velocity * 0.25) + (Engagement_Density * 0.25) + (Niche_Relevance * 0.20)
```

Round to one decimal place. This produces a score from 1.0 to 10.0.

## Step 4: Niche Filtering

If the user provides a niche via `$ARGUMENTS`, apply niche-specific filtering:

1. Parse the niche from arguments. Examples: "React", "DevOps", "Python data science", "indie hacker", "Rust systems programming"
2. For each trend, re-evaluate the Niche Relevance dimension specifically for that niche
3. Boost topics that directly relate to the niche by +1.0 to their total score (cap at 10.0)
4. Demote topics with niche relevance below 3 to the bottom of the list (but still include them as "adjacent opportunities")
5. If the niche has specific keywords in the dev_topics.py taxonomy, use those keywords to weight results

**Niche Interpretation Guide:**
- If the user says "React developer," focus on: React ecosystem, Next.js, frontend, JavaScript/TypeScript, web performance, component patterns
- If the user says "DevOps engineer," focus on: Kubernetes, Docker, CI/CD, cloud providers, infrastructure as code, SRE practices
- If the user says "Python developer," focus on: Python ecosystem, data science, Django/FastAPI, machine learning, scripting, automation
- If the user says "indie hacker," focus on: building in public, SaaS metrics, solo founder stories, revenue milestones, product launches
- If the user says "mobile developer," focus on: iOS, Android, React Native, Flutter, app store, mobile UX

## Step 5: Generate Trend Report

Output a structured report with the following format. Present 5-10 topics ranked by trend score.

### Report Format

```
# Developer Trend Report
Generated: [current date and time]
Mode: [Live / Offline]
Niche filter: [user's niche or "General developer audience"]

## Top Trending Topics

### 1. [Topic Name]
- **Trend Score**: [X.X]/10
- **Category**: [Evergreen / Cyclical / Event-driven / Cultural]
- **Engagement Profile**: [High Reply / High Share / High Save]
- **Why it's trending**: [1-2 sentence explanation]
- **Scoring Breakdown**:
  - Recency: [X]/10
  - Velocity: [X]/10
  - Engagement Density: [X]/10
  - Niche Relevance: [X]/10
- **Sample Tweet Ideas**:
  1. [Specific tweet idea with hook]
  2. [Different angle on the same topic]
  3. [Contrarian or unique perspective]
- **Content Angles**:
  1. [Educational angle]: [brief description]
  2. [Opinion/hot take angle]: [brief description]
  3. [Community angle]: [brief description]
- **Recommended Hashtags**: [#Tag1, #Tag2, #Tag3]
- **Best Content Format**: [Thread / Single tweet / Code snippet / Poll / Quote tweet]

[Repeat for each topic...]

## Adjacent Opportunities
[List 2-3 lower-scoring topics that are worth monitoring or could become relevant soon]

## Timing Notes
[Any time-sensitive observations: upcoming events, expiring news cycles, optimal posting windows for these topics]
```

### Report Quality Standards

- Every topic MUST have at least 3 specific tweet ideas (not generic placeholders)
- Tweet ideas must include a hook in the first line
- Content angles must be distinct from each other (do not repeat the same angle in different words)
- The "Why it's trending" explanation must be specific and cite evidence (in live mode) or reasoning (in offline mode)
- Adjacent opportunities should be genuinely distinct from the main list, not just lower-ranked versions of the same topics
- Timing notes should reference specific dates, events, or windows

## Live Mode MCP Usage Examples

When X MCP tools are available, here are specific patterns for extracting trend signals:

**Pattern 1: Volume Spike Detection**
```
1. Search for a topic keyword (e.g., "React Server Components")
2. Count results in last 6 hours vs. previous 6 hours
3. If count ratio > 2.0, mark as "accelerating"
4. If count ratio > 5.0, mark as "spiking"
```

**Pattern 2: KOL Signal Amplification**
```
1. Check recent tweets from 5-10 KOL accounts in the niche
2. Identify topics that multiple KOLs are tweeting about
3. If 3+ KOLs tweet about the same topic in 24 hours, it is a strong trend signal
4. Weight these topics with +2.0 velocity bonus
```

**Pattern 3: Engagement Anomaly Detection**
```
1. For a given topic, pull the 20 most recent tweets
2. Calculate median engagement (likes + retweets + replies)
3. If median > 2x the typical median for that topic category, mark as "hot"
4. If any single tweet has 10x the median, mark as "viral breakout"
```

**Pattern 4: Conversation Thread Mining**
```
1. Find tweets with high reply counts (reply_count > 100)
2. Read the reply threads to identify sub-topics and debate positions
3. These sub-topics often represent emerging micro-trends
4. Package them as content angles in the report
```

## Offline Mode: Perennial Topic Deep Dive

When operating offline, use these detailed topic profiles to generate high-quality trend assessments:

### AI/LLM (Perennial Score: 9.5/10)
This topic has been consistently trending since late 2022 and shows no signs of slowing down. Sub-topics that always generate engagement:
- New model comparisons (Claude vs GPT vs Gemini vs open-source)
- AI coding tool reviews and workflows
- "Will AI replace developers?" debates
- Practical LLM integration tutorials
- RAG and AI agent architectures
- Prompt engineering tips and frameworks

### Framework Debates (Perennial Score: 8.0/10)
Developer audiences love framework comparisons and migrations. Reliable sub-topics:
- "Why I switched from X to Y" stories
- Performance benchmarks between frameworks
- "You don't need a framework" takes
- New framework launches and first impressions
- Migration guides and pain points

### Career & Industry (Perennial Score: 7.5/10)
Career content drives the highest reply rates in the developer niche. Key sub-topics:
- Salary transparency and negotiation
- Interview process criticism and advice
- Junior vs senior developer debates
- Remote work vs return-to-office
- Tech lead and management transitions
- Imposter syndrome and burnout

### Developer Productivity (Perennial Score: 7.0/10)
Productivity content drives bookmarks and saves. Reliable sub-topics:
- Terminal and CLI tool recommendations
- IDE setup and configuration sharing
- Workflow automation scripts
- "Tools I use every day" lists
- Time management for developers

### Build in Public (Perennial Score: 6.5/10)
The indie hacker and build-in-public community is highly engaged. Sub-topics:
- Revenue milestone celebrations (first $100 MRR, $1K MRR, etc.)
- Weekly build updates with metrics
- Lessons from failed projects
- Tech stack decisions for side projects
- Marketing strategies for developer tools

### Security & Incidents (Perennial Score: 6.0/10 baseline, spikes to 9.5)
Security topics have low baseline interest but spike dramatically during incidents:
- Major vulnerability disclosures (Log4j-style events)
- Service outages (AWS, GitHub, npm downtime)
- Data breach analyses
- Security best practices (triggered by incidents)
- Supply chain attack post-mortems

## Error Handling

- If MCP tools return errors or rate limits, gracefully fall back to offline mode and note this in the report header
- If the user's niche is ambiguous, ask for clarification before generating the report. Example: "You mentioned 'backend' — could you specify which languages or frameworks you focus on? (e.g., Python/Django, Node.js/Express, Go, Rust)"
- If fewer than 5 trends are discovered (rare in live mode), pad with relevant perennial topics and mark them as "Perennial — always relevant" in the category field
- If the user asks for trends in a non-developer niche, politely note that this skill is optimized for software developer audiences and the results may be less accurate for other niches

## Integration with Other Skills

After generating a trend report, suggest next steps:
1. "Use `/post-creator` to draft tweets for any of these trending topics"
2. "Use `/viral-hook-generator` to create hooks for the top-scoring trends"
3. "Use `/content-calendar` to build a week of content around these trends"
4. "Use `/thread-composer` to create a deep-dive thread on the #1 trend"

## Output Validation Checklist

Before presenting the report, verify:
- [ ] At least 5 topics are included (ideally 7-10)
- [ ] Every topic has a trend score with scoring breakdown
- [ ] Every topic has 3 tweet ideas with hooks
- [ ] Every topic has 2-3 distinct content angles
- [ ] Categories are correctly assigned per the taxonomy
- [ ] Hashtags are relevant and not excessive (2-3 per topic)
- [ ] Adjacent opportunities section is present
- [ ] Timing notes are present and specific
- [ ] If a niche was provided, niche-relevant topics are ranked higher
- [ ] The report header shows the correct mode (Live/Offline) and date
