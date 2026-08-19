# Posting Schedule

> Get optimal posting time recommendations for reaching software developer audiences on X/Twitter.

## Usage

```
/x-schedule [content type]
```

## What It Does

Recommends the best posting times based on content type, target timezone, and day of week. Built on developer audience activity patterns with 4 peak windows: Morning Scroll (8-9:30 AM ET), Lunch Break (12-1 PM ET), End-of-Work (5-6:30 PM ET), and Evening Scroll (9-10:30 PM ET). Includes day-of-week rankings and timezone adjustments for US, Europe, India/APAC, and global audiences.

## Example

```
/x-schedule "technical thread"

Best Posting Times for Technical Threads:

1. Tuesday 8:00-9:30 AM ET (Day: 9/10, Window: Pre-standup)
   — Developers scrolling before work, high attention span
   
2. Wednesday 8:00-9:30 AM ET (Day: 8/10, Window: Pre-standup)
   — Second-best day for deep content
   
3. Monday 8:00-9:30 AM ET (Day: 7/10, Window: Pre-standup)
   — Fresh week, receptive to learning content

Avoid: Friday afternoons, weekends (engagement drops 50-70%)
```

## Dependencies

None — foundational timing reference used by other skills.
