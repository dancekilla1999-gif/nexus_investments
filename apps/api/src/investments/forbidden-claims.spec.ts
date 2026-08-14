import { collectForbiddenClaims, findForbiddenClaims } from './forbidden-claims';

/**
 * Two failure modes matter equally here, and the second is the one that gets forgotten:
 *
 *  1. A forbidden claim slips through — the platform publishes a promise of guaranteed return.
 *  2. An ordinary, honest description is blocked — authors then route around the check, or the
 *     gate gets disabled, and failure mode 1 arrives by a different door.
 *
 * So the "must pass" block below is not filler; it is half the specification.
 */
describe('forbidden claims', () => {
  describe('blocks promises of outcome', () => {
    const blocked = [
      'Guaranteed profit every month.',
      'This strategy guarantees a return of 12% annually.',
      'Returns are guaranteed by our proprietary model.',
      'A risk-free way to hold crypto.',
      'Completely risk free.',
      'You cannot lose with this approach.',
      'Our signals are 100% accurate.',
      'Assured income for conservative investors.',
      // Russian — the operator writes in Russian, and a rule that only catches English is a
      // rule a translator walks straight through.
      'Гарантированная прибыль каждый месяц.',
      'Мы гарантируем доходность 12% годовых.',
      'Доход гарантирован нашей моделью.',
      'Инвестиции без риска.',
      'Стратегия со 100% точностью входов.',
    ];

    it.each(blocked)('rejects %j', (text) => {
      expect(findForbiddenClaims(text).length).toBeGreaterThan(0);
    });
  });

  describe('leaves honest description alone', () => {
    const allowed = [
      'A conservative BTC strategy targeting steady growth with a 10% maximum drawdown.',
      'Past performance is not indicative of future results. All investing carries risk of loss.',
      'The strategy has returned 14.8% since inception; the worst drawdown was 7.2%.',
      'We manage risk with position limits and a hard drawdown circuit breaker.',
      'Historical win rate: 61%. This does not guarantee anything about future trades.',
      'Консервативная стратегия по BTC с ограничением просадки 10%.',
      'Историческая доходность 14,8% с момента запуска. Прошлые результаты не гарантируют будущих.',
      'Мы управляем риском через лимиты позиции и автоматический стоп по просадке.',
      'Возможна полная потеря вложенных средств.',
    ];

    it.each(allowed)('accepts %j', (text) => {
      expect(findForbiddenClaims(text)).toEqual([]);
    });
  });

  describe('never blocks the required disclaimer', () => {
    // The negated form is the sentence regulators expect to see. A rule that blocks it forces
    // authors to delete their own disclaimer, which is the opposite of the intent — and it is
    // the first thing to break if these patterns are ever edited.
    const disclaimers = [
      'Past results do not guarantee future returns.',
      'Historical performance does not guarantee profit.',
      "We can't guarantee returns of any kind.",
      'Nothing here guarantees a result — you may lose your entire investment.',
      'Прошлые результаты не гарантируют будущих.',
      'Историческая доходность не гарантирует прибыли в будущем.',
      'Мы не гарантируем доход.',
    ];

    it.each(disclaimers)('accepts %j', (text) => {
      expect(findForbiddenClaims(text)).toEqual([]);
    });
  });

  it('does not treat a bare "no" as a negation of the guarantee', () => {
    // "No fees, guaranteed profit" is a real claim. Counting its "No" as negating "guaranteed"
    // would wave through exactly the sentence this gate exists to stop.
    expect(findForbiddenClaims('No fees, guaranteed profit.').length).toBeGreaterThan(0);
    expect(findForbiddenClaims('Без комиссии, гарантированная прибыль.').length).toBeGreaterThan(0);
  });

  it('still catches a claim that disclaims itself in the next sentence', () => {
    // "Guaranteed 20% returns. (Not financial advice.)" is not saved by the parenthetical.
    const claims = findForbiddenClaims('Guaranteed 20% returns. Not financial advice.');
    expect(claims.length).toBeGreaterThan(0);
  });

  it('does not let a sentence boundary launder a claim', () => {
    // The 40-character window is bounded by sentence punctuation on purpose, so "guarantee"
    // in one sentence and "profit" in the next is not treated as one claim.
    expect(findForbiddenClaims('We guarantee support responses. Profit depends on the market.')).toEqual([]);
  });

  it('reports the field and the matched text so an author can fix it', () => {
    const problems = collectForbiddenClaims({
      name: 'Safe Growth',
      description: 'A risk-free strategy.',
      thesis: 'Guaranteed returns from arbitrage.',
    });

    expect(problems.map((p) => p.field).sort()).toEqual(['description', 'thesis']);
    expect(problems.find((p) => p.field === 'description')?.match.toLowerCase()).toContain('risk-free');
  });

  it('scans every field independently rather than stopping at the first', () => {
    // A regression guard: /g regexes carry `lastIndex` between calls, so a naive
    // implementation checks field one, then starts field two mid-string and misses the match.
    const problems = collectForbiddenClaims({
      a: 'Guaranteed profit.',
      b: 'Guaranteed profit.',
      c: 'Guaranteed profit.',
    });
    expect(problems.map((p) => p.field).sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores empty and missing fields', () => {
    expect(collectForbiddenClaims({ a: null, b: undefined, c: '' })).toEqual([]);
  });
});
