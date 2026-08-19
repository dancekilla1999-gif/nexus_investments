# Developer Writing Style Guide

Best practices for writing technical content that developer audiences actually read, trust, and share. This guide covers voice, structure, code examples, common mistakes, and the editing process.

---

## Voice and Tone

### The Target Voice: Authoritative Peer

You are a knowledgeable colleague sharing what you have learned, not a professor lecturing students and not a marketer selling a product. The goal is to make the reader feel like they are getting insider knowledge from someone who has done the work.

**Characteristics of the right voice**:
- **First person**: Use "I" and "we" freely. "I ran into this issue on a production system" is more credible than "One might encounter this issue in production."
- **Contractions**: Use them. "Don't", "isn't", "we've" are natural in conversation and appropriate in developer content. Formal writing creates distance.
- **Direct address**: Talk to the reader. "You'll want to check your connection pool settings" is more engaging than "Developers should check their connection pool settings."
- **Confident but not arrogant**: State opinions clearly ("I think X is the better choice") without dismissing alternatives ("anyone who uses Y is wrong").
- **Humor**: Welcome when it is natural and serves the point. A well-placed aside or self-deprecating comment builds rapport. Forced jokes or memes damage credibility.

**Characteristics of the wrong voice**:
- **Corporate**: "Leveraging our innovative solution to optimize developer productivity." No reader trusts this.
- **Academic**: "It should be noted that the aforementioned approach, while theoretically sound, presents certain practical limitations." Too much distance.
- **Sycophantic**: "This amazing, groundbreaking library will revolutionize your workflow!" Developers have strong bullshit detectors.
- **Dismissive**: "If you're still using X in 2026, I can't help you." Alienates the audience you're trying to reach.

### Calibrating Formality by Context

- **Tutorial articles**: Slightly more structured and instructional. "Let's set up the project" is appropriate. Still conversational.
- **Opinion pieces**: More personal and direct. Stronger statements, more "I think" constructions.
- **Deep dives**: Can be more technical and precise in language. The voice is still conversational, but the vocabulary can be more specialized.
- **Case studies**: Factual and grounded. Less opinion, more observation. "We noticed that" and "The data showed" constructions work well.
- **Career articles**: Most personal and reflective. Vulnerability is an asset here. "I was terrified" or "I completely failed at this" builds trust.

---

## Explaining Complex Topics Without Condescending

The core challenge of technical writing is managing the reader's knowledge level. Explain too much and you bore experts. Explain too little and you lose beginners. Here is how to handle it.

### The "Smart Friend" Technique

Write as if you are explaining to a friend who is a competent developer but does not have specific domain expertise in this topic. They understand programming concepts, they know how to read code, but they have not worked with this particular technology or pattern before.

This means:
- Do not explain what a function is or how a for loop works
- Do explain what a WAL (Write-Ahead Log) is when writing about database internals
- Do not explain HTTP status codes
- Do explain what a 429 response means in the context of rate limiting if your article is about API design

### Progressive Disclosure

Start with the simplified mental model, then add layers of nuance. Signal when you are going deeper so that readers who already understand can skip ahead.

**Example progression**:
1. "At its simplest, a connection pool is a cache of database connections." (Level 1: metaphor)
2. "The pool maintains a set of open connections and lends them to your application code on demand, returning them when done." (Level 2: mechanism)
3. "Under the hood, the pool tracks connection state, handles timeout eviction, validates connections before lending them, and manages a wait queue when all connections are in use." (Level 3: detail)

### Signal Phrases for Different Depths

- "Put simply, ..." — signals a simplified version is coming
- "More precisely, ..." — signals added technical nuance
- "Under the hood, ..." — signals implementation detail
- "For the curious, ..." — signals optional deep detail that can be skipped
- "In practice, ..." — signals a shift from theory to real-world application

### What Condescension Looks Like

- "As you probably already know, ..." — if they already know, why mention it?
- "Obviously, ..." — nothing is obvious to everyone. If it were, you would not need to write it.
- "Simply do X" — "simply" implies it is easy, which makes the reader feel stupid if they struggle with it.
- "Just use X" — same as "simply." Remove the word "just" from technical writing entirely.
- "This is a basic concept, but ..." — if it is basic, either skip it or explain it without the qualifier.

---

## Code Example Best Practices

Code examples are the most scrutinized part of any developer article. A single error destroys credibility.

### Completeness

Every code example should be complete enough that a reader can copy-paste it, add the stated prerequisites, and run it successfully.

**Required elements**:
- All import statements at the top of the block
- All variable declarations (no undefined variables)
- Realistic data (not `foo`, `bar`, `baz` unless the variable name is irrelevant)
- File path in a comment at the top if the reader needs to create a specific file
- Language tag on the code fence for syntax highlighting

**Example of a complete code block**:
```python
# src/utils/retry.py
import time
import logging
from functools import wraps
from typing import Callable, Type

logger = logging.getLogger(__name__)

def retry(max_attempts: int = 3, delay: float = 1.0, exceptions: tuple[Type[Exception], ...] = (Exception,)) -> Callable:
    """Retry a function with exponential backoff."""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_attempts:
                        logger.error(f"Failed after {max_attempts} attempts: {e}")
                        raise
                    wait = delay * (2 ** (attempt - 1))
                    logger.warning(f"Attempt {attempt} failed, retrying in {wait}s: {e}")
                    time.sleep(wait)
        return wrapper
    return decorator
```

### Labeling Pseudocode

If you must use pseudocode, label it explicitly:

```text
// Pseudocode — not runnable
for each request in queue:
    if rate_limit.allows(request):
        process(request)
    else:
        queue.defer(request, backoff_time)
```

Never leave the reader guessing whether code is meant to be run as-is.

### Comments

- Use comments to explain "why," not "what." The code shows what; comments explain intent.
- Place comments above the line they explain, not inline for complex explanations.
- Keep inline comments short and use them only for non-obvious single-line clarifications.
- Do not over-comment. If every line has a comment, the code is either too complex or the comments are redundant.

### Code Block Length

- Ideal: 5-25 lines per code block.
- If a code block exceeds 30 lines, consider splitting it into smaller blocks with explanatory text between them.
- If the full code must be shown at once (for context), put the complete version at the end and walk through it in sections throughout the article.

---

## Common Writing Mistakes Developers Make

### 1. Burying the Lede

The most common mistake. Developers often write in the order they thought about the problem: background, exploration, failed attempts, then finally the insight. Readers want the insight first. Rearrange so the key takeaway is in the first three paragraphs. Use the body to support and elaborate.

### 2. Passive Voice Overuse

"The function was called by the scheduler" is weaker than "The scheduler called the function." Active voice is more direct, shorter, and easier to follow. Passive voice is acceptable when the actor is unknown or irrelevant ("The request was rejected by the rate limiter" is fine if you are focused on the request, not the limiter).

### 3. Weasel Words

"Somewhat", "fairly", "quite", "rather", "basically", "essentially", "arguably" — these words dilute your message. Either commit to the claim or qualify it with specific conditions. "This is somewhat faster" should become "This reduced response time by 30%" or "This is faster for payloads under 1MB."

### 4. Vague Quantifiers

"Significant improvement", "much faster", "large-scale system", "many users" — these tell the reader nothing. Replace with numbers. "3x throughput improvement", "P95 latency dropped from 340ms to 45ms", "15,000 requests per second", "2 million monthly active users."

### 5. Explaining What Instead of Why

"This code creates a connection pool with a max size of 20" describes what the code does, which the reader can see. "We set the pool to 20 because our load testing showed connection starvation above 15 concurrent queries, and 20 gives us headroom for traffic spikes" explains the reasoning, which the reader cannot derive from the code alone.

### 6. Wall of Text

Technical readers skim. If they see a 200-word paragraph with no visual breaks, they skip it. Break content into:
- Short paragraphs (2-4 sentences)
- Bulleted or numbered lists for sequences or collections
- Bold text for key terms and concepts
- Code blocks for anything that looks like code
- Headers for every major shift in topic

### 7. Throat-Clearing Introductions

"In today's fast-paced world of software development, performance optimization has become more important than ever." This is filler. The reader already cares about the topic or they would not have clicked. Start with substance.

Delete the first paragraph and see if the article improves. It usually does.

---

## Structuring Arguments for Technical Audiences

Developers respond to evidence and reasoning, not authority or popularity. Structure arguments accordingly.

**Lead with evidence, not claims**: Instead of "Microservices are overused. Here's why," try "We split our monolith into 12 services. Deployment frequency dropped by 40%. Here's what we learned."

**Show your work**: Developers trust the process as much as the conclusion. Walk through the reasoning, show the data, explain the tradeoffs. An article that says "X is better than Y" is weak. An article that says "X outperformed Y on these three benchmarks, but Y was better for this specific use case" is credible.

**Acknowledge tradeoffs**: Every technical decision has tradeoffs. Articles that present a solution as universally good lose credibility with experienced developers. Name the cost of your recommendation.

**Use concrete comparisons**: "Go compiles faster than Rust" is vague. "Our Go service compiles in 4 seconds; the equivalent Rust service takes 45 seconds. For our CI pipeline running 200 builds per day, that's 2.3 hours of compute saved daily." Now the reader can evaluate whether the tradeoff matters for their context.

---

## Storytelling Techniques for Technical Content

Stories make technical content memorable and shareable. Here are techniques that work in developer writing.

**The debugging narrative**: Walk the reader through a debugging session. Start with the symptom, show the wrong hypotheses, reveal the clues that led to the real cause, and end with the fix. This structure is inherently suspenseful and mirrors the reader's own debugging experiences.

**The before/after transformation**: Show the state of the code, system, or process before your change, then show the after. Concrete before/after comparisons are more convincing than abstract claims of improvement.

**The "I was wrong" arc**: Start with a belief you held, explain why you held it, then describe what changed your mind. This demonstrates intellectual growth and builds trust. Readers appreciate honesty about past mistakes.

**The escalation pattern**: Present a simple version of a problem, solve it, then reveal a complication. Solve that, then reveal another. This mirrors real-world complexity and keeps the reader engaged because each layer adds new insight.

---

## Editing Checklist

Run through this checklist before considering an article done.

### Cut Pass
- [ ] Remove every instance of "very", "really", "actually", "basically", "essentially" and check if the sentence still works (it almost always does)
- [ ] Delete throat-clearing introductions and filler transitions
- [ ] Remove duplicate points — if two paragraphs make the same argument, merge them
- [ ] Cut any paragraph that does not serve the article's central purpose

### Strengthen Pass
- [ ] Replace passive voice with active voice where possible
- [ ] Replace vague quantifiers with specific numbers
- [ ] Replace weak verbs ("is", "has", "makes") with strong verbs ("eliminates", "reduces", "triggers")
- [ ] Ensure every section has a clear purpose stated or implied in the first sentence

### Verify Pass
- [ ] Test every code example — does it compile and run?
- [ ] Check that all imports are included in code blocks
- [ ] Verify all links point to live URLs
- [ ] Confirm all metrics and statistics are accurate and sourced
- [ ] Ensure technical claims are defensible

### Reader Experience Pass
- [ ] Read the first three paragraphs — do they deliver value even if the reader stops here?
- [ ] Scan only the headers — do they tell a coherent story?
- [ ] Check paragraph lengths — is any paragraph longer than 5 sentences?
- [ ] Verify the article has a clear call to action at the end
- [ ] Read the conclusion — does it add synthesis, or just repeat the introduction?
