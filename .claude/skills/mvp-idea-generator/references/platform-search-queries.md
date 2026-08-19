# Platform Search Query Templates

Replace `{niche}` with the user's specified niche. If no niche provided, use broad terms like "SaaS", "software", "tool", "app".
Replace `{year}` with current and previous year (e.g., "2025 2026").

---

## Reddit (8 queries)

```
1. site:reddit.com/r/SaaS OR site:reddit.com/r/startups "I wish there was" OR "someone should build" OR "why isn't there" {niche}
2. site:reddit.com/r/Entrepreneur OR site:reddit.com/r/smallbusiness "frustrating" OR "pain point" OR "waste of time" {niche} software tool
3. site:reddit.com/r/selfhosted OR site:reddit.com/r/webdev "looking for" OR "alternative to" OR "replacement for" {niche}
4. site:reddit.com "I'd pay for" OR "shut up and take my money" OR "take my money" {niche} tool software app
5. site:reddit.com "switched from" OR "migrated from" OR "left because" {niche} SaaS software
6. site:reddit.com/r/SaaS "MRR" OR "revenue" OR "launched" {niche} {year}
7. site:reddit.com "too expensive" OR "overpriced" OR "cheaper alternative" {niche} software SaaS
8. site:reddit.com "workflow" OR "automation" OR "manual process" "hate" OR "tedious" OR "time-consuming" {niche}
```

## Hacker News (6 queries)

```
1. site:news.ycombinator.com "Ask HN" "looking for" OR "recommendation" OR "alternative" {niche}
2. site:news.ycombinator.com "Ask HN" "frustrated" OR "pain point" OR "problem" {niche}
3. site:news.ycombinator.com "Show HN" {niche} {year}
4. site:news.ycombinator.com "Tell HN" OR "Ask HN" "I built" OR "launched" {niche} {year}
5. site:news.ycombinator.com "I'd pay" OR "willing to pay" OR "need a tool" {niche}
6. site:news.ycombinator.com "broken" OR "terrible" OR "sucks" {niche} software tool
```

## X / Twitter (5 queries)

```
1. site:twitter.com OR site:x.com "someone should build" OR "someone needs to build" {niche}
2. site:twitter.com OR site:x.com "I'd pay" OR "shut up and take my money" {niche} tool software
3. site:twitter.com OR site:x.com "why is there no" OR "why isn't there" {niche} app tool
4. site:twitter.com OR site:x.com "hate using" OR "frustrated with" OR "terrible UX" {niche}
5. site:twitter.com OR site:x.com "building" OR "launched" OR "just shipped" {niche} "MRR" OR "revenue" OR "customers" {year}
```

## ProductHunt (4 queries)

```
1. site:producthunt.com {niche} launched {year}
2. site:producthunt.com {niche} "alternative to" OR "better than"
3. site:producthunt.com {niche} top voted upvotes
4. producthunt.com {niche} tools trending new
```

## IndieHackers (4 queries)

```
1. site:indiehackers.com {niche} "revenue" OR "MRR" OR "$" {year}
2. site:indiehackers.com "problem" OR "pain point" OR "idea validation" {niche}
3. site:indiehackers.com "launched" OR "first customer" OR "first sale" {niche} {year}
4. site:indiehackers.com "failed" OR "lessons learned" OR "shut down" {niche}
```

## G2 & TrustPilot (4 queries)

```
1. site:g2.com {niche} reviews "missing feature" OR "wish it had" OR "doesn't have" OR "lacks"
2. site:g2.com {niche} "worst thing" OR "dislike" OR "cons" OR "switched to"
3. site:trustpilot.com {niche} software "terrible" OR "avoid" OR "frustrating" OR "waste"
4. {niche} software reviews "1 star" OR "poor support" OR "overpriced" OR "buggy"
```

## GitHub (4 queries)

```
1. site:github.com {niche} "help wanted" OR "good first issue" OR "feature request" stars
2. site:github.com {niche} issues "feature request" OR "enhancement" most commented
3. github trending {niche} repositories {year}
4. site:github.com {niche} awesome-list OR "awesome {niche}" curated list
```

## LinkedIn (3 queries)

```
1. site:linkedin.com "pain point" OR "challenge" OR "struggling with" {niche} workflow process
2. site:linkedin.com "looking for a tool" OR "need a solution" OR "anyone know" {niche}
3. site:linkedin.com "built" OR "launched" OR "startup" {niche} B2B SaaS {year}
```

## General Cross-Platform (3 queries)

```
1. "I wish there was a tool" OR "someone should build" OR "why doesn't exist" {niche} {year}
2. "{niche}" "market size" OR "TAM" OR "growing market" OR "billion dollar" SaaS
3. "{niche}" startup "raised" OR "funding" OR "seed round" OR "YC" {year}
```

---

## Usage Notes

- Execute queries in batches of 3-5 to avoid overwhelming results
- Prioritize Reddit, HN, and X queries first (highest signal-to-noise for pain discovery)
- Use G2/TrustPilot queries specifically in Phase 3 (market validation) to assess competitor weaknesses
- GitHub queries help identify what developers are already trying to build (demand signal)
- LinkedIn queries are best for B2B pain points and enterprise needs
- If a query returns no results, broaden the niche terms or remove the site: restriction
- Always check the date of results — prioritize content from the last 12 months
