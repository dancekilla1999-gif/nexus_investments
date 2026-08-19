"""
Content Calendar Generator

Helper script for generating structured weekly content calendars
based on niche, follower count, and growth goals.

Used by: Content Calendar (Skill 9)
"""

from typing import Any
from datetime import datetime, timedelta


# Weekly cadence template
WEEKLY_CADENCE = {
    0: {"type": "Thread", "pillar": "Educational", "time": "8:30 AM ET"},
    1: {"type": "Hot take", "pillar": "Thought Leadership", "time": "12:15 PM ET"},
    2: {"type": "Code tip", "pillar": "Educational", "time": "8:00 AM ET"},
    3: {"type": "Build in public", "pillar": "Building in Public", "time": "5:30 PM ET"},
    4: {"type": "Community", "pillar": "Community", "time": "9:00 AM ET"},
    5: {"type": "Story", "pillar": "Personal", "time": "10:00 AM ET"},
    6: {"type": "Rest", "pillar": "—", "time": "—"},
}

# Growth stage adaptations
STAGE_CONFIG = {
    "0-1K": {
        "daily_replies": 20,
        "reply_target_range": "5K-50K followers",
        "original_content_pct": 30,
        "reply_pct": 70,
        "thread_length": "5-7 tweets",
        "weekly_impressions_target": "5K-15K",
        "weekly_follower_target": "25-75",
    },
    "1K-10K": {
        "daily_replies": 10,
        "reply_target_range": "10K-100K followers",
        "original_content_pct": 60,
        "reply_pct": 40,
        "thread_length": "8-12 tweets",
        "weekly_impressions_target": "30K-100K",
        "weekly_follower_target": "125-500",
    },
    "10K-50K": {
        "daily_replies": 5,
        "reply_target_range": "50K+ followers",
        "original_content_pct": 80,
        "reply_pct": 20,
        "thread_length": "10-15 tweets",
        "weekly_impressions_target": "150K-500K",
        "weekly_follower_target": "500-1250",
    },
    "50K+": {
        "daily_replies": 3,
        "reply_target_range": "selective",
        "original_content_pct": 90,
        "reply_pct": 10,
        "thread_length": "10-15 tweets",
        "weekly_impressions_target": "500K-2M",
        "weekly_follower_target": "1250+",
    },
}

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def get_growth_stage(followers: int) -> str:
    """Determine growth stage from follower count."""
    if followers < 1000:
        return "0-1K"
    elif followers < 10000:
        return "1K-10K"
    elif followers < 50000:
        return "10K-50K"
    else:
        return "50K+"


def generate_calendar(
    niche: str,
    followers: int,
    goals: list[str] | None = None,
) -> dict[str, Any]:
    """
    Generate a 7-day content calendar.

    Args:
        niche: Developer niche (e.g., "React", "DevOps")
        followers: Current follower count
        goals: List of growth goals

    Returns:
        Dictionary with calendar, targets, and stage info
    """
    stage = get_growth_stage(followers)
    config = STAGE_CONFIG[stage]

    # Generate calendar for next 7 days starting from next Monday
    today = datetime.now()
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    start_date = today + timedelta(days=days_until_monday)

    calendar = []
    for i in range(7):
        day_date = start_date + timedelta(days=i)
        cadence = WEEKLY_CADENCE[i]

        calendar.append({
            "day": DAY_NAMES[i],
            "date": day_date.strftime("%Y-%m-%d"),
            "type": cadence["type"],
            "pillar": cadence["pillar"],
            "time": cadence["time"],
            "topic": f"[{niche}-related topic]",
            "hook": f"[Generate using viral-hook-generator for {niche}]",
        })

    return {
        "niche": niche,
        "followers": followers,
        "stage": stage,
        "goals": goals or ["grow followers", "build authority"],
        "config": config,
        "calendar": calendar,
        "daily_targets": {
            "replies": config["daily_replies"],
            "reply_target_range": config["reply_target_range"],
            "original_tweets": 1 if stage == "0-1K" else 2,
        },
        "weekly_goals": {
            "impressions": config["weekly_impressions_target"],
            "new_followers": config["weekly_follower_target"],
            "thread_length": config["thread_length"],
        },
    }


if __name__ == "__main__":
    # Sample usage
    result = generate_calendar(
        niche="React",
        followers=500,
        goals=["grow to 1K", "establish as React expert"],
    )

    print(f"Niche: {result['niche']}")
    print(f"Stage: {result['stage']} ({result['followers']} followers)")
    print(f"Goals: {', '.join(result['goals'])}")
    print()
    print("Weekly Calendar:")
    print("-" * 80)
    for day in result["calendar"]:
        print(f"  {day['day']:10s} | {day['type']:18s} | {day['pillar']:20s} | {day['time']}")
    print()
    print(f"Daily: Reply to {result['daily_targets']['replies']} tweets from {result['daily_targets']['reply_target_range']}")
    print(f"Weekly impressions target: {result['weekly_goals']['impressions']}")
    print(f"Weekly follower target: {result['weekly_goals']['new_followers']}")
