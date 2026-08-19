#!/usr/bin/env python3
"""
Score a tweet draft for algorithmic optimization.

Usage:
    python score_tweet.py "Your tweet text here"
    python score_tweet.py "Your tweet text here" 5000
    python score_tweet.py --json "Your tweet text here"

Arguments:
    tweet_text       The tweet text to analyze
    follower_count   Optional follower count for impression estimates (default: 1000)
    --json           Output only JSON (no human-readable scorecard)
    --compare        Compare multiple tweets: score_tweet.py --compare "tweet1" "tweet2" "tweet3"
"""

import sys
import json
from pathlib import Path

# Add the shared lib directory to the Python path
lib_dir = str(Path(__file__).resolve().parent.parent.parent.parent / "lib")
sys.path.insert(0, lib_dir)

from algorithm_weights import analyze_tweet, format_scorecard


def print_usage():
    """Print usage information."""
    print("Tweet Scoring Tool — X Content Intelligence Plugin")
    print()
    print("Usage:")
    print('  python score_tweet.py "Your tweet text here"')
    print('  python score_tweet.py "Your tweet text here" 5000')
    print('  python score_tweet.py --json "Your tweet text here"')
    print('  python score_tweet.py --compare "tweet 1" "tweet 2" "tweet 3"')
    print()
    print("Arguments:")
    print("  tweet_text       The tweet text to analyze (required)")
    print("  follower_count   Follower count for impression estimates (default: 1000)")
    print("  --json           Output JSON only (no human-readable scorecard)")
    print("  --compare        Compare multiple tweets side by side")
    print("  --help           Show this help message")


def analysis_to_dict(analysis):
    """Convert a TweetAnalysis object to a dictionary."""
    return {
        "total_score": analysis.total_score,
        "hook_score": analysis.hook_score,
        "reply_score": analysis.reply_score,
        "share_score": analysis.share_score,
        "save_score": analysis.save_score,
        "algorithm_score": analysis.algorithm_score,
        "audience_score": analysis.audience_score,
        "char_count": analysis.char_count,
        "word_count": analysis.word_count,
        "has_question": analysis.has_question,
        "has_code": analysis.has_code,
        "has_link": analysis.has_link,
        "has_media_indicator": analysis.has_media_indicator,
        "has_list": analysis.has_list,
        "has_numbers": analysis.has_numbers,
        "hashtag_count": analysis.hashtag_count,
        "emoji_count": analysis.emoji_count,
        "mention_count": analysis.mention_count,
        "engagement_bait": analysis.engagement_bait,
        "improvements": analysis.improvements,
    }


def score_single(tweet_text, follower_count=1000, json_only=False):
    """Score a single tweet and print results."""
    analysis = analyze_tweet(tweet_text)

    if json_only:
        print(json.dumps(analysis_to_dict(analysis), indent=2))
    else:
        print(format_scorecard(analysis, follower_count))
        print()
        print("--- JSON ---")
        print(json.dumps(analysis_to_dict(analysis), indent=2))


def compare_tweets(tweets, follower_count=1000):
    """Compare multiple tweets side by side."""
    analyses = []
    for tweet in tweets:
        analyses.append((tweet, analyze_tweet(tweet)))

    # Sort by total score descending
    analyses.sort(key=lambda x: x[1].total_score, reverse=True)

    print("=" * 70)
    print("TWEET COMPARISON")
    print("=" * 70)
    print()

    for i, (tweet, analysis) in enumerate(analyses, 1):
        # Truncate tweet display to first 80 chars for readability
        display_text = tweet[:77] + "..." if len(tweet) > 80 else tweet
        display_text = display_text.replace("\n", " / ")

        rank_label = ""
        if i == 1:
            rank_label = " << BEST"

        print(f"#{i}{rank_label}")
        print(f"  Text: {display_text}")
        print(f"  Score: {analysis.total_score:.0f}/100")
        print(f"    Hook: {analysis.hook_score:.0f}/20 | "
              f"Reply: {analysis.reply_score:.0f}/20 | "
              f"Share: {analysis.share_score:.0f}/20 | "
              f"Save: {analysis.save_score:.0f}/15 | "
              f"Algo: {analysis.algorithm_score:.0f}/15 | "
              f"Audience: {analysis.audience_score:.0f}/10")

        if analysis.improvements:
            print(f"  Top improvement: {analysis.improvements[0]}")

        print()

    # Summary
    best = analyses[0]
    worst = analyses[-1]
    diff = best[1].total_score - worst[1].total_score

    print("-" * 70)
    print(f"Score range: {worst[1].total_score:.0f} - {best[1].total_score:.0f} "
          f"(spread: {diff:.0f} points)")

    if diff < 10:
        print("The tweets are similarly optimized. Differences are marginal.")
    elif diff < 25:
        print("Moderate optimization gap. The top tweet has meaningfully better signal coverage.")
    else:
        print("Large optimization gap. The top tweet is significantly better optimized.")

    # Output JSON for all
    print()
    print("--- JSON ---")
    results = []
    for tweet, analysis in analyses:
        result = analysis_to_dict(analysis)
        result["text"] = tweet
        results.append(result)
    print(json.dumps(results, indent=2))


def main():
    args = sys.argv[1:]

    if not args or "--help" in args or "-h" in args:
        print_usage()
        sys.exit(0 if "--help" in args or "-h" in args else 1)

    json_only = False
    compare_mode = False
    follower_count = 1000

    # Parse flags
    if "--json" in args:
        json_only = True
        args.remove("--json")

    if "--compare" in args:
        compare_mode = True
        args.remove("--compare")

    if not args:
        print("Error: No tweet text provided.")
        print()
        print_usage()
        sys.exit(1)

    if compare_mode:
        # All remaining args are tweets to compare
        compare_tweets(args, follower_count)
    else:
        tweet_text = args[0]

        # Check if a follower count was provided as the second argument
        if len(args) > 1:
            try:
                follower_count = int(args[1])
            except ValueError:
                # Not a number — might be a flag we did not handle
                pass

        score_single(tweet_text, follower_count, json_only)


if __name__ == "__main__":
    main()
