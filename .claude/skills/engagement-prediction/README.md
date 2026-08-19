# Engagement Prediction

> Score draft tweets and threads on a 0-100 scale with per-dimension breakdown and improvement suggestions.

## Usage

```
/x-score [draft tweet or thread]
```

## What It Does

Runs your draft through a multi-dimensional scoring engine based on X's algorithm signals. Scores across 6 dimensions: Hook Strength (0-20), Reply Potential (0-20), Share Potential (0-20), Save Potential (0-15), Algorithm Fit (0-15), and Audience Match (0-10). Provides estimated impression ranges and top 3 actionable improvements.

## Example

```
/x-score "Just learned about React Server Components. Pretty cool stuff!"

Score: 38/100 (Below Average)

Breakdown:
  Hook Strength:    6/20  — Generic opener, no curiosity gap
  Reply Potential:  5/20  — No question or debate trigger
  Share Potential:  8/20  — Low practical value for others
  Save Potential:   5/15  — Nothing to bookmark for later
  Algorithm Fit:    8/15  — Good length, no penalties
  Audience Match:   6/10  — Right topic, wrong angle

Estimated Impressions: 200-800

Top 3 Improvements:
1. Add a specific metric or result ("reduced bundle by 43%")
2. End with a question to drive replies
3. Lead with a contrarian angle or surprising insight
```

## Dependencies

None — foundational scoring skill used by post-creator.
