# MVP Idea Generator

> Research pain points across 9+ platforms to find high-potential MVP ideas targeting $10K+ MRR.

## Usage

```
/mvp-ideas [count] [niche]
```

## What It Does

Conducts deep internet research across Reddit, Hacker News, X/Twitter, ProductHunt, IndieHackers, G2, TrustPilot, GitHub, and LinkedIn to discover real pain points and unmet needs. Clusters findings into themes, validates against competitors, and synthesizes scored MVP ideas with complete business plans.

Each idea includes: pain points with real quotes, target persona, MVP features (3-5, ruthlessly scoped), pricing with competitor benchmarks, $10K MRR math, growth strategy with specific channels, month-by-month revenue path, risk assessment, and validation from similar successful products.

## Example

```
/mvp-ideas 3 developer tools

MVP Opportunity Research Report

Research scope: 9 platforms, 25+ queries
Ideas evaluated: 14 candidates

Top 3:
1. API Endpoint Monitor for Indie Devs (78/100)
   — $9/mo monitoring for side projects
   — Path: 400 customers × $25 avg = $10K MRR

2. PR Review Queue Manager (73/100)
   — Smart prioritization for teams of 5-20
   — Path: 130 customers × $79/mo = $10K MRR

3. Dependency Vulnerability Dashboard (68/100)
   — Aggregated alerts across all repos
   — Path: 100 customers × $99/mo = $10K MRR

[Each with full detailed report: 
 pain points, persona, features, pricing, 
 competition, growth, timeline, risks]
```

## Dependencies

None — standalone research skill. Uses WebSearch and WebFetch tools.

## Files

- `SKILL.md` — 5-phase research process
- `references/platform-search-queries.md` — Search query templates for 9 platforms
- `references/scoring-rubric.md` — 7-dimension scoring rubric (0-100)
- `references/revenue-models.md` — SaaS revenue model reference
- `references/report-template.md` — Report template with quality standards
- `examples/sample-report.md` — Complete worked example
