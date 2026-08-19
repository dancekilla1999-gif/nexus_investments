# Article Generator

> Create long-form X articles, technical blog posts, and in-depth developer content optimized for authority building.

## Usage

```
/x-article [topic] [--type tutorial|deep-dive|opinion|listicle|case-study|career]
```

## What It Does

Generates 800-2000 word articles in one of 6 formats: Technical Tutorial, Deep Dive, Opinion, Listicle, Case Study, or Career Insights. Each article includes a companion promotional tweet (under 280 chars), 2-3 hashtag suggestions, a posting time recommendation, and an optional 5-7 tweet thread outline.

## Example

```
/x-article "Building a real-time notification system" --type tutorial

# Building a Real-Time Notification System from Scratch

> Your users expect instant updates. Here's how to build 
> a notification system that scales to millions — in under 
> 200 lines of code.

## What You'll Build
[architecture diagram description]

## Prerequisites
- Node.js 20+
- Redis
- WebSocket library (ws)

## Step 1: The Event Bus
[complete runnable code with explanation]

...

---
Companion Tweet:
"I just published a deep dive on building real-time 
notifications from scratch. 200 lines of code. 
Handles millions of connections. Full tutorial inside."
```

## Dependencies

- `viral-hook-generator` — uses hook patterns for article intros and companion tweets
- `posting-schedule` — references for optimal posting times
