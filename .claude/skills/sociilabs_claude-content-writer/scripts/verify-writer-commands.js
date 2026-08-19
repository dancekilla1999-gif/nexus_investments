#!/usr/bin/env node

/**
 * Structural lint for the multi-platform-portability migration (VERIFY-02).
 *
 * Dependency-free (fs, path, os, process.argv only) so it can run without a
 * browser or a live Claude Code session. See:
 * .planning/phases/01-multi-platform-portability-layer/01-RESEARCH.md
 * ("Don't Hand-Roll" section) for why frontmatter parsing here is a
 * restricted flat-key regex, not a real YAML parser.
 *
 * Usage:
 *   node scripts/verify-writer-commands.js                 # run all checks
 *   node scripts/verify-writer-commands.js --check=schema
 *   node scripts/verify-writer-commands.js --check=neutralize
 *   node scripts/verify-writer-commands.js --check=migration
 *   node scripts/verify-writer-commands.js --self-test
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// The 30 required PROJECT-STATE.md frontmatter keys, per
// skills/state-schema.md section 2 ("Project State Schema").
const REQUIRED_SCHEMA_KEYS = [
  'phase',
  'platform',
  'format',
  'topic',
  'angle',
  'audience',
  'awareness_stage',
  'goal',
  'framework',
  'length',
  'cta',
  'research_urls',
  'key_points',
  'seo_primary_keyword',
  'seo_secondary_keywords',
  'seo_meta_title',
  'seo_meta_description',
  'seo_slug',
  'platform_conventions_file',
  'voice_notes',
  'proof_points',
  'cta_placement',
  'draft_word_count',
  'cta_expanded',
  'seo_score',
  'ai_patterns_fixed',
  'ste_gate',
  'ste_per100w',
  'manual_check',
  'updated_at',
];

/**
 * Recursively list every file under `dir`. Returns an empty array if `dir`
 * does not exist or cannot be read — callers are responsible for reporting
 * a missing-directory error separately.
 */
function walk(dir) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Restricted flat-key extraction: matches lines of the form `key: value`
 * (or bare `key:`) at the start of a (trimmed) line. No nested maps, no
 * multiline blocks, no YAML anchors — deliberately not a real YAML parser.
 */
function findKeyNamesInDocument(content) {
  const keys = new Set();
  const lines = content.split('\n');
  for (const line of lines) {
    const match = /^([A-Za-z0-9_]+):(\s|$)/.exec(line.trim());
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function missingSchemaKeys(content, requiredKeys) {
  const foundKeys = findKeyNamesInDocument(content);
  return requiredKeys.filter((key) => !foundKeys.has(key));
}

function checkSchema() {
  const schemaPath = path.join(ROOT, 'skills', 'state-schema.md');
  if (!fs.existsSync(schemaPath)) {
    return {
      pass: false,
      details: [`file not found: ${path.relative(ROOT, schemaPath)}`],
    };
  }

  const content = fs.readFileSync(schemaPath, 'utf8');
  const missing = missingSchemaKeys(content, REQUIRED_SCHEMA_KEYS);

  if (missing.length > 0) {
    return {
      pass: false,
      details: missing.map((key) => `missing schema key: ${key}`),
    };
  }

  return {
    pass: true,
    details: [
      `all ${REQUIRED_SCHEMA_KEYS.length} required schema keys present in ` +
        path.relative(ROOT, schemaPath),
    ],
  };
}

function checkNeutralize() {
  const refsDir = path.join(ROOT, 'references');
  if (!fs.existsSync(refsDir)) {
    return {
      pass: false,
      details: [`file not found: ${path.relative(ROOT, refsDir)}`],
    };
  }

  const details = [];
  const files = walk(refsDir);
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('[Content Writer')) {
        details.push(`${path.relative(ROOT, file)}:${i + 1}`);
      }
    }
  }

  if (details.length > 0) {
    return { pass: false, details };
  }

  return {
    pass: true,
    details: [
      `no "[Content Writer" occurrences found under ${path.relative(ROOT, refsDir)}/`,
    ],
  };
}

function checkMigration() {
  const details = [];
  let failed = false;

  const sharedContextPath = path.join(ROOT, 'skills', 'shared-context.md');
  const writerDir = path.join(ROOT, 'skills', 'writer');

  const filesToScan = [];

  if (fs.existsSync(sharedContextPath)) {
    filesToScan.push(sharedContextPath);
  } else {
    details.push(`file not found: ${path.relative(ROOT, sharedContextPath)}`);
    failed = true;
  }

  if (fs.existsSync(writerDir)) {
    filesToScan.push(...walk(writerDir));
  } else {
    details.push(`file not found: ${path.relative(ROOT, writerDir)}`);
    failed = true;
  }

  for (const file of filesToScan) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('check memory first')) {
        details.push(
          `${path.relative(ROOT, file)}:${i + 1}: found pre-migration phrase "check memory first"`
        );
        failed = true;
      }
    }
  }

  if (fs.existsSync(sharedContextPath)) {
    const sharedContent = fs.readFileSync(sharedContextPath, 'utf8');
    if (!sharedContent.includes('PROJECT-STATE.md')) {
      details.push(
        `${path.relative(ROOT, sharedContextPath)}: missing required substring "PROJECT-STATE.md"`
      );
      failed = true;
    }
  }

  if (failed) {
    return { pass: false, details };
  }

  return {
    pass: true,
    details: [
      'no pre-migration "check memory first" references found; ' +
        'PROJECT-STATE.md referenced in shared-context.md',
    ],
  };
}

/**
 * The STE linter is a hard gate for /writer:verify. This check makes it a
 * hard gate for the product itself: the file must exist, load, and pass its
 * own self-test (word lists, gate tiers, and the tier resolver).
 */
function checkSteLint() {
  const lintPath = path.join(ROOT, 'scripts', 'ste-lint.js');
  if (!fs.existsSync(lintPath)) {
    return {
      pass: false,
      details: [`file not found: ${path.relative(ROOT, lintPath)}`],
    };
  }

  let mod;
  try {
    mod = require(lintPath);
  } catch (err) {
    return { pass: false, details: [`failed to load ste-lint.js: ${err.message}`] };
  }

  if (typeof mod.selfTest !== 'function') {
    return { pass: false, details: ['ste-lint.js does not export selfTest()'] };
  }

  // Also confirm ste-writing-rules.md (the law the linter enforces) exists.
  const rulesPath = path.join(ROOT, 'references', 'ste-writing-rules.md');
  if (!fs.existsSync(rulesPath)) {
    return {
      pass: false,
      details: [`file not found: ${path.relative(ROOT, rulesPath)}`],
    };
  }

  let ok;
  try {
    ok = mod.selfTest(true);
  } catch (err) {
    return { pass: false, details: [`ste-lint selfTest threw: ${err.message}`] };
  }

  if (!ok) {
    return { pass: false, details: ['ste-lint.js self-test failed'] };
  }

  return {
    pass: true,
    details: [
      'ste-lint.js self-test passed (word lists, gate tiers, tier resolver); ' +
        'references/ste-writing-rules.md present',
    ],
  };
}

const CHECKS = {
  schema: checkSchema,
  neutralize: checkNeutralize,
  migration: checkMigration,
  steLint: checkSteLint,
};

/**
 * Internal self-test: proves the schema-check logic is correct independent
 * of the rest of the repo's current migration state. Writes throwaway
 * fixtures under os.tmpdir() (never inside the repo tree) and always
 * cleans up, even on assertion failure.
 */
function runSelfTest() {
  const tmpBase = fs.mkdtempSync(
    path.join(os.tmpdir(), 'verify-writer-commands-')
  );
  let ok = true;
  const failures = [];

  try {
    const completeContent =
      '---\n' +
      REQUIRED_SCHEMA_KEYS.map((key) => `${key}: value`).join('\n') +
      '\n---\n';

    const missingKeys = REQUIRED_SCHEMA_KEYS.slice(0, 3);
    const remainingKeys = REQUIRED_SCHEMA_KEYS.slice(3);
    const incompleteContent =
      '---\n' +
      remainingKeys.map((key) => `${key}: value`).join('\n') +
      '\n---\n';

    fs.writeFileSync(
      path.join(tmpBase, 'complete-schema.md'),
      completeContent,
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpBase, 'incomplete-schema.md'),
      incompleteContent,
      'utf8'
    );

    const completeMissing = missingSchemaKeys(
      completeContent,
      REQUIRED_SCHEMA_KEYS
    );
    if (completeMissing.length === 0) {
      console.log(
        'PASS: fixture with all 28 required schema keys reports zero missing keys'
      );
    } else {
      ok = false;
      failures.push(
        `complete fixture unexpectedly reported missing keys: ${completeMissing.join(', ')}`
      );
    }

    const incompleteMissing = missingSchemaKeys(
      incompleteContent,
      REQUIRED_SCHEMA_KEYS
    );
    const actualSorted = incompleteMissing.slice().sort();
    const expectedSorted = missingKeys.slice().sort();
    const sameSet =
      actualSorted.length === expectedSorted.length &&
      actualSorted.every((key, i) => key === expectedSorted[i]);

    if (sameSet) {
      console.log(
        `PASS: fixture missing 3 keys reports exactly: ${incompleteMissing.join(', ')}`
      );
    } else {
      ok = false;
      failures.push(
        `incomplete fixture reported [${incompleteMissing.join(', ')}], ` +
          `expected [${missingKeys.join(', ')}]`
      );
    }
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }

  if (!ok) {
    for (const failure of failures) {
      console.log(`FAIL: ${failure}`);
    }
  }

  return ok;
}

function printUsage() {
  console.log(
    'Usage: node scripts/verify-writer-commands.js [--check=schema|neutralize|migration|steLint] [--self-test]'
  );
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--self-test')) {
    const ok = runSelfTest();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const checkArg = args.find((arg) => arg.startsWith('--check='));

  if (checkArg) {
    const name = checkArg.split('=')[1];
    const fn = CHECKS[name];
    if (!fn) {
      printUsage();
      process.exitCode = 1;
      return;
    }
    const result = fn();
    for (const line of result.details) {
      console.log(line);
    }
    console.log(`${name}: ${result.pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = result.pass ? 0 : 1;
    return;
  }

  let allPass = true;
  for (const name of Object.keys(CHECKS)) {
    const result = CHECKS[name]();
    for (const line of result.details) {
      console.log(line);
    }
    console.log(`${name}: ${result.pass ? 'PASS' : 'FAIL'}`);
    if (!result.pass) {
      allPass = false;
    }
  }
  process.exitCode = allPass ? 0 : 1;
}

module.exports = { checkSchema, checkNeutralize, checkMigration, checkSteLint };

if (require.main === module) {
  main();
}
