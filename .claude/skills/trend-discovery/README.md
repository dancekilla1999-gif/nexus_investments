# Trend Discovery

> Discover trending topics in the software developer niche on X/Twitter with scoring and content angle suggestions.

## Usage

```
/x-trends [niche focus]
```

## What It Does

Scans for trending developer topics and scores them on Recency (30%), Velocity (25%), Engagement Density (25%), and Niche Relevance (20%). For each trend, provides 3 specific tweet ideas with hooks, 2-3 content angles, recommended format, and relevant hashtags. Works in offline mode (Claude's knowledge) or live mode (with X API keys for real-time data).

## Example

```
/x-trends "frontend development"

1. [Score: 8.7] React 19 Compiler Deep Dives
   Category: Event-driven
   Why trending: RC release sparked debate on auto-memoization
   
   Tweet ideas:
   - "React 19's compiler just made useMemo obsolete. Here's proof."
   - "I tested React 19 compiler on our 200-component app..."
   - "The React team just mass-deleted 40% of their hooks docs."
   
   Angles: Tutorial, Hot Take, Benchmark Comparison
   Format: Thread (best) or Single Tweet
   Hashtags: #ReactJS #Frontend

2. [Score: 8.2] Bun vs Node.js Benchmarks
   ...
```

## Dependencies

None — standalone discovery skill. Suggests using post-creator and thread-composer for content creation on discovered trends.
