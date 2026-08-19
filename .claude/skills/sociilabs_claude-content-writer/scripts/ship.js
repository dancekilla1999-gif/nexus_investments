#!/usr/bin/env node

/**
 * Content Writer Ship Script
 * 
 * Automates the release process:
 * 1. Validates version bump (patch/minor/major)
 * 2. Updates package.json version
 * 3. Updates CHANGELOG.md with release date
 * 4. Builds adapter knowledge files
 * 5. Creates distribution zip files
 * 6. Publishes to npm (optional)
 * 7. Creates git tag
 * 
 * Usage: node scripts/ship.js [patch|minor|major] [--publish]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  console.error(`${colors.red}ERROR: ${message}${colors.reset}`);
  process.exit(1);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

// Parse arguments
const args = process.argv.slice(2);
const versionType = args.find(arg => ['patch', 'minor', 'major'].includes(arg));
const shouldPublish = args.includes('--publish');
const skipConfirm = args.includes('--yes') || args.includes('-y');

if (!versionType) {
  log('\nContent Writer Ship Script', 'bright');
  log('==========================\n');
  log('Usage: node scripts/ship.js [patch|minor|major] [options]\n');
  log('Options:');
  log('  --publish    Publish to npm after building');
  log('  --yes, -y    Skip confirmation prompts\n');
  log('Version types:');
  log('  patch  - Bug fixes (2.2.0 -> 2.2.1)');
  log('  minor  - New features (2.2.0 -> 2.3.0)');
  log('  major  - Breaking changes (2.2.0 -> 3.0.0)\n');
  process.exit(0);
}

// Read current version
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// Calculate new version
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;

switch (versionType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

log('\n📦 Content Writer Release', 'bright');
log('========================\n');
log(`Current version: ${currentVersion}`);
log(`New version:     ${newVersion}\n`);

// Confirmation
if (!skipConfirm) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question(`Continue with ${versionType} release to v${newVersion}? (yes/no): `, (answer) => {
    readline.close();
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      log('\nRelease cancelled.', 'yellow');
      process.exit(0);
    }
    runRelease();
  });
} else {
  runRelease();
}

function runRelease() {
  try {
    log('\n🚀 Starting release process...\n', 'bright');

    // Step 1: Check git status
    log('Step 1: Checking git status...');
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      if (status.trim()) {
        log('\n⚠️  Uncommitted changes detected:', 'yellow');
        log(status);
        error('Please commit or stash changes before releasing');
      }
      success('Git status clean');
    } catch (e) {
      error('Failed to check git status');
    }

    // Step 2: Run tests
    log('\nStep 2: Running verification tests...');
    try {
      execSync('npm run verify', { stdio: 'inherit' });
      success('All tests passed');
    } catch (e) {
      error('Tests failed. Fix before releasing.');
    }

    // Step 3: Update package.json
    log('\nStep 3: Updating package.json...');
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    success(`Updated package.json to v${newVersion}`);

    // Step 4: Update CHANGELOG.md
    log('\nStep 4: Updating CHANGELOG.md...');
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    
    const today = new Date().toISOString().split('T')[0];
    const unreleasedSection = changelog.indexOf('## [Unreleased]');
    
    if (unreleasedSection !== -1) {
      // Find the end of unreleased section (next ##)
      const nextSection = changelog.indexOf('## [', unreleasedSection + 1);
      const unreleasedContent = changelog.slice(unreleasedSection, nextSection);
      
      // Check if there's actual content in unreleased
      const hasContent = unreleasedContent.includes('### Added') || 
                         unreleasedContent.includes('### Changed') ||
                         unreleasedContent.includes('### Fixed');
      
      if (!hasContent) {
        log('\n⚠️  No changes documented in [Unreleased] section', 'yellow');
        log('Please update CHANGELOG.md before releasing\n');
        
        // Revert package.json
        packageJson.version = currentVersion;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        process.exit(1);
      }
      
      // Replace [Unreleased] with new version
      const newSection = `## [Unreleased]

---

## [${newVersion}] - ${today}`;
      
      changelog = changelog.replace('## [Unreleased]', newSection);
      fs.writeFileSync(changelogPath, changelog);
      success(`Updated CHANGELOG.md with v${newVersion}`);
    } else {
      log('⚠️  Could not find [Unreleased] section in CHANGELOG', 'yellow');
    }

    // Step 5: Build adapter files
    log('\nStep 5: Building adapter knowledge files...');
    try {
      execSync('npm run build:adapters', { stdio: 'inherit' });
      success('Adapter files built');
    } catch (e) {
      error('Failed to build adapter files');
    }

    // Step 6: Create distribution zips
    log('\nStep 6: Creating distribution packages...');
    const distDir = path.join(process.cwd(), 'dist');
    
    // Ensure dist directory exists
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Create Claude Code skill zip
    log('  Creating Claude Code skill package...');
    const claudeCodeFiles = [
      'skills/content-writer/',
      'references/',
      'README.md',
      'CHANGELOG.md',
      'LICENSE'
    ];
    
    try {
      // Create temp directory for packaging
      const tempDir = path.join(distDir, 'temp-claude-code');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Copy files
      claudeCodeFiles.forEach(file => {
        const src = path.join(process.cwd(), file);
        const dest = path.join(tempDir, file);
        if (fs.existsSync(src)) {
          if (fs.lstatSync(src).isDirectory()) {
            execSync(`cp -r "${src}" "${dest}"`);
          } else {
            fs.copyFileSync(src, dest);
          }
        }
      });
      
      // Create zip
      const zipName = `content-writer-v${newVersion}-claude-code.zip`;
      execSync(`cd "${tempDir}" && zip -r "${path.join(distDir, zipName)}" . -x "*.DS_Store" -x "__MACOSX/*"`);
      
      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
      success(`Created ${zipName}`);
    } catch (e) {
      error(`Failed to create Claude Code package: ${e.message}`);
    }

    // Create Claude AI skill zip
    log('  Creating Claude AI skill package...');
    try {
      const tempDir = path.join(distDir, 'temp-claude-ai');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Copy Claude AI skill files
      const claudeAiSrc = path.join(process.cwd(), 'skills/adapters/claude-skill');
      execSync(`cp -r "${claudeAiSrc}"/* "${tempDir}/"`);
      
      // Create zip
      const zipName = `content-writer-v${newVersion}-claude-ai.zip`;
      execSync(`cd "${tempDir}" && zip -r "${path.join(distDir, zipName)}" . -x "*.DS_Store"`);
      
      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
      success(`Created ${zipName}`);
    } catch (e) {
      error(`Failed to create Claude AI package: ${e.message}`);
    }

    // Create ChatGPT package
    log('  Creating ChatGPT skill package...');
    try {
      const tempDir = path.join(distDir, 'temp-chatgpt');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Copy ChatGPT files
      const chatgptSrc = path.join(process.cwd(), 'skills/adapters/chatgpt');
      execSync(`cp -r "${chatgptSrc}"/* "${tempDir}/"`);
      
      // Create zip
      const zipName = `content-writer-v${newVersion}-chatgpt.zip`;
      execSync(`cd "${tempDir}" && zip -r "${path.join(distDir, zipName)}" . -x "*.DS_Store"`);
      
      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
      success(`Created ${zipName}`);
    } catch (e) {
      error(`Failed to create ChatGPT package: ${e.message}`);
    }

    // Create Gemini package
    log('  Creating Gemini skill package...');
    try {
      const tempDir = path.join(distDir, 'temp-gemini');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Copy Gemini files
      const geminiSrc = path.join(process.cwd(), 'skills/adapters/gemini');
      execSync(`cp -r "${geminiSrc}"/* "${tempDir}/"`);
      
      // Create zip
      const zipName = `content-writer-v${newVersion}-gemini.zip`;
      execSync(`cd "${tempDir}" && zip -r "${path.join(distDir, zipName)}" . -x "*.DS_Store"`);
      
      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
      success(`Created ${zipName}`);
    } catch (e) {
      error(`Failed to create Gemini package: ${e.message}`);
    }

    // Create complete package
    log('  Creating complete package...');
    try {
      const zipName = `content-writer-v${newVersion}-complete.zip`;
      const filesToInclude = [
        'README.md',
        'CHANGELOG.md',
        'LICENSE',
        'package.json',
        'skills/',
        'references/',
        'scripts/',
        'docs/'
      ];
      
      execSync(`zip -r "${path.join(distDir, zipName)}" ${filesToInclude.join(' ')} -x "*.DS_Store" -x "node_modules/*" -x ".git/*"`);
      success(`Created ${zipName}`);
    } catch (e) {
      error(`Failed to create complete package: ${e.message}`);
    }

    // Step 7: Commit changes
    log('\nStep 7: Committing changes...');
    try {
      execSync('git add package.json CHANGELOG.md');
      execSync(`git commit -m "chore(release): bump version to v${newVersion}"`);
      success('Changes committed');
    } catch (e) {
      error('Failed to commit changes');
    }

    // Step 8: Create git tag
    log('\nStep 8: Creating git tag...');
    try {
      execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
      success(`Created tag v${newVersion}`);
    } catch (e) {
      error('Failed to create git tag');
    }

    // Step 9: Publish to npm (optional)
    if (shouldPublish) {
      log('\nStep 9: Publishing to npm...');
      try {
        execSync('npm publish', { stdio: 'inherit' });
        success('Published to npm');
      } catch (e) {
        error('Failed to publish to npm');
      }
    } else {
      log('\nStep 9: Skipping npm publish (use --publish to enable)');
    }

    // Success summary
    log('\n✨ Release Complete!', 'bright');
    log('===================\n');
    log(`Version: v${newVersion}`, 'green');
    log(`Tag: v${newVersion}`, 'green');
    log(`\nDistribution files created in ./dist/:`, 'cyan');
    
    const distFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.zip'));
    distFiles.forEach(file => {
      const stats = fs.statSync(path.join(distDir, file));
      const size = (stats.size / 1024).toFixed(1);
      log(`  • ${file} (${size} KB)`);
    });

    log(`\nNext steps:`, 'cyan');
    log(`  1. Review the changes: git show`);
    log(`  2. Push to remote: git push && git push --tags`);
    if (!shouldPublish) {
      log(`  3. Publish to npm: npm publish`);
    }
    log(`  4. Create GitHub release with distribution files`);
    log(`\n${'='.repeat(50)}\n`);

  } catch (error) {
    log(`\n❌ Release failed: ${error.message}`, 'red');
    process.exit(1);
  }
}
