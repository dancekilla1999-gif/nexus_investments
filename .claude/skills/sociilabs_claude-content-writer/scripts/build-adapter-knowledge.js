#!/usr/bin/env node

/**
 * Build Adapter Knowledge Script
 * 
 * Copies reference documents from the canonical references/ directory to each
 * chat-platform adapter's knowledge/reference folder. Ensures all adapters
 * are built from the same shared reference docs rather than maintaining
 * independent copies.
 * 
 * Usage: node scripts/build-adapter-knowledge.js --target=[claude-skill|chatgpt|gemini|all]
 * 
 * Targets:
 * - claude-skill: Copy to skills/adapters/claude-skill/references/
 * - chatgpt: Copy to skills/adapters/chatgpt/knowledge/
 * - gemini: Copy to skills/adapters/gemini/knowledge/ (merges social platform files)
 * - all: Run all three targets (default)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const REFERENCES_DIR = path.join(__dirname, '..', 'references');
const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const ADAPTERS_DIR = path.join(SKILLS_DIR, 'adapters');

// Valid target values
const VALID_TARGETS = ['claude-skill', 'chatgpt', 'gemini', 'all'];

/**
 * Parse CLI arguments and extract --target value
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let target = 'all';

  for (const arg of args) {
    if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return { target };
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Usage: node scripts/build-adapter-knowledge.js [options]

Options:
  --target=TARGET    Target adapter to build (default: all)
                     Valid values: claude-skill, chatgpt, gemini, all
  --help, -h         Show this help message

Description:
  Copies reference documents from the canonical references/ directory to each
  chat-platform adapter's knowledge/reference folder. For Gemini, merges the
  three social platform convention files into one to stay within the 10-source
  limit while excluding content-packages.md.

Examples:
  node scripts/build-adapter-knowledge.js --target=all
  node scripts/build-adapter-knowledge.js --target=gemini
`);
}

/**
 * Print error and exit with usage
 */
function printErrorAndExit(message) {
  console.error(`\nError: ${message}`);
  console.error(`\nValid targets: ${VALID_TARGETS.join(', ')}`);
  console.error(`Run with --help for usage information.`);
  process.exit(1);
}

/**
 * Ensure directory exists, create if needed
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Clear all contents of a directory
 */
function clearDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

/**
 * Copy a file from source to destination
 */
function copyFile(source, dest) {
  fs.copyFileSync(source, dest);
}

/**
 * Get all files in references/ directory
 */
function getReferenceFiles() {
  return fs.readdirSync(REFERENCES_DIR).filter(f => f.endsWith('.md'));
}

/**
 * Build claude-skill adapter references
 * Copies all references/ files + state-schema.md unmodified to skills/adapters/claude-skill/references/
 */
function buildClaudeSkill() {
  const targetDir = path.join(ADAPTERS_DIR, 'claude-skill', 'references');
  ensureDir(targetDir);
  clearDir(targetDir);

  const refFiles = getReferenceFiles();
  let count = 0;

  // Copy all reference files
  for (const file of refFiles) {
    copyFile(
      path.join(REFERENCES_DIR, file),
      path.join(targetDir, file)
    );
    count++;
  }

  // Copy state-schema.md
  copyFile(
    path.join(SKILLS_DIR, 'state-schema.md'),
    path.join(targetDir, 'state-schema.md')
  );
  count++;

  // Bundle the STE linter so the verify gate is runnable on claude.ai
  // (this adapter supports code execution). ChatGPT/Gemini are knowledge-only
  // and use the manual STE self-lint instead.
  const scriptsTarget = path.join(ADAPTERS_DIR, 'claude-skill', 'scripts');
  ensureDir(scriptsTarget);
  copyFile(
    path.join(__dirname, 'ste-lint.js'),
    path.join(scriptsTarget, 'ste-lint.js')
  );
  count++;

  console.log(`  ${count} files written to ${path.relative(process.cwd(), targetDir)}`);
  return count;
}

/**
 * Build ChatGPT adapter knowledge
 * Copies all references/ files + state-schema.md unmodified to skills/adapters/chatgpt/knowledge/
 */
function buildChatGPT() {
  const targetDir = path.join(ADAPTERS_DIR, 'chatgpt', 'knowledge');
  ensureDir(targetDir);
  clearDir(targetDir);

  const refFiles = getReferenceFiles();
  let count = 0;

  // Copy all reference files
  for (const file of refFiles) {
    copyFile(
      path.join(REFERENCES_DIR, file),
      path.join(targetDir, file)
    );
    count++;
  }

  // Copy state-schema.md
  copyFile(
    path.join(SKILLS_DIR, 'state-schema.md'),
    path.join(targetDir, 'state-schema.md')
  );
  count++;

  console.log(`  ${count} files written to ${path.relative(process.cwd(), targetDir)}`);
  return count;
}

/**
 * Build Gemini adapter knowledge
 * 
 * Copies selected files to stay within Gemini's 10-knowledge-source limit:
 * - content-frameworks.md
 * - anti-ai-checklist.md (merged with ste-writing-rules.md to avoid adding a source)
 * - seo-meta-conventions.md
 * - web-content-conventions.md
 * - email-content-conventions.md
 * - sales-content-conventions.md
 * - profile-management.md
 * - research-workflow.md
 * - state-schema.md
 * 
 * And generates:
 * - social-conventions.md (concatenation of twitter, facebook, instagram conventions)
 * 
 * Deliberately excluded: content-packages.md
 */
function buildGemini() {
  const targetDir = path.join(ADAPTERS_DIR, 'gemini', 'knowledge');
  ensureDir(targetDir);
  clearDir(targetDir);

  const filesToCopy = [
    'content-frameworks.md',
    'anti-ai-checklist.md',
    'seo-meta-conventions.md',
    'web-content-conventions.md',
    'email-content-conventions.md',
    'sales-content-conventions.md',
    'profile-management.md',
    'research-workflow.md'
  ];

  let count = 0;

  // Copy selected reference files
  for (const file of filesToCopy) {
    const sourcePath = path.join(REFERENCES_DIR, file);
    if (fs.existsSync(sourcePath)) {
      copyFile(sourcePath, path.join(targetDir, file));
      count++;
    }
  }

  // Merge ste-writing-rules.md INTO the Gemini anti-ai-checklist.md rather than
  // shipping it as a separate source. Gemini caps knowledge sources at 10 and the
  // list above already fills that budget. The STE writing law is core, so it must
  // reach Gemini — appending it keeps the source count unchanged.
  const antiAiPath = path.join(targetDir, 'anti-ai-checklist.md');
  const stePath = path.join(REFERENCES_DIR, 'ste-writing-rules.md');
  if (fs.existsSync(antiAiPath) && fs.existsSync(stePath)) {
    const antiAi = fs.readFileSync(antiAiPath, 'utf8');
    const ste = fs.readFileSync(stePath, 'utf8');
    const merged =
      antiAi +
      '\n\n<!-- GENERATED: ste-writing-rules.md appended for Gemini (10-source limit) -->\n\n' +
      '# STE Writing Rules (appended)\n\n' +
      ste;
    fs.writeFileSync(antiAiPath, merged);
  }

  // Copy state-schema.md
  copyFile(
    path.join(SKILLS_DIR, 'state-schema.md'),
    path.join(targetDir, 'state-schema.md')
  );
  count++;

  // Generate social-conventions.md by merging three social platform files
  const socialPlatforms = [
    { file: 'twitter-conventions.md', heading: 'Twitter/X Conventions' },
    { file: 'facebook-conventions.md', heading: 'Facebook Conventions' },
    { file: 'instagram-conventions.md', heading: 'Instagram Conventions' }
  ];

  let mergedContent = `<!-- GENERATED FILE - DO NOT EDIT DIRECTLY -->
<!-- This file was generated by scripts/build-adapter-knowledge.js -->
<!-- It concatenates twitter-conventions.md, facebook-conventions.md, and instagram-conventions.md -->
<!-- To modify content, edit the source files in references/ and rebuild. -->

`;

  for (const platform of socialPlatforms) {
    const sourcePath = path.join(REFERENCES_DIR, platform.file);
    if (fs.existsSync(sourcePath)) {
      const content = fs.readFileSync(sourcePath, 'utf8');
      mergedContent += `# ${platform.heading}\n\n${content}\n\n`;
    }
  }

  fs.writeFileSync(path.join(targetDir, 'social-conventions.md'), mergedContent);
  count++;

  console.log(`  ${count} files written to ${path.relative(process.cwd(), targetDir)}`);
  return count;
}

/**
 * Main execution
 */
function main() {
  const { target } = parseArgs();

  // Validate target
  if (!VALID_TARGETS.includes(target)) {
    printErrorAndExit(`Invalid target "${target}"`);
  }

  console.log(`Building adapter knowledge (target: ${target})...`);
  console.log('');

  let totalCount = 0;

  if (target === 'all' || target === 'claude-skill') {
    console.log('Building claude-skill adapter...');
    totalCount += buildClaudeSkill();
  }

  if (target === 'all' || target === 'chatgpt') {
    console.log('Building chatgpt adapter...');
    totalCount += buildChatGPT();
  }

  if (target === 'all' || target === 'gemini') {
    console.log('Building gemini adapter...');
    totalCount += buildGemini();
  }

  console.log('');
  console.log(`Done. Total files written: ${totalCount}`);
}

main();
