#!/usr/bin/env node

'use strict';

/**
 * STE Linter — ASD-STE100 Simplified Technical English compliance checker.
 *
 * Dependency-free Node port of the reference Python linter. Preserves the exact
 * MARKETING / BANNED / PHRASAL / MODAL_HEDGE word lists, the sentence-splitting
 * logic, the violation counters, and the per-100-word normalization. Ported to
 * Node so the verify gate runs on every machine that runs the skill (engines:
 * node >=14) with no Python runtime.
 *
 * This linter is the HARD gate for `/writer:verify`. The writing law it enforces
 * lives in references/ste-writing-rules.md.
 *
 * Usage:
 *   node scripts/ste-lint.js <file...>              # JSON report (no gate)
 *   cat draft.md | node scripts/ste-lint.js         # read stdin, JSON report
 *   node scripts/ste-lint.js --gate=blog <file>     # run the tiered gate; exit 1 on fail
 *   node scripts/ste-lint.js --self-test            # prove the linter logic
 *
 * Gate tiers (see references/ste-writing-rules.md "tiered gate contract"):
 *   Always (every tier): marketing_adjective == 0 AND banned_word == 0
 *   strict : total == 0 AND em_dash == 0
 *   prose  : total_per100w <= 3.0 AND em_dash <= 1 per 500 words
 *   social : total_per100w <= 4.0 AND em_dash <= 1 per 500 words
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Word lists — identical to the reference Python linter.
// ---------------------------------------------------------------------------

const MARKETING = [
  'seamless', 'seamlessly', 'robust', 'powerful', 'cutting-edge', 'effortless', 'effortlessly',
  'world-class', 'next-generation', 'revolutionary', 'blazing', 'lightning-fast', 'elegant', 'delightful',
  'turnkey', 'best-in-class', 'state-of-the-art', 'game-changing', 'first-class', 'battle-tested',
  'enterprise-grade', 'supercharge', 'unlock', 'unleash', 'empower', 'empowers',
];

const BANNED = [
  'begin', 'begins', 'commence', 'commences', 'initiate', 'initiates', 'originate',
  'utilize', 'utilizes', 'utilizing', 'leverage', 'leverages', 'leveraging', 'facilitate', 'facilitates',
  'ensure', 'ensures', 'ensuring', 'prior to', 'subsequent to', 'obtain', 'obtains', 'acquire', 'acquires',
  'demonstrate', 'demonstrates', 'additionally', 'furthermore', 'moreover', 'comprehensive', 'comprehensively',
  'utilization', 'aforementioned', 'henceforth', 'therein', 'whilst', 'amongst', 'numerous', 'myriad', 'plethora',
  'in order to', 'a variety of', 'in the event that', 'due to the fact that', 'it is important to note',
];

const PHRASAL = [
  'spin up', 'spin down', 'reach out', 'dive into', 'dives into', 'diving into', 'kick off', 'kicks off',
  'roll out', 'rolls out', 'tear down', 'ramp up', 'circle back', 'drill down', 'spun up', 'reaching out',
];

const MODAL_HEDGE = [
  'it is important to note', 'it should be noted', 'it is worth noting', 'please note that',
  'as mentioned', 'as noted above',
];

const BE = '(?:am|is|are|was|were|be|been|being)';
const PP_IRREG =
  '(?:done|made|sent|read|built|kept|held|set|put|run|written|shown|given|taken|found|got|gotten|seen|known|thrown|drawn)';

// ---------------------------------------------------------------------------
// Core linter — ported line-for-line from the reference implementation.
// ---------------------------------------------------------------------------

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripCode(t) {
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/`[^`]*`/g, ' ');
  return t;
}

function sentences(text) {
  const out = [];
  for (const line of text.split('\n')) {
    let s = line.trim();
    if (!s) continue;
    s = s.replace(/^\s*#{1,6}\s*/, '');
    s = s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
    if (!s) continue;
    const parts = s.split(/(?<=[.!?:])\s+(?=[A-Z0-9"'\-])/);
    for (let p of parts) {
      p = p.trim();
      if (p) out.push(p);
    }
  }
  return out;
}

function wc(s) {
  const m = s.match(/[A-Za-z0-9][A-Za-z0-9'\-/]*/g);
  return m ? m.length : 0;
}

function countCi(text, phrases) {
  let n = 0;
  const hits = [];
  const low = text.toLowerCase();
  for (const ph of phrases) {
    const re = new RegExp('(?<![a-z])' + escapeRegex(ph) + '(?![a-z])', 'g');
    const matches = low.match(re);
    if (matches) {
      n += matches.length;
      for (let i = 0; i < matches.length; i++) hits.push(ph);
    }
  }
  return { n, hits };
}

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function lint(text) {
  const raw = text;
  const stripped = stripCode(text);
  const sents = sentences(stripped);
  const words = sents.reduce((a, s) => a + wc(s), 0) || 1;

  const v = {};
  const longs = sents.filter((s) => wc(s) > 20).map((s) => wc(s));
  v['long_sentence(>20w)'] = longs.length;
  v['semicolon'] = countMatches(stripped, /;/g);
  v['contraction'] = countMatches(stripped, /\b\w+['’](?:t|re|ve|ll|d|s|m)\b/g);
  v['passive_voice'] = countMatches(
    stripped,
    new RegExp('\\b' + BE + '\\s+(?:\\w+ed|' + PP_IRREG + ')\\b', 'gi')
  );
  v['ing_main_verb'] = countMatches(
    stripped,
    new RegExp('\\b' + BE + '\\s+\\w+ing\\b', 'gi')
  );
  const nom1 = countMatches(
    stripped,
    /\b(?:perform(?:s|ed)?|conduct(?:s|ed)?|provide(?:s|d)?|carry out|carries out|make use of|makes use of)\b/gi
  );
  const nom2 = countMatches(stripped, /\b\w{4,}(?:tion|ment|ance|ence)\s+of\b/gi);
  v['nominalization'] = nom1 + nom2;
  v['phrasal_verb'] = countCi(stripped, PHRASAL).n;
  const bh = countCi(stripped, BANNED);
  v['banned_word'] = bh.n;
  const mh = countCi(stripped, MARKETING);
  v['marketing_adjective'] = mh.n;
  v['modal_hedge'] = countCi(stripped, MODAL_HEDGE).n;

  const paras = raw.split(/\n\s*\n/).filter((p) => p.trim());
  v['long_paragraph(>6s)'] = paras.filter(
    (p) => sentences(stripCode(p)).length > 6
  ).length;

  const em =
    raw.split('—').length - 1 + (raw.split('–').length - 1);

  const total = Object.values(v).reduce((a, b) => a + b, 0);

  const per100 = {};
  for (const k of Object.keys(v)) per100[k] = round2((v[k] * 100.0) / words);

  const allWc = sents.map((s) => wc(s));
  const longest = longs.length
    ? Math.max(...longs)
    : allWc.length
    ? Math.max(...allWc)
    : 0;

  const dedup = (arr) => Array.from(new Set(arr)).slice(0, 6);

  return {
    words,
    sentences: sents.length,
    violations: v,
    per100w: per100,
    total,
    total_per100w: round2((total * 100.0) / words),
    'em_dash(slop-marker)': em,
    longest_sentence_words: longest,
    sample_marketing: dedup(mh.hits),
    sample_banned: dedup(bh.hits),
  };
}

// ---------------------------------------------------------------------------
// Tiered gate — the hard requirement for /writer:verify.
// ---------------------------------------------------------------------------

const SOCIAL_TYPES = ['linkedin', 'twitter', 'x', 'facebook', 'instagram', 'threads', 'social'];

/**
 * Map a platform or format string to an STE tier.
 * Unknown types default to `prose` (the safe, voice-preserving middle tier).
 */
function resolveTier(type) {
  const t = String(type || '').toLowerCase().trim();
  if (!t) return 'prose';

  // Functional / transactional text has no voice to protect — strict.
  if (t.includes('seo') || t.includes('meta')) return 'strict';
  if (
    t.includes('operational') ||
    t.includes('transactional') ||
    t === 'email-ops' ||
    t.includes('receipt') ||
    t.includes('confirmation') ||
    t.includes('password') ||
    t.includes('reset')
  ) {
    return 'strict';
  }

  if (SOCIAL_TYPES.some((s) => t === s || t.includes(s))) return 'social';

  // blog, web, landing, sales, case study, testimonial, product, newsletter, email → prose
  return 'prose';
}

/**
 * Evaluate a lint report against a tier's gate. Returns { pass, tier, failures }.
 */
function evaluateGate(report, tier) {
  const v = report.violations;
  const em = report['em_dash(slop-marker)'];
  const words = report.words;
  const failures = [];

  // Always, every tier: hard zero.
  if (v['marketing_adjective'] > 0) {
    failures.push(
      `marketing_adjective=${v['marketing_adjective']} (must be 0 on every tier; e.g. ${report.sample_marketing.join(', ')})`
    );
  }
  if (v['banned_word'] > 0) {
    failures.push(
      `banned_word=${v['banned_word']} (must be 0 on every tier; e.g. ${report.sample_banned.join(', ')})`
    );
  }

  if (tier === 'strict') {
    if (report.total > 0) failures.push(`total=${report.total} (strict tier requires 0)`);
    if (em > 0) failures.push(`em_dash=${em} (strict tier requires 0)`);
  } else {
    const cap = tier === 'social' ? 4.0 : 3.0;
    if (report.total_per100w > cap) {
      failures.push(`total_per100w=${report.total_per100w} (must be <= ${cap.toFixed(1)})`);
    }
    const emAllowed = Math.max(1, Math.floor(words / 500));
    if (em > emAllowed) {
      failures.push(`em_dash=${em} (must be <= ${emAllowed} at 1 per 500 words)`);
    }
  }

  return { pass: failures.length === 0, tier, failures };
}

// ---------------------------------------------------------------------------
// Self-test — proves the linter and gate logic independent of any draft.
// Called by scripts/verify-writer-commands.js and by --self-test.
// ---------------------------------------------------------------------------

function selfTest(quiet) {
  let ok = true;
  const log = (pass, msg) => {
    if (!pass) ok = false;
    if (!quiet) console.log(`${pass ? 'PASS' : 'FAIL'}: ${msg}`);
  };

  // A clean STE-flavored paragraph should pass the prose gate.
  const clean =
    'The parser reads the file. It checks each line. If a line fails, the tool stops. ' +
    'We tested this on 40 client projects. It caught 12 real errors.';
  const cleanReport = lint(clean);
  const cleanGate = evaluateGate(cleanReport, 'prose');
  log(cleanGate.pass, `clean prose passes the prose gate (per100w=${cleanReport.total_per100w})`);
  log(
    cleanReport.violations['marketing_adjective'] === 0 && cleanReport.violations['banned_word'] === 0,
    'clean prose has zero marketing/banned words'
  );

  // Slop text must fail every tier (banned words + marketing + semicolon + em dash).
  const slop =
    'We utilize a robust and seamless platform; it is important to note that this will ' +
    'empower teams — leveraging cutting-edge synergy to facilitate growth.';
  const slopReport = lint(slop);
  log(slopReport.violations['banned_word'] > 0, `slop text flags banned words (${slopReport.violations['banned_word']})`);
  log(slopReport.violations['marketing_adjective'] > 0, `slop text flags marketing adjectives (${slopReport.violations['marketing_adjective']})`);
  log(slopReport.violations['semicolon'] > 0, 'slop text flags the semicolon');
  log(slopReport['em_dash(slop-marker)'] > 0, 'slop text flags the em dash');
  log(!evaluateGate(slopReport, 'prose').pass, 'slop text FAILS the prose gate');
  log(!evaluateGate(slopReport, 'social').pass, 'slop text FAILS the social gate (marketing/banned are hard-zero)');
  log(!evaluateGate(slopReport, 'strict').pass, 'slop text FAILS the strict gate');

  // Tier resolver mappings.
  log(resolveTier('blog') === 'prose', "resolveTier('blog') === 'prose'");
  log(resolveTier('linkedin') === 'social', "resolveTier('linkedin') === 'social'");
  log(resolveTier('twitter/x') === 'social', "resolveTier('twitter/x') === 'social'");
  log(resolveTier('seo') === 'strict', "resolveTier('seo') === 'strict'");
  log(resolveTier('email-ops') === 'strict', "resolveTier('email-ops') === 'strict'");
  log(resolveTier('email') === 'prose', "resolveTier('email') === 'prose'");
  log(resolveTier('') === 'prose', "resolveTier('') defaults to 'prose'");

  return ok;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
}

function printGateVerdict(report, tier) {
  const result = evaluateGate(report, tier);
  console.log('');
  console.log(`GATE (${tier}): ${result.pass ? 'PASS' : 'FAIL'}`);
  if (!result.pass) {
    for (const f of result.failures) console.log(`  - ${f}`);
  }
  return result.pass;
}

function summaryLine(name, r) {
  const pad = (s, n) => String(s).padEnd(n);
  return (
    `${pad(name, 32)} words=${String(r.words).padStart(4)} ` +
    `total=${String(r.total).padStart(3)} ` +
    `per100w=${r.total_per100w.toFixed(2).padStart(6)} ` +
    `em_dash=${String(r['em_dash(slop-marker)']).padStart(2)}`
  );
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--self-test')) {
    const okay = selfTest();
    process.exitCode = okay ? 0 : 1;
    return;
  }

  const gateArg = args.find((a) => a.startsWith('--gate='));
  const gateType = gateArg ? gateArg.split('=')[1] : null;
  const tier = gateType != null ? resolveTier(gateType) : null;
  const files = args.filter((a) => !a.startsWith('--'));

  // No files → read stdin, emit one JSON report (matches reference behavior).
  if (files.length === 0) {
    const report = lint(readStdin());
    printReport(report);
    if (tier) {
      const pass = printGateVerdict(report, tier);
      process.exitCode = pass ? 0 : 1;
    }
    return;
  }

  let allPass = true;
  for (const f of files) {
    let content;
    try {
      content = fs.readFileSync(f, 'utf8');
    } catch (err) {
      console.error(`cannot read ${f}: ${err.message}`);
      allPass = false;
      continue;
    }
    const report = lint(content);
    if (tier) {
      console.log(`# ${path.basename(f)}`);
      printReport(report);
      const pass = printGateVerdict(report, tier);
      if (!pass) allPass = false;
      console.log('');
    } else {
      console.log(summaryLine(path.basename(f), report));
    }
  }

  if (tier) process.exitCode = allPass ? 0 : 1;
}

module.exports = { lint, resolveTier, evaluateGate, selfTest };

if (require.main === module) {
  main();
}
