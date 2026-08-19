# Setup Guide: Headless / Automated Agent (MCP Server)

Applies to Content Writer v2.4.0.

Run Content Writer as a headless, automated service. It uses the Model Context Protocol (MCP) server.

---

## Prerequisites

- Node.js 14+ installed
- An MCP-capable client (Claude Code, Claude Desktop, n8n, custom scripts)

---

## Overview

The headless adapter runs Content Writer as an MCP server. The server is a local or self-hosted service. It runs the five-phase workflow as atomic tools. Any MCP-capable client can connect to it. The clients include:

- Claude Code (through MCP configuration)
- Claude Desktop (through MCP settings)
- n8n (through the MCP Client Tool node)
- Zapier, Make.com (through MCP connectors)
- Custom automation scripts

This is a local or self-hosted reference implementation. It is not a hosted backend service. You run it on your own machine. It writes to local filesystem paths only.

---

## Installation Steps

### Step 1: Locate the Server

The MCP server is at this path:

```
skills/adapters/mcp-server/
```

This folder contains:
- `README.md`: the full tool contract and documentation
- `server/server.js`: the MCP server implementation (dependency-free Node.js)
- `server/test-harness.js`: the test harness for verification

### Step 2: Run the Server

The server talks over stdio. It uses newline-delimited JSON-RPC 2.0.

**Basic run:**

```bash
node skills/adapters/mcp-server/server/server.js
```

**With custom output directory:**

```bash
CONTENT_WRITER_OUTPUT=/path/to/output node skills/adapters/mcp-server/server/server.js
```

Default output directory: `content-writer-output/` (relative to the working directory)

### Step 3: Connect Your MCP Client

#### Claude Code / Claude Desktop

Add this block to your MCP settings file. The location changes by client:

```json
{
  "mcpServers": {
    "content-writer": {
      "command": "node",
      "args": ["/absolute/path/to/repo/skills/adapters/mcp-server/server/server.js"]
    }
  }
}
```

**Note:** Use the absolute path to `server.js`.

#### n8n MCP Client Tool

Set the MCP Client Tool node to start the server as a subprocess:

1. Add an MCP Client Tool node to your workflow.
2. Set command: `node`
3. Set arguments: `/absolute/path/to/repo/skills/adapters/mcp-server/server/server.js`
4. Connect and use the Content Writer tools.

#### Custom Scripts

Start the process. Write JSON-RPC messages to stdin, one per line:

```bash
# Start the server
node skills/adapters/mcp-server/server/server.js
```

Send JSON-RPC messages:

```json
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}}
{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "writer_discuss", "arguments": {"topic": "Test", "platform": "blog", "format": "article", "audience": "testers", "awareness_stage": "problem-aware", "goal": "leads", "framework": "PAS", "length": 500, "cta": "test"}}}
```

---

## Tool Contract

The MCP server gives you five phase tools and one resource:

### Tools

| Tool | Input | Output | Phase Gate |
|------|-------|--------|------------|
| `writer_discuss` | topic, platform, format, audience, awareness_stage, goal, framework, length, cta, research_urls, key_points | phase, state_doc, next | None (starts workflow) |
| `writer_plan` | overrides (optional) | phase, state_doc, next | Requires phase: discuss |
| `writer_execute` | overrides (optional) | phase, state_doc, next | Requires phase: plan |
| `writer_verify` | overrides (optional) | phase, state_doc, next, verification_results | Requires phase: execute |
| `writer_ship` | overrides (optional) | phase, state_doc, output_path, next | Requires phase: verify |

### Resource

| Resource | URI | Output |
|----------|-----|--------|
| Project State | `writer://project-state` | Full PROJECT-STATE.md content |

### STE Compliance Gate (writer_verify)

The `writer_verify` tool runs a mandatory STE compliance gate on the draft. The gate blocks the workflow when it fails.

The server runs this command on the draft file:

```bash
node scripts/ste-lint.js --gate=<platform> <draft-file>
```

The linter resolves the STE tier from the platform and format. It exits 0 (pass) or 1 (fail).

If the linter fails, the server returns an `ste_gate` error object. It does not advance to the verify phase. The error object has four fields: `error`, `message`, `tier`, and `failures`.

The linter uses three tiers. Each tier has a threshold:

- **strict**: zero violations
- **prose**: 3.0 or fewer violations per 100 words
- **social**: 4.0 or fewer violations per 100 words

The marketing-adjective count and the banned-word count must be zero on every tier.

A pass writes two new fields to the state: `ste_gate` and `ste_per100w`. The STE rules live in `references/ste-writing-rules.md`.

### Phase Gate Errors

If you call a tool out of order, it returns a structured error. It does not throw an exception:

```json
{
  "error": "phase_gate",
  "message": "writer_plan requires phase 'discuss', but current phase is 'complete'",
  "required_phase": "discuss",
  "current_phase": "complete"
}
```

This is the stateful gate pattern. The server enforces workflow order in a deterministic way.

---

## Worked Example

### 1. Start a Project (writer_discuss)

**Input:**
```json
{
  "topic": "MVP validation before building",
  "platform": "blog",
  "format": "article",
  "audience": "early-stage founders",
  "awareness_stage": "problem-aware",
  "goal": "leads",
  "framework": "PAS",
  "length": 1200,
  "cta": "soft_booking",
  "research_urls": "https://example.com/a, https://example.com/b",
  "key_points": "point one, point two, point three"
}
```

**Output:**
```json
{
  "phase": "discuss",
  "state_doc": "---\nphase: discuss\nplatform: blog\nformat: article\ntopic: MVP validation before building\n...\n---\n\n## Discussion Brief\n[Generated brief content...]\n\n## Outline\n\n## Draft\n\n## Verified Content\n",
  "next": "writer_plan"
}
```

### 2. Create Outline (writer_plan)

**Input:**
```json
{
  "overrides": {
    "framework": "AIDA"
  }
}
```

**Output:**
```json
{
  "phase": "plan",
  "state_doc": "---\nphase: plan\n...\n---\n\n## Discussion Brief\n...\n\n## Outline\n1. Hook: The expensive mistake most founders make\n2. Problem: Building without validation\n3. Solution: 3-week MVP sprint framework\n4. Proof: HealthTech Platform case study\n5. CTA: Book a 30-min call\n\n## Draft\n\n## Verified Content\n",
  "next": "writer_execute"
}
```

### 3. Write Draft (writer_execute)

**Input:**
```json
{}
```

**Output:**
```json
{
  "phase": "execute",
  "state_doc": "---\nphase: execute\n...\n---\n\n## Discussion Brief\n...\n\n## Outline\n...\n\n## Draft\n[Full article draft content... 1200 words following the outline]\n\n## Verified Content\n",
  "next": "writer_verify"
}
```

### 4. Verify (writer_verify)

The tool runs the STE compliance gate first. If the gate passes, the output holds the `ste_gate` and `ste_per100w` results with the SEO and anti-AI results.

**Input:**
```json
{}
```

**Output:**
```json
{
  "phase": "verify",
  "state_doc": "---\nphase: verify\n...\n---\n\n...",
  "next": "writer_ship",
  "verification_results": {
    "seo_score": 85,
    "ai_patterns_fixed": 3,
    "ste_gate": "pass",
    "ste_per100w": 1.8,
    "manual_check": "All checks passed"
  }
}
```

If the STE gate fails, the tool returns this error object instead. It does not advance to the verify phase:

```json
{
  "error": "ste_gate",
  "message": "STE compliance gate failed for tier 'prose'",
  "tier": "prose",
  "failures": ["marketing_adjective=2 (must be 0 on every tier)", "total_per100w=4.1 (must be <= 3.0)"]
}
```

### 5. Ship (writer_ship)

**Input:**
```json
{}
```

**Output:**
```json
{
  "phase": "complete",
  "state_doc": "---\nphase: complete\n...\n---\n\n...",
  "output_path": "content-writer-output/blog/mvp-validation-before-building.md",
  "next": null
}
```

---

## State Document Schema

All tools read and write `PROJECT-STATE.md`. They use the frontmatter field names defined in `skills/state-schema.md`. The file uses a restricted YAML subset: flat `key: value` pairs only, no nested structures, and no multiline blocks.

**Required frontmatter keys (30 total):**
- `phase`, `platform`, `format`, `topic`, `angle`, `audience`, `awareness_stage`, `goal`
- `framework`, `length`, `cta`, `research_urls`, `key_points`
- `seo_primary_keyword`, `seo_secondary_keywords`, `seo_meta_title`, `seo_meta_description`, `seo_slug`
- `platform_conventions_file`, `voice_notes`, `proof_points`, `cta_placement`
- `draft_word_count`, `cta_expanded`, `seo_score`, `ai_patterns_fixed`, `ste_gate`, `ste_per100w`, `manual_check`, `updated_at`

**Required body headings:**
1. `## Discussion Brief`
2. `## Outline`
3. `## Draft`
4. `## Verified Content`

---

## Security Considerations

1. **Local-only execution:** This server runs on the local machine of the user, not as a hosted service. It writes to local filesystem paths only.

2. **Fixed output paths:** The output directory (`content-writer-output/` by default) is a fixed constant or comes from an environment variable. The server never builds it from user input fields. This stops path traversal attacks.

3. **Input as data:** The server treats caller-supplied frontmatter values as data, not as instructions. The server checks phase order. It does not run arbitrary code from input fields.

4. **Error responses:** Phase-gate errors return structured JSON with only the expected phase name. They never return stack traces or filesystem paths.

---

## Capabilities vs. Claude Code

| Feature | MCP Server | Claude Code |
|---------|------------|-------------|
| **Invocation** | JSON-RPC tool calls | Slash commands (`/writer:*`) |
| **State persistence** | File-based (PROJECT-STATE.md) | File-based (PROJECT-STATE.md) |
| **Profile storage** | Caller-supplied or file-based | Automatic file storage |
| **URL fetching** | Not available (headless) | Full network access |
| **SEO/humanizer integration** | Manual checklist fallback | Automatic skill invocation |
| **STE compliance gate** | Available | Available |
| **Multi-platform packages** | Available | Available |
| **Auto-update check** | Not available | Available |
| **Use case** | Automation, pipelines, agents | Interactive content creation |

---

## No Network Access

The MCP server has no network access. It cannot fetch URLs. If your workflow needs URL analysis (for example, for tone detection), you must do one of these steps:

1. Fetch the content outside the server.
2. Pass the relevant text in the `key_points` or `research_urls` fields.
3. Handle URL fetching in your client before you call the server.

---

## Full Tool Contract

For the full tool specifications, the input and output schemas, and more examples, see this file:

```
skills/adapters/mcp-server/README.md
```

This README holds the authoritative contract for all five tools and the project-state resource.

---

## Verify It Worked

Run the test harness to check that the server works correctly:

```bash
node skills/adapters/mcp-server/server/test-harness.js
```

The test harness:
1. Starts the server as a child process
2. Runs all five tools with fixture input
3. Reports PASS or FAIL for each assertion
4. Removes test files (it uses an isolated temp directory)

**Expected output:**
```
Testing writer_discuss... PASS
Testing writer_plan... PASS
Testing writer_execute... PASS
Testing writer_verify... PASS
Testing writer_ship... PASS
All tests passed!
```

If all tests pass, your MCP server works correctly.

---

## Troubleshooting

**"Server won't start"**
- Check that Node.js 14+ is installed: `node --version`
- Check that the path to `server.js` is correct.
- Check that the file has read permissions.

**"Connection refused"**
- The server uses stdio, not TCP ports. There is no connection in the traditional sense.
- Check that your MCP client starts the server as a subprocess.
- Check that the command and args in your MCP config are correct.

**"Phase gate errors"**
- This behavior is expected if you call tools out of order.
- Always follow the sequence: discuss, plan, execute, verify, ship.
- Check the `phase` field in your state document before each call.

**"STE gate errors"**
- The `writer_verify` tool blocks a draft that fails the STE compliance gate.
- Read the `failures` field in the `ste_gate` error object. It lists each violation.
- Make the marketing-adjective count and the banned-word count zero. They fail the gate on every tier.
- Bring `total_per100w` under the tier threshold (prose 3.0, social 4.0). The strict tier allows zero violations.
- Fix the draft and run `writer_verify` again.

**"Output files not appearing"**
- Check the output directory (default: `content-writer-output/`).
- Check write permissions in the output directory.
- Set the `CONTENT_WRITER_OUTPUT` env var to use a custom location.

**"Test harness fails"**
- Check that the server starts without errors.
- Check the Node.js version compatibility.
- Read the specific test that failed for error details.
