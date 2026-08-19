#!/usr/bin/env python3
"""
Engagement Prediction Engine

Predict engagement for a draft tweet using multi-dimensional scoring.
Uses the shared algorithm_weights scoring engine.

Usage:
    python predict_engagement.py "Your tweet text" [follower_count]
    python predict_engagement.py --json "Your tweet text"
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent / "lib"))
from algorithm_weights import TweetAnalysis, analyze_tweet, format_scorecard


def predict_engagement(text: str, follower_count: int = 1000) -> dict:
    """
    Predict engagement for a tweet draft.

    Args:
        text: The tweet text to analyze
        follower_count: Current follower count for impression estimates

    Returns:
        Dictionary with total_score, dimensions, improvements, and impression_range
    """
    analysis = analyze_tweet(text)

    # Calculate impression range
    base_rate = 0.10
    if analysis.total_score >= 80:
        mult = 5.0
    elif analysis.total_score >= 60:
        mult = 3.0
    elif analysis.total_score >= 40:
        mult = 1.5
    else:
        mult = 0.8

    base_imp = follower_count * base_rate * mult
    low = max(int(base_imp * 0.6), 50)
    high = max(int(base_imp * 1.8), low * 2)

    return {
        "total_score": round(analysis.total_score),
        "dimensions": {
            "hook_strength": {"score": round(analysis.hook_score), "max": 20},
            "reply_potential": {"score": round(analysis.reply_score), "max": 20},
            "share_potential": {"score": round(analysis.share_score), "max": 20},
            "save_potential": {"score": round(analysis.save_score), "max": 15},
            "algorithm_fit": {"score": round(analysis.algorithm_score), "max": 15},
            "audience_match": {"score": round(analysis.audience_score), "max": 10},
        },
        "improvements": analysis.improvements[:3],
        "impression_range": (low, high),
        "metadata": {
            "char_count": analysis.char_count,
            "word_count": analysis.word_count,
            "has_question": analysis.has_question,
            "has_code": analysis.has_code,
            "has_link": analysis.has_link,
            "hashtag_count": analysis.hashtag_count,
            "mention_count": analysis.mention_count,
            "engagement_bait": analysis.engagement_bait,
        },
    }


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print("Usage: python predict_engagement.py '<tweet text>' [follower_count]")
        print("       python predict_engagement.py --json '<tweet text>'")
        sys.exit(0)

    json_mode = "--json" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--json"]

    tweet_text = args[0]
    follower_count = int(args[1]) if len(args) > 1 else 1000

    if json_mode:
        result = predict_engagement(tweet_text, follower_count)
        print(json.dumps(result, indent=2))
    else:
        analysis = analyze_tweet(tweet_text)
        print(format_scorecard(analysis, follower_count))
