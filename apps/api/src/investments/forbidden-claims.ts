/**
 * Blocks performance claims a platform managing other people's money must never make
 * (docs/12 §3.1, docs/01-PRD.md principle #2).
 *
 * This is a gate, not a lint suggestion: `assertNoForbiddenClaims` throws, and the
 * strategy-publishing path calls it. A claim of guaranteed return is not a copywriting slip —
 * it is the single sentence most likely to turn a marketing page into a mis-selling case, and
 * a reviewer's attention is not a control.
 *
 * Both English and Russian are covered because the platform's operator writes in Russian and
 * the product is presented in both; a rule that only catches one language is a rule that a
 * translator can walk straight through.
 *
 * Deliberately NOT a general-purpose profanity/quality filter. It targets a specific, narrow
 * class of statement: promises about outcome. Ordinary descriptions of strategy, risk and past
 * performance must pass untouched, or authors will route around the check.
 */

export interface ForbiddenClaim {
  /** The exact text that matched, for a message the author can act on. */
  match: string;
  reason: string;
}

interface Rule {
  pattern: RegExp;
  reason: string;
  /**
   * True for promise-of-outcome rules, where a negation nearby inverts the meaning into the
   * disclaimer the platform is required to publish. False for absence-claims ("risk-free",
   * "cannot lose"), where the negation IS the claim.
   */
  negatable?: boolean;
}

/**
 * Unicode-aware word boundaries. `\b` is defined in terms of `\w`, which is `[A-Za-z0-9_]`, so
 * every Cyrillic letter counts as a non-word character and `\b` lands in the wrong places —
 * the Russian rules below silently matched nothing until this was fixed. `\p{L}` with the `u`
 * flag is the boundary that actually works in both alphabets.
 */
const NOT_PRECEDED_BY_LETTER = '(?<!\\p{L})';
const NOT_FOLLOWED_BY_LETTER = '(?!\\p{L})';

/**
 * A negation near the "guarantee" word inverts the claim, and the inverted form is the
 * disclaimer the platform is *required* to publish: "past results do not guarantee future
 * returns", "прошлые результаты не гарантируют будущих". Blocking those would force authors to
 * delete the very sentence regulators expect to see.
 *
 * Checked as a window around the match rather than as a lookbehind, because the negation is
 * not always adjacent — "Nothing here guarantees a result" has three words in between.
 *
 * The marker list deliberately excludes a bare "no": "No fees, guaranteed profit" is a real
 * claim, and treating its "No" as a negation of "guaranteed" would wave it through.
 */
const NEGATION_MARKERS =
  /(\bnot\b|n't\b|\bnever\b|\bcannot\b|\bnothing\b|\bnone\b|\bno guarantee\w*|(?<!\p{L})не(?!\p{L})|(?<!\p{L})ничего(?!\p{L})|(?<!\p{L})никак\p{L}*)/giu;

/** How far before a match to look for a negation that inverts it. */
const NEGATION_WINDOW = 20;

function rule(source: string, reason: string, negatable = false): Rule {
  return { pattern: new RegExp(source, 'giu'), reason, negatable };
}

/** Bounded by sentence punctuation so a guarantee in one sentence and a profit noun in the
 *  next are not welded into a claim neither sentence makes. */
const WITHIN_SENTENCE = '[^.!?\\n]{0,40}';

const RULES: Rule[] = [
  // ── Promises of outcome (negation-aware) ──
  rule(
    `${NOT_PRECEDED_BY_LETTER}(guarantee[sd]?|guaranteeing)${NOT_FOLLOWED_BY_LETTER}` +
      `${WITHIN_SENTENCE}${NOT_PRECEDED_BY_LETTER}(profit|return|returns|income|yield|gain|gains|result|results)${NOT_FOLLOWED_BY_LETTER}`,
    'promises a guaranteed outcome',
    true,
  ),
  rule(
    `${NOT_PRECEDED_BY_LETTER}(profit|return|returns|income|yield|gain|gains|result|results)${NOT_FOLLOWED_BY_LETTER}` +
      `${WITHIN_SENTENCE}${NOT_PRECEDED_BY_LETTER}(guaranteed|guarantee[sd]?)${NOT_FOLLOWED_BY_LETTER}`,
    'promises a guaranteed outcome',
    true,
  ),
  rule(
    `${NOT_PRECEDED_BY_LETTER}(assured|certain|promised)\\s+(profit|return|returns|income|yield)${NOT_FOLLOWED_BY_LETTER}`,
    'promises a certain outcome',
  ),

  // ── Claims that risk or loss is absent. Not negation-aware: here the negation IS the claim.
  rule(`${NOT_PRECEDED_BY_LETTER}(risk[-\\s]?free|no[-\\s]risk|zero[-\\s]risk|without any risk)${NOT_FOLLOWED_BY_LETTER}`, 'claims the absence of risk'),
  rule(
    `${NOT_PRECEDED_BY_LETTER}(no[-\\s]loss|loss[-\\s]free|cannot lose|can'?t lose|never lose[s]?)${NOT_FOLLOWED_BY_LETTER}`,
    'claims losses are impossible',
  ),
  rule(`100\\s?%\\s*(accurate|accuracy|win|wins|winning|profitable|success)${NOT_FOLLOWED_BY_LETTER}`, 'claims perfect accuracy'),

  // ── Russian ──
  rule(
    `${NOT_PRECEDED_BY_LETTER}(гарантирован\\p{L}*|гарантиру\\p{L}*|гаранти[яию]\\p{L}*)${NOT_FOLLOWED_BY_LETTER}` +
      `${WITHIN_SENTENCE}${NOT_PRECEDED_BY_LETTER}(прибыл\\p{L}*|доход\\p{L}*|результат\\p{L}*|заработ\\p{L}*)${NOT_FOLLOWED_BY_LETTER}`,
    'обещает гарантированный результат',
    true,
  ),
  rule(
    `${NOT_PRECEDED_BY_LETTER}(прибыл\\p{L}*|доход\\p{L}*|результат\\p{L}*|заработ\\p{L}*)${NOT_FOLLOWED_BY_LETTER}` +
      `${WITHIN_SENTENCE}${NOT_PRECEDED_BY_LETTER}(гарантирован\\p{L}*|гарантиру\\p{L}*)${NOT_FOLLOWED_BY_LETTER}`,
    'обещает гарантированный результат',
    true,
  ),
  rule(`${NOT_PRECEDED_BY_LETTER}(без\\s+риск\\p{L}*|безриск\\p{L}*|нулев\\p{L}*\\s+риск\\p{L}*)${NOT_FOLLOWED_BY_LETTER}`, 'утверждает отсутствие риска'),
  rule(
    `${NOT_PRECEDED_BY_LETTER}(без\\s+убытк\\p{L}*|невозможно\\s+потерять)${NOT_FOLLOWED_BY_LETTER}`,
    'утверждает невозможность убытка',
  ),
  rule(`100\\s?%\\s*(точн\\p{L}*|прибыл\\p{L}*|успеш\\p{L}*|выигрыш\\p{L}*)${NOT_FOLLOWED_BY_LETTER}`, 'заявляет стопроцентную точность'),
];

/**
 * Whether a negation in the run-up to (or inside) the match turns it into a disclaimer.
 * The window includes the match itself so "результаты не гарантируют" is caught, where the
 * negation sits between the two keywords rather than before them.
 */
function isNegated(text: string, index: number, matched: string): boolean {
  const window = text.slice(Math.max(0, index - NEGATION_WINDOW), index + matched.length);
  NEGATION_MARKERS.lastIndex = 0;
  return NEGATION_MARKERS.test(window);
}

/** Every forbidden claim in the given text, with what matched and why it is not allowed. */
export function findForbiddenClaims(text: string): ForbiddenClaim[] {
  const found: ForbiddenClaim[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    // `lastIndex` persists on a /g regex between calls, so reset before each scan or the
    // second field checked would start mid-string and silently miss matches.
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      if (rule.negatable && isNegated(text, match.index ?? 0, match[0])) continue;

      const key = `${rule.reason}:${match[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ match: match[0].trim(), reason: rule.reason });
    }
  }

  return found;
}

/**
 * Scans every user-facing field of a strategy and throws if any makes a forbidden claim.
 * `fields` is a map of field name → text so the error can point at what to fix.
 */
export function collectForbiddenClaims(
  fields: Record<string, string | null | undefined>,
): Array<ForbiddenClaim & { field: string }> {
  const problems: Array<ForbiddenClaim & { field: string }> = [];
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    for (const claim of findForbiddenClaims(text)) {
      problems.push({ field, ...claim });
    }
  }
  return problems;
}
