# Thread Composer

> Compose optimized multi-tweet threads with proven structures for developer audiences.

## Usage

```
/x-thread [topic + optional key points]
```

## What It Does

Generates 5-15 tweet threads using one of 5 proven architectures: Listicle, Story Arc, Tutorial, Case Study, or Comparison. Automatically selects the best architecture for your topic. Each tweet is validated under 280 characters, hooks use viral-hook-generator patterns, and the thread includes a CTA and self-reply for links.

## Example

```
/x-thread "How I reduced Docker build times by 80%"

Architecture: Case Study
Thread Score: 82/100

1/ Our Docker builds took 12 minutes.
   Deploys were a nightmare.
   
   Then I made 4 changes that cut it to 2 minutes.
   
   Here's exactly what I did: 🧵

2/ The problem wasn't Docker.
   It was our Dockerfile.
   
   Layer caching was completely broken because
   we copied package.json AFTER the source code.
   
   One line change: -40% build time.

[... 6 more tweets]

Self-reply: Links and resources mentioned in the thread
```

## Dependencies

- `viral-hook-generator` — uses hook patterns for the opening tweet
