# Post Creator

> Create complete, ready-to-publish single tweets from a topic or rough idea with multiple format variants.

## Usage

```
/x-post [topic or rough idea]
```

## What It Does

Takes any topic or rough idea and produces 3 complete, ready-to-publish tweet variants. Each variant uses a different format (Value Bomb, Hot Take, Storytelling, Question, Code Snippet, Announcement, or Meme). Every tweet is scored 0-100 across 6 dimensions and ranked by total score. Includes optimal posting time recommendation.

## Example

```
/x-post "TypeScript generics are underrated"

1. [Score: 81/100] Value Bomb
   "TypeScript generics saved me 200 lines of code yesterday.
   
   Instead of 5 nearly-identical functions, I wrote one.
   Type inference did the rest.
   
   The trick? Start with `<T extends Record<string, unknown>>`
   and narrow from there."

2. [Score: 76/100] Hot Take
   ...

3. [Score: 72/100] Question Hook
   ...
```

## Dependencies

- `viral-hook-generator` — uses hook patterns for openers
- `engagement-prediction` — uses scoring logic
- `posting-schedule` — references for timing recommendations
