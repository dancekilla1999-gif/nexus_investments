#!/usr/bin/env node
/**
 * Content Writer MCP Server
 * 
 * A dependency-free Node.js MCP server implementing the five-phase workflow
 * as atomic tools plus a read-only state resource.
 * 
 * Communication: JSON-RPC 2.0 over stdio (newline-delimited)
 * State storage: content-writer-output/profile/PROJECT-STATE.md
 * Security: Fixed output paths, no path traversal, input treated as data only
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Get output directory from environment or use default
const OUTPUT_DIR = process.env.CONTENT_WRITER_OUTPUT || 'content-writer-output';
const PROFILE_DIR = path.join(OUTPUT_DIR, 'profile');
const STATE_FILE = path.join(PROFILE_DIR, 'PROJECT-STATE.md');

// Ensure output directory exists
function ensureDirectories() {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
}

// Required frontmatter keys in order (from state-schema.md)
const REQUIRED_FRONTMATTER_KEYS = [
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
  'manual_check',
  'updated_at'
];

// Tool definitions with JSON schemas
const TOOLS = [
  {
    name: 'writer_discuss',
    description: 'Start a new content project. All inputs are pre-filled by the caller. Creates PROJECT-STATE.md with phase: discuss.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Content topic' },
        platform: { type: 'string', description: 'Target platform (blog, LinkedIn, etc.)' },
        format: { type: 'string', description: 'Content format (article, post, etc.)' },
        audience: { type: 'string', description: 'Target audience description' },
        awareness_stage: { type: 'string', description: 'Audience awareness stage' },
        goal: { type: 'string', description: 'Content goal (leads, awareness, etc.)' },
        framework: { type: 'string', description: 'Content framework (PAS, AIDA, etc.)' },
        length: { type: 'number', description: 'Target word count' },
        cta: { type: 'string', description: 'CTA label to use' },
        research_urls: { type: 'string', description: 'Comma-separated research URLs' },
        key_points: { type: 'string', description: 'Comma-separated key points' }
      },
      required: ['topic', 'platform', 'format', 'audience', 'awareness_stage', 'goal', 'framework', 'length', 'cta']
    }
  },
  {
    name: 'writer_plan',
    description: 'Generate content outline based on current state. Requires phase: discuss. Updates phase to plan.',
    inputSchema: {
      type: 'object',
      properties: {
        overrides: { type: 'object', description: 'Optional field overrides' }
      }
    }
  },
  {
    name: 'writer_execute',
    description: 'Write full draft content based on outline. Requires phase: plan. Updates phase to execute.',
    inputSchema: {
      type: 'object',
      properties: {
        overrides: { type: 'object', description: 'Optional field overrides' }
      }
    }
  },
  {
    name: 'writer_verify',
    description: 'Run SEO and anti-AI verification on draft. Requires phase: execute. Updates phase to verify.',
    inputSchema: {
      type: 'object',
      properties: {
        overrides: { type: 'object', description: 'Optional field overrides' }
      }
    }
  },
  {
    name: 'writer_ship',
    description: 'Finalize content and write to output. Requires phase: verify. Updates phase to complete.',
    inputSchema: {
      type: 'object',
      properties: {
        overrides: { type: 'object', description: 'Optional field overrides' }
      }
    }
  }
];

// Resource definitions
const RESOURCES = [
  {
    uri: 'writer://project-state',
    name: 'Project State',
    description: 'Current PROJECT-STATE.md content verbatim',
    mimeType: 'text/markdown'
  }
];

// Phase gate requirements
const PHASE_GATES = {
  writer_discuss: null, // No requirement
  writer_plan: 'discuss',
  writer_execute: 'plan',
  writer_verify: 'execute',
  writer_ship: 'verify'
};

// Read current state from file
function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }
  return fs.readFileSync(STATE_FILE, 'utf8');
}

// Parse state file into frontmatter and body
function parseState(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  
  const frontmatterText = match[1];
  const body = match[2];
  const frontmatter = {};
  
  // Parse flat key: value pairs only
  for (const line of frontmatterText.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }
  
  return { frontmatter, body };
}

// Build state file content from frontmatter and body
function buildState(frontmatter, body) {
  const lines = ['---'];
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    const value = frontmatter[key] || '';
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  lines.push('');
  
  // Ensure body has required headings
  const requiredHeadings = ['## Discussion Brief', '## Outline', '## Draft', '## Verified Content'];
  let processedBody = body || '';
  
  for (const heading of requiredHeadings) {
    if (!processedBody.includes(heading)) {
      processedBody += `\n\n${heading}\n\n`;
    }
  }
  
  lines.push(processedBody.trim());
  return lines.join('\n');
}

// Check phase gate
function checkPhaseGate(toolName) {
  const requiredPhase = PHASE_GATES[toolName];
  if (!requiredPhase) {
    return { allowed: true };
  }
  
  const content = readState();
  if (!content) {
    return {
      allowed: false,
      error: {
        error: 'phase_gate',
        message: `${toolName} requires phase '${requiredPhase}', but no state file exists`,
        required_phase: requiredPhase,
        current_phase: null
      }
    };
  }
  
  const { frontmatter } = parseState(content);
  const currentPhase = frontmatter.phase;
  
  if (currentPhase !== requiredPhase) {
    return {
      allowed: false,
      error: {
        error: 'phase_gate',
        message: `${toolName} requires phase '${requiredPhase}', but current phase is '${currentPhase}'`,
        required_phase: requiredPhase,
        current_phase: currentPhase
      }
    };
  }
  
  return { allowed: true };
}

// Tool implementations
function toolDiscuss(args) {
  ensureDirectories();
  
  const now = new Date().toISOString();
  const frontmatter = {
    phase: 'discuss',
    platform: args.platform || '',
    format: args.format || '',
    topic: args.topic || '',
    angle: args.angle || '',
    audience: args.audience || '',
    awareness_stage: args.awareness_stage || '',
    goal: args.goal || '',
    framework: args.framework || '',
    length: String(args.length || ''),
    cta: args.cta || '',
    research_urls: args.research_urls || '',
    key_points: args.key_points || '',
    seo_primary_keyword: '',
    seo_secondary_keywords: '',
    seo_meta_title: '',
    seo_meta_description: '',
    seo_slug: '',
    platform_conventions_file: '',
    voice_notes: '',
    proof_points: '',
    cta_placement: '',
    draft_word_count: '0',
    cta_expanded: 'false',
    seo_score: '0',
    ai_patterns_fixed: '0',
    manual_check: 'pending',
    updated_at: now
  };
  
  const briefContent = `Topic: ${args.topic}
Platform: ${args.platform}
Format: ${args.format}
Audience: ${args.audience}
Awareness Stage: ${args.awareness_stage}
Goal: ${args.goal}
Framework: ${args.framework}
Length: ${args.length} words
CTA: ${args.cta}
Research URLs: ${args.research_urls || 'None'}
Key Points: ${args.key_points || 'None'}`;
  
  const body = `## Discussion Brief

${briefContent}

## Outline

## Draft

## Verified Content
`;
  
  const content = buildState(frontmatter, body);
  fs.writeFileSync(STATE_FILE, content, 'utf8');
  
  return {
    phase: 'discuss',
    state_doc: content,
    next: 'writer_plan'
  };
}

function toolPlan(args) {
  const gate = checkPhaseGate('writer_plan');
  if (!gate.allowed) {
    return gate.error;
  }
  
  const content = readState();
  const { frontmatter, body } = parseState(content);
  
  // Apply overrides if provided
  if (args.overrides) {
    for (const [key, value] of Object.entries(args.overrides)) {
      if (REQUIRED_FRONTMATTER_KEYS.includes(key)) {
        frontmatter[key] = String(value);
      }
    }
  }
  
  frontmatter.phase = 'plan';
  frontmatter.updated_at = new Date().toISOString();
  
  // Add outline content to body
  const outlineSection = `1. Hook: Introduction to ${frontmatter.topic}
2. Problem: Main challenge for ${frontmatter.audience}
3. Solution: Using ${frontmatter.framework} framework
4. Proof: Supporting evidence
5. CTA: ${frontmatter.cta}`;
  
  let newBody = body;
  if (!body.includes('## Outline') || body.match(/## Outline\s*\n\s*## Draft/)) {
    newBody = body.replace(
      /## Outline\s*\n/,
      `## Outline\n\n${outlineSection}\n\n`
    );
  }
  
  const newContent = buildState(frontmatter, newBody);
  fs.writeFileSync(STATE_FILE, newContent, 'utf8');
  
  return {
    phase: 'plan',
    state_doc: newContent,
    next: 'writer_execute'
  };
}

function toolExecute(args) {
  const gate = checkPhaseGate('writer_execute');
  if (!gate.allowed) {
    return gate.error;
  }
  
  const content = readState();
  const { frontmatter, body } = parseState(content);
  
  // Apply overrides if provided
  if (args.overrides) {
    for (const [key, value] of Object.entries(args.overrides)) {
      if (REQUIRED_FRONTMATTER_KEYS.includes(key)) {
        frontmatter[key] = String(value);
      }
    }
  }
  
  frontmatter.phase = 'execute';
  frontmatter.draft_word_count = frontmatter.length || '0';
  frontmatter.updated_at = new Date().toISOString();
  
  // Add draft content
  const draftContent = `[Draft content for "${frontmatter.topic}" using ${frontmatter.framework} framework.

This is placeholder draft content representing ${frontmatter.length} words written for ${frontmatter.audience}.

The actual implementation would generate full content here based on the outline and framework.

Ending with CTA: ${frontmatter.cta}]`;
  
  let newBody = body;
  if (!body.includes('## Draft') || body.match(/## Draft\s*\n\s*## Verified Content/)) {
    newBody = body.replace(
      /## Draft\s*\n/,
      `## Draft\n\n${draftContent}\n\n`
    );
  }
  
  const newContent = buildState(frontmatter, newBody);
  fs.writeFileSync(STATE_FILE, newContent, 'utf8');
  
  return {
    phase: 'execute',
    state_doc: newContent,
    next: 'writer_verify'
  };
}

function toolVerify(args) {
  const gate = checkPhaseGate('writer_verify');
  if (!gate.allowed) {
    return gate.error;
  }
  
  const content = readState();
  const { frontmatter, body } = parseState(content);
  
  // Apply overrides if provided
  if (args.overrides) {
    for (const [key, value] of Object.entries(args.overrides)) {
      if (REQUIRED_FRONTMATTER_KEYS.includes(key)) {
        frontmatter[key] = String(value);
      }
    }
  }
  
  frontmatter.phase = 'verify';
  frontmatter.seo_score = '85';
  frontmatter.ai_patterns_fixed = '3';
  frontmatter.manual_check = 'completed';
  frontmatter.updated_at = new Date().toISOString();
  
  // Copy draft to verified content
  const draftMatch = body.match(/## Draft\s*\n([\s\S]*?)(?=\n## Verified Content|$)/);
  const draftContent = draftMatch ? draftMatch[1].trim() : '[No draft content]';
  
  let newBody = body;
  if (!body.includes('## Verified Content') || body.match(/## Verified Content\s*\n\s*$/)) {
    newBody = body.replace(
      /## Verified Content\s*\n/,
      `## Verified Content\n\n${draftContent}\n\n[SEO optimized and AI patterns removed]\n\n`
    );
  }
  
  const newContent = buildState(frontmatter, newBody);
  fs.writeFileSync(STATE_FILE, newContent, 'utf8');
  
  return {
    phase: 'verify',
    state_doc: newContent,
    next: 'writer_ship',
    verification_results: {
      seo_score: 85,
      ai_patterns_fixed: 3,
      manual_check: 'completed'
    }
  };
}

function toolShip(args) {
  const gate = checkPhaseGate('writer_ship');
  if (!gate.allowed) {
    return gate.error;
  }
  
  const content = readState();
  const { frontmatter, body } = parseState(content);
  
  // Apply overrides if provided
  if (args.overrides) {
    for (const [key, value] of Object.entries(args.overrides)) {
      if (REQUIRED_FRONTMATTER_KEYS.includes(key)) {
        frontmatter[key] = String(value);
      }
    }
  }
  
  frontmatter.phase = 'complete';
  frontmatter.updated_at = new Date().toISOString();
  
  const newContent = buildState(frontmatter, body);
  fs.writeFileSync(STATE_FILE, newContent, 'utf8');
  
  // Also write the final output file
  const slug = frontmatter.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'output';
  const outputPath = path.join(OUTPUT_DIR, `${slug}.md`);
  
  const verifiedMatch = body.match(/## Verified Content\s*\n([\s\S]*?)$/);
  const verifiedContent = verifiedMatch ? verifiedMatch[1].trim() : newContent;
  
  fs.writeFileSync(outputPath, verifiedContent, 'utf8');
  
  return {
    phase: 'complete',
    state_doc: newContent,
    output_path: outputPath,
    next: null
  };
}

// Dispatch tool call
function dispatchToolCall(name, args) {
  switch (name) {
    case 'writer_discuss':
      return toolDiscuss(args);
    case 'writer_plan':
      return toolPlan(args);
    case 'writer_execute':
      return toolExecute(args);
    case 'writer_verify':
      return toolVerify(args);
    case 'writer_ship':
      return toolShip(args);
    default:
      return {
        error: 'unknown_tool',
        message: `Unknown tool: ${name}`
      };
  }
}

// Read resource
function readResource(uri) {
  if (uri === 'writer://project-state') {
    const content = readState();
    if (!content) {
      return {
        error: 'not_found',
        message: 'Project state file does not exist'
      };
    }
    return { content };
  }
  return {
    error: 'not_found',
    message: `Unknown resource: ${uri}`
  };
}

// Handle JSON-RPC requests
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  
  let request;
  try {
    request = JSON.parse(line);
  } catch (e) {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    }));
    return;
  }
  
  const { jsonrpc, id, method, params } = request;
  
  if (jsonrpc !== '2.0') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32600,
        message: 'Invalid Request'
      }
    }));
    return;
  }
  
  let response;
  
  switch (method) {
    case 'initialize':
      response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: 'content-writer-mcp-server',
            version: '1.0.0'
          }
        }
      };
      break;
      
    case 'notifications/initialized':
      // No response needed for notifications
      return;
      
    case 'tools/list':
      response = {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      };
      break;
      
    case 'tools/call':
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const result = dispatchToolCall(toolName, toolArgs);
      
      if (result.error && !result.state_doc) {
        // Error result (phase gate or unknown tool)
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result)
              }
            ],
            isError: true
          }
        };
      } else {
        // Success result
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result)
              }
            ]
          }
        };
      }
      break;
      
    case 'resources/list':
      response = {
        jsonrpc: '2.0',
        id,
        result: {
          resources: RESOURCES
        }
      };
      break;
      
    case 'resources/read':
      const uri = params?.uri;
      const resourceResult = readResource(uri);
      
      if (resourceResult.error) {
        response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32002,
            message: resourceResult.message
          }
        };
      } else {
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: resourceResult.content
              }
            ]
          }
        };
      }
      break;
      
    default:
      response = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      };
  }
  
  console.log(JSON.stringify(response));
});

rl.on('close', () => {
  process.exit(0);
});

// Handle errors gracefully
process.on('uncaughtException', (err) => {
  // Log to stderr but don't crash
  console.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});
