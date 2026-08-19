# X Algorithm Signals — Complete Taxonomy

This reference documents every known signal in X's recommendation algorithm, derived from
Twitter's open-source recommendation code (released March 2023) and subsequent community
analysis of algorithm behavior through controlled experiments.

## Overview of the Recommendation Pipeline

X's For You feed uses a multi-stage pipeline to select and rank tweets for each user.
Understanding each stage helps you optimize at the right level.

### Stage 1: Candidate Generation

The system generates roughly 1,500 candidate tweets from multiple sources:

- **In-Network Source (50%):** Tweets from accounts the user follows. Ranked by a neural
  network called Real-Graph that predicts which followed accounts the user will actually
  interact with. Following someone is not enough — if you never engage with their content,
  Real-Graph deprioritizes them.

- **Out-of-Network Source (50%):** Tweets from accounts the user does not follow but might
  find interesting. These come from two approaches:
  - **Social Graph:** What are the accounts you follow engaging with? If 5 people you follow
    all liked the same tweet, it becomes a candidate for your feed.
  - **Embedding Spaces:** SimClusters and TwHIN generate topic-based recommendations by
    matching the user's interest vector against tweet content vectors.

### Stage 2: Light Ranking

The 1,500 candidates are passed through a lightweight neural network that quickly scores
each tweet on likely engagement. This reduces the pool to roughly 800 tweets. The light
ranker uses a simplified version of the engagement prediction features — primarily
historical engagement rates, author authority (Tweepcred), and basic content signals.

### Stage 3: Heavy Ranking

The remaining 800 tweets are scored by a large neural network (~48 million parameters)
that predicts the probability of each engagement action: reply, like, retweet, bookmark,
profile click, and negative actions (block, mute, report). Each predicted probability is
multiplied by its corresponding weight to produce a final score.

This is where the engagement weights matter most:

```
final_score = (P(reply) * 54) + (P(like) * 30) + (P(retweet) * 20)
            + (P(quote) * 20) + (P(bookmark) * 40) + (P(profile_click) * 12)
            + (P(dwell) * 11) + (P(link_click) * 8)
            + (P(block) * -74) + (P(mute) * -12) + (P(report) * -369)
            + (P(not_interested) * -74)
```

### Stage 4: Filtering and Heuristics

After heavy ranking, several filters and heuristics are applied:

- **Visibility filtering:** Removes tweets that violate content policies
- **Author diversity:** Prevents too many tweets from the same author appearing in sequence
- **Content balance:** Ensures a mix of tweet types (text, media, threads, etc.)
- **Feedback-based filtering:** Removes tweets similar to ones the user previously marked
  "Not interested"
- **Social proof:** Out-of-network tweets need sufficient engagement from trusted connections
  to survive this filter

## Engagement Signal Weights — Full Detail

### Reply (+54x)

The single strongest positive signal. Replies indicate genuine interest and conversation.
The algorithm heavily favors tweets that generate discussion because conversations keep
users on the platform longer.

Why 54x: Twitter's internal data showed that tweets generating replies had the highest
correlation with long-term user retention. A user who replies to a tweet is significantly
more likely to open the app again the next day than a user who merely likes a tweet.

Optimization implications:
- Every tweet should contain at least one element that invites a response
- Questions, controversial opinions, and incomplete information all drive replies
- Replies from accounts with high Tweepcred scores count more than replies from low-authority accounts
- Reply depth matters: a tweet that generates reply chains (replies to replies) gets additional boosting

### Bookmark (+40x)

The second strongest positive signal. Bookmarks indicate that the content has lasting value
worth returning to. Unlike likes (which can be social signaling), bookmarks are private —
they represent genuine intent to revisit.

Why 40x: Bookmarked content correlates with the user returning to the platform to re-read
it. This is a strong retention signal. Twitter also found that bookmark behavior is a more
reliable quality signal than likes because there is no social incentive to bookmark — it is
purely utilitarian.

Optimization implications:
- Content with reference value (cheat sheets, code snippets, tool lists) drives bookmarks
- Longer tweets with dense information get bookmarked more than short quips
- Threads get bookmarked at higher rates than single tweets (more reference value)
- The presence of code blocks (backtick formatting) correlates with bookmark behavior

### Like (+30x)

The baseline positive signal. Likes are the most common engagement action and represent
general approval. While individually less valuable than replies or bookmarks, likes are
far more frequent, so they remain critical for building momentum.

Why 30x: Likes are the lowest-friction positive action. They serve as the baseline for
measuring content quality. A tweet with many likes but no replies or bookmarks is
"pleasant but not compelling" — it gets moderate distribution.

Optimization implications:
- Relatable content, humor, and "I feel seen" moments drive likes
- Likes often come from passive scrollers — strong hooks catch them before they scroll past
- A tweet that gets rapid early likes (within the first 15 minutes) signals to the algorithm
  that it deserves wider distribution

### Retweet (+20x)

Sharing a tweet with your followers without adding commentary. Retweets indicate that the
content is valuable enough to associate with your own personal brand.

Why 20x: Retweets expand reach directly (the tweet appears in the retweeter's followers'
feeds) and indirectly (the algorithm interprets retweets as a quality signal). However,
retweets are weighted lower than replies and bookmarks because they can be driven by
social obligation rather than genuine quality assessment.

Optimization implications:
- Quotable one-liners, useful frameworks, and strong opinions drive retweets
- Content that makes the retweeter look smart or well-informed gets shared more
- "Signal boosting" content (supporting a cause, amplifying someone else) drives retweets

### Quote Tweet (+20x)

Sharing a tweet with added commentary. Quote tweets are valuable because they create new
content and often generate their own engagement chains.

Why 20x: Same weight as retweets because the sharing behavior is similar, but quote tweets
have additional downstream value — the quote tweet itself becomes a new piece of content
that can generate its own engagement.

Optimization implications:
- Tweets that invite "Yes, and..." responses get quote-tweeted
- Controversial or debatable claims get quote-tweeted with counterarguments
- Data or research findings get quote-tweeted with additional context

### Profile Click (+12x)

The viewer clicks through to the author's profile after seeing the tweet. This indicates
curiosity about the author beyond the individual tweet.

Why 12x: Profile clicks correlate with follow actions, which represent long-term platform
value. A tweet that drives profile clicks is introducing new potential followers.

### Dwell Time (+11x)

The amount of time a viewer spends looking at the tweet before scrolling. Measured in
seconds. Longer dwell time indicates the content was worth reading carefully.

Why 11x: Dwell time is a passive signal that does not require any action from the user.
It captures the value of content that is interesting to read but does not necessarily
trigger likes or replies (long-form analysis, detailed threads, nuanced arguments).

Optimization implications:
- Longer tweets increase dwell time mechanically
- Line breaks and formatting slow reading speed (more time on screen)
- Lists and structured content hold attention longer than paragraphs
- Media (images, code screenshots) adds dwell time as users examine the visual

### Link Click (+8x)

The user clicks a link in the tweet. While the act of clicking indicates interest, the
weight is relatively low because the user leaves the platform.

Why 8x: Link clicks have a dual nature — they indicate content quality but also represent
a user leaving X. The algorithm rewards the engagement signal but applies a separate
content-level penalty for containing external links (the -5x content factor).

## Content Factor Details

### Media Bonus (+2x)

Tweets containing images, videos, or GIFs receive a flat 2x boost to their ranking score.
This applies after the engagement prediction, meaning it amplifies whatever engagement the
tweet was already predicted to receive.

The media bonus exists because media-rich tweets have higher dwell time on average and
contribute to a more visually engaging feed. Video content receives slightly higher
treatment than static images in some ranking configurations.

Types of media that trigger the bonus:
- Uploaded images (JPG, PNG, GIF)
- Uploaded video
- Quote-tweet cards (the preview of another tweet)
- Poll attachments
- Twitter Spaces cards

Types that do NOT trigger the bonus:
- Link preview cards (these are links, not native media)
- Text-only tweets with emoji (emoji are not media)

### External Link Penalty (-5x)

Tweets containing URLs pointing outside of X receive a -5x penalty. This is one of the
most impactful content factors because it directly reduces distribution regardless of how
good the tweet content is.

The penalty exists because X wants to keep users on the platform. Every external link
click is a potential session-ending event. The algorithm learned that tweets with links
generate lower downstream engagement (the user leaves and does not come back to like,
reply, or retweet).

Important nuances:
- Links to other tweets (quote tweets) are NOT penalized
- Links to X Spaces are NOT penalized
- The penalty applies even if nobody clicks the link — its mere presence suppresses distribution
- The penalty stacks with the link click signal: if someone does click, you get +8x for the
  click but already lost -5x for having the link

Workaround: Post the tweet without the link, then add the link as a reply to your own
tweet. The reply gets the link penalty, but your main tweet does not.

### Hashtag Penalty (-10x per excess)

The first 2 hashtags are neutral (no bonus, no penalty). Every hashtag beyond 2 incurs a
-10x penalty per excess hashtag.

The penalty exists because excessive hashtags are strongly correlated with spam, bot
accounts, and low-quality promotional content. Twitter's spam detection models use
hashtag density as a feature, and the ranking algorithm mirrors this.

Optimal hashtag strategy:
- 0 hashtags: No penalty, but you miss topic-discovery signals
- 1-2 hashtags: Optimal — provides topic signals without penalty
- 3+ hashtags: Penalized — each additional hashtag costs -10x
- 5+ hashtags: Severe suppression — the tweet may be flagged for spam review

### Engagement Bait (Suppressed)

The algorithm detects and suppresses tweets that explicitly ask for engagement actions.
This is not a simple weight — it is a classifier that can partially or fully suppress
distribution.

Detected patterns include:
- Direct asks: "Like this tweet", "Retweet if you agree", "Follow for more"
- Gamified asks: "Like = agree, RT = disagree"
- Conditional promises: "1000 likes and I'll share the code"
- Chain requests: "Tag 3 friends who need to see this"

The suppression is applied during the filtering stage (Stage 4) and can reduce a tweet's
ranking score by 50-90% depending on the severity of the bait pattern.

## Negative Signal Deep Dive

### Report (-369x)

The strongest signal in the entire algorithm by absolute weight. A single report from a
credible account can devastate a tweet's distribution. Reports trigger both immediate
ranking suppression and manual review queues.

Reports are weighted by reporter credibility: a report from an account with high Tweepcred,
low report frequency, and a long account history carries more weight than a report from a
new account that reports frequently.

### Block (-74x)

When a user blocks the tweet author after seeing the tweet, it is a powerful signal that
the content was unwelcome. Blocks compound across users — if multiple people block you
after seeing the same tweet, the penalty escalates non-linearly.

The compounding effect: 1 block = -74x. 5 blocks on the same tweet can reduce
distribution by 80-95%. The algorithm interprets clustered blocks as evidence that the
content is broadly unwelcome, not just disliked by one person.

### Not Interested (-74x)

Same weight as a block. This is the signal generated when a user taps "Not interested in
this" on a tweet in their feed. It is specifically trained to suppress similar content for
that user and, when aggregated, to suppress the tweet for all users.

### Mute (-12x)

A softer negative signal than blocking. Muting indicates the user does not want to see
content from this author but does not consider the content harmful enough to block.

### Quick Skip (-5x)

When a user scrolls past a tweet in under 1 second without any interaction, the algorithm
records a quick skip. Individual quick skips have minimal impact, but if a tweet
accumulates a high ratio of quick skips to impressions, it signals that the content is not
engaging enough to hold attention.

## Ranking Models — Extended Detail

### Real-Graph

Real-Graph is a logistic regression model that predicts the probability of interaction
between two specific users. It maintains a score for every follower-followee pair,
updated in near-real-time as interactions occur.

The model considers:
- Frequency of past interactions (replies, likes, retweets between the two users)
- Recency of interactions (recent interactions weigh more than old ones)
- Reciprocity (mutual interaction is stronger than one-directional)
- Interaction types (replies weigh more than likes in building the score)

For content creators, Real-Graph means that your tweets are primarily shown to followers
you have recently interacted with. If you have 10,000 followers but only regularly
interact with 500, your tweets will be distributed primarily to those 500 first. Only
if those 500 engage strongly will the tweet be promoted to your wider follower base.

Building Real-Graph score requires consistent, genuine interaction with your followers.
Reply to their tweets, like their content, and engage in conversations. Each interaction
strengthens the edge weight between you and that follower.

### SimClusters

SimClusters is an embedding-based community detection system. It identifies approximately
145,000 communities of users who share similar interests, then scores tweets for relevance
to each community.

The system works by:
1. Building a bipartite graph of users and the content they engage with
2. Running a community detection algorithm (a variant of matrix factorization) to identify
   clusters of users with similar engagement patterns
3. Representing each user and each tweet as a vector of community membership weights
4. Scoring tweet-user relevance by comparing their community vectors

For content creators, SimClusters means that your content is most likely to be distributed
to users in the same clusters as your existing engaged audience. If your followers are
primarily in the "frontend-development" and "React-ecosystem" clusters, your tweets about
React will reach far more people than your tweets about, say, cooking.

Staying on-niche strengthens your SimClusters signal. Posting across wildly different
topics dilutes your community vector, making the algorithm less confident about which
cluster to target.

### TwHIN (Twitter Heterogeneous Information Network)

TwHIN is a knowledge graph embedding model that learns representations for users, tweets,
and topics in a shared embedding space. Unlike SimClusters (which focuses on user
communities), TwHIN focuses on the relationships between content entities.

TwHIN understands that:
- "TypeScript" is related to "JavaScript" is related to "Node.js" is related to "backend development"
- A user who engages with TypeScript content is likely interested in JavaScript content
- A tweet about "migrating from JavaScript to TypeScript" bridges two topic nodes

The model uses these relationships for out-of-network recommendations: if you write a
tweet about TypeScript and it performs well, TwHIN can recommend it to users who engage
with JavaScript content even if they have never heard of you.

For content creators, TwHIN means that using specific, well-established technical terms
helps the algorithm place your content in the right topic graph. Vague language gives
TwHIN nothing to work with. The more specific your vocabulary, the more accurately the
algorithm can target your content.

### Tweepcred

Tweepcred is a PageRank-inspired authority scoring system. It assigns a reputation score
(0-100) to every account on the platform based on:

- **Follower graph quality:** Who follows you matters more than how many follow you. Followers
  with high Tweepcred scores contribute more to your score than followers with low scores.
- **Engagement ratios:** Accounts with high engagement-to-follower ratios score higher than
  accounts with large follower counts but low engagement.
- **Account age and consistency:** Older accounts with consistent posting patterns score higher
  than new accounts or accounts with erratic activity.
- **Spam signals:** Accounts that exhibit spam-like behavior (mass following, mass liking,
  repetitive content) receive Tweepcred penalties.

Tweepcred cannot be gamed quickly. It is designed to reward sustained, genuine contribution
to the platform over months and years. The most effective way to increase Tweepcred is to
consistently post high-quality, niche-specific content that generates genuine engagement
from high-quality followers.

## Signal Interaction Effects

### Early Engagement Velocity

The most important emergent behavior in X's algorithm is the early engagement feedback
loop. When a tweet receives strong engagement in its first 15-30 minutes, the algorithm
interprets this as a quality signal and expands distribution exponentially.

The feedback loop works like this:
1. Tweet is shown to a small initial audience (primarily high Real-Graph score followers)
2. If that initial audience engages (especially replies and bookmarks), the heavy ranker
   increases the tweet's score
3. The higher score causes the tweet to be shown to a wider audience
4. If the wider audience also engages, the score increases further
5. At each expansion, out-of-network distribution increases via SimClusters and TwHIN

This means that posting time matters enormously. If you post when your high Real-Graph
followers are not online, the initial engagement will be low, the feedback loop will not
activate, and the tweet will die regardless of its quality.

### Signal Stacking

Multiple positive signals on a single tweet compound rather than simply adding. A tweet
that receives replies AND bookmarks AND likes generates a significantly higher score than
the sum of the individual signals would suggest, because the heavy ranker interprets
multi-signal engagement as evidence of universally high quality.

The most powerful signal combination is: reply + bookmark + like. This combination
suggests that the content is conversation-worthy (reply), reference-worthy (bookmark),
and broadly appealing (like).

### Developer-Specific Observations

Through community experimentation, several patterns specific to developer content have
been identified:

- Code blocks (backtick formatting) correlate with higher bookmark rates, which activates
  the +40x bookmark signal more frequently
- Technical vocabulary activates stronger SimClusters and TwHIN matching, leading to
  better out-of-network distribution within the developer community
- "Build in public" content generates high reply rates because it invites feedback
- Screenshots of code, terminal output, or dashboards trigger the media bonus (+2x) while
  also increasing dwell time
- Threads about technical deep-dives get bookmarked at 3-5x the rate of single tweets
- The developer community on X has unusually high Tweepcred averages, meaning engagement
  from developer accounts carries more ranking weight than engagement from average accounts
