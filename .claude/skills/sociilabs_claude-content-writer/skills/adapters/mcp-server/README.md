# Content Writer MCP Server

A local/self-hosted MCP (Model Context Protocol) server implementing the five-phase Content Writer workflow as atomic tools plus a read-only state resource.

**This is a local/self-hosted reference implementation, not a hosted backend service.** Run it as a stdio subprocess on your own machine. Any MCP-capable client (Claude Code, Claude Desktop, n8n MCP Client Tool, custom scripts) can connect to it.

---

## Architecture

The Content Writer workflow has five phases: **Discuss → Plan → Execute → Verify → Ship**. Each phase is exposed as a separate MCP tool, not a single multiplexed tool with a mode switch. This follows MCP community consensus for atomic, composable tools with clear per-tool descriptions.

The server maintains state in `content-writer-output/profile/PROJECT-STATE.md` using the exact frontmatter field names defined in `skills/state-schema.md`.

### Phase-Gate Rule

Each tool checks the current `phase` field before running and returns a structured error (not a thrown exception) if called out of order. This is the "stateful gate" pattern — the server enforces workflow ordering deterministically rather than trusting the caller's memory.

| Tool | Requires Phase | Sets Phase | Error if Called When |
|------|---------------|------------|---------------------|
| `writer_discuss` | (none) | `discuss` | — |
| `writer_plan` | `discuss` | `plan` | Phase is not `discuss` |
| `writer_execute` | `plan` | `execute` | Phase is not `plan` |
| `writer_verify` | `execute` | `verify` | Phase is not `execute` |
| `writer_ship` | `verify` | `complete` | Phase is not `verify` |

---

## Tools

### `writer_discuss`

Starts a new content project. All inputs are pre-filled by the caller — the tool never blocks waiting for human clarification.

**Input Schema:**
```json
{
  "topic": "string",
  "platform": "string",
  "format": "string",
  "audience": "string",
  "awareness_stage": "string",
  "goal": "string",
  "framework": "string",
  "length": "number",
  "cta": "string",
  "research_urls": "string (comma-separated)",
  "key_points": "string (comma-separated)"
}
```

**Output:**
```json
{
  "phase": "discuss",
  "state_doc": "string (full PROJECT-STATE.md content)",
  "next": "writer_plan"
}
```

**Worked Example:**

Input:
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

Output:
```json
{
  "phase": "discuss",
  "state_doc": "---\nphase: discuss\nplatform: blog\nformat: article\ntopic: MVP validation before building\naudience: early-stage founders\nawareness_stage: problem-aware\ngoal: leads\nframework: PAS\nlength: 1200\ncta: soft_booking\nresearch_urls: https://example.com/a, https://example.com/b\nkey_points: point one, point two, point three\nupdated_at: 2026-07-04T12:00:00Z\n---\n\n## Discussion Brief\n\n[Generated brief content...]\n\n## Outline\n\n## Draft\n\n## Verified Content\n",
  "next": "writer_plan"
}
```

---

### `writer_plan`

Generates the content outline based on the current PROJECT-STATE.md. Reads the file, produces the outline, updates the state.

**Input Schema:**
```json
{
  "overrides": "object (optional) — map of field names to override values"
}
```

**Output:**
```json
{
  "phase": "plan",
  "state_doc": "string (full PROJECT-STATE.md content)",
  "next": "writer_execute"
}
```

**Phase-Gate Error:**
```json
{
  "error": "phase_gate",
  "message": "writer_plan requires phase 'discuss', but current phase is 'complete'",
  "required_phase": "discuss",
  "current_phase": "complete"
}
```

**Worked Example:**

Input:
```json
{
  "overrides": {
    "framework": "AIDA"
  }
}
```

Output:
```json
{
  "phase": "plan",
  "state_doc": "---\nphase: plan\nplatform: blog\nformat: article\ntopic: MVP validation before building\n...\n---\n\n## Discussion Brief\n\n[Previous brief...]\n\n## Outline\n\n1. Hook: The expensive mistake most founders make\n2. Problem: Building without validation\n3. Solution: 3-week MVP sprint framework\n4. Proof: HealthTech Platform case study\n5. CTA: Book a 30-min call\n\n## Draft\n\n## Verified Content\n",
  "next": "writer_execute"
}
```

---

### `writer_execute`

Writes the full draft content based on the outline. Reads PROJECT-STATE.md, produces the draft, updates the state.

**Input Schema:**
```json
{
  "overrides": "object (optional) — map of field names to override values"
}
```

**Output:**
```json
{
  "phase": "execute",
  "state_doc": "string (full PROJECT-STATE.md content)",
  "next": "writer_verify"
}
```

**Phase-Gate Error:**
```json
{
  "error": "phase_gate",
  "message": "writer_execute requires phase 'plan', but current phase is 'discuss'",
  "required_phase": "plan",
  "current_phase": "discuss"
}
```

**Worked Example:**

Input:
```json
{}
```

Output:
```json
{
  "phase": "execute",
  "state_doc": "---\nphase: execute\n...\n---\n\n## Discussion Brief\n\n...\n\n## Outline\n\n...\n\n## Draft\n\n[Full article draft content... 1200 words following the outline, using PAS framework, ending with soft_booking CTA]\n\n## Verified Content\n",
  "next": "writer_verify"
}
```

---

### `writer_verify`

Runs the STE compliance gate, SEO optimization, and anti-AI pattern auditing on the draft. Updates the state with verification results.

**STE compliance gate (mandatory, blocking):** the server runs `node scripts/ste-lint.js --gate=<platform> <draft-file>` on the draft. The linter resolves the STE tier from the platform/format and exits 0 (PASS) or 1 (FAIL). `marketing_adjective` and `banned_word` must be 0 on every tier; per-tier thresholds are strict (`total` == 0), prose (`total_per100w` <= 3.0), and social (`total_per100w` <= 4.0). On FAIL the server returns a `ste_gate` error (below) instead of advancing to `verify`. The rules live in `references/ste-writing-rules.md`.

**Input Schema:**
```json
{
  "overrides": "object (optional) — map of field names to override values"
}
```

**Output:**
```json
{
  "phase": "verify",
  "state_doc": "string (full PROJECT-STATE.md content)",
  "next": "writer_ship",
  "verification_results": {
    "seo_score": "number",
    "ai_patterns_fixed": "number",
    "ste_gate": "string (pass)",
    "ste_per100w": "number",
    "manual_check": "string"
  }
}
```

**STE-Gate Error** (returned instead of advancing when the linter fails):
```json
{
  "error": "ste_gate",
  "message": "STE compliance gate failed for tier 'prose'",
  "tier": "prose",
  "failures": ["marketing_adjective=2 (must be 0 on every tier)", "total_per100w=4.1 (must be <= 3.0)"]
}
```

**Phase-Gate Error:**
```json
{
  "error": "phase_gate",
  "message": "writer_verify requires phase 'execute', but current phase is 'plan'",
  "required_phase": "execute",
  "current_phase": "plan"
}
```

---

### `writer_ship`

Finalizes the content and writes it to the output directory. Sets phase to `complete`.

**Input Schema:**
```json
{
  "overrides": "object (optional) — map of field names to override values"
}
```

**Output:**
```json
{
  "phase": "complete",
  "state_doc": "string (full PROJECT-STATE.md content)",
  "output_path": "string (path to written file)",
  "next": null
}
```

**Phase-Gate Error:**
```json
{
  "error": "phase_gate",
  "message": "writer_ship requires phase 'verify', but current phase is 'execute'",
  "required_phase": "verify",
  "current_phase": "execute"
}
```

**Worked Example:**

Input:
```json
{}
```

Output:
```json
{
  "phase": "complete",
  "state_doc": "---\nphase: complete\n...\n---\n\n## Discussion Brief\n\n...\n\n## Outline\n\n...\n\n## Draft\n\n...\n\n## Verified Content\n\n[Final corrected content...]\n",
  "output_path": "content-writer-output/mvp-validation-before-building.md",
  "next": null
}
```

---

## Resources

### `writer://project-state`

Read-only resource exposing the current PROJECT-STATE.md content verbatim.

**Resource URI:** `writer://project-state`

**Output:** String containing the full file content (YAML frontmatter + markdown body).

**Example:**
```
---
phase: plan
platform: blog
format: article
topic: MVP validation before building
audience: early-stage founders
awareness_stage: problem-aware
goal: leads
framework: PAS
length: 1200
cta: soft_booking
research_urls: https://example.com/a, https://example.com/b
key_points: point one, point two, point three
updated_at: 2026-07-04T12:30:00Z
---

## Discussion Brief

...

## Outline

...

## Draft

## Verified Content
```

---

## Running the Server

The server is a dependency-free Node.js process that communicates over stdio using newline-delimited JSON-RPC 2.0.

```bash
# Run directly
node skills/adapters/mcp-server/server/server.js

# Or with custom output directory (for testing)
CONTENT_WRITER_OUTPUT=/tmp/test-output node skills/adapters/mcp-server/server/server.js
```

### MCP Client Configuration

**Claude Desktop / Claude Code:**
Add to your MCP settings:
```json
{
  "mcpServers": {
    "content-writer": {
      "command": "node",
      "args": ["/path/to/repo/skills/adapters/mcp-server/server/server.js"]
    }
  }
}
```

**n8n MCP Client Tool:**
Configure the node to spawn the server as a subprocess with the command above.

**Custom Scripts:**
Spawn the process and write JSON-RPC messages to stdin, one per line:
```json
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}}
{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "writer_discuss", "arguments": {"topic": "Test", "platform": "blog", "format": "article", "audience": "testers", "awareness_stage": "problem-aware", "goal": "leads", "framework": "PAS", "length": 500, "cta": "test"}}}
```

---

## Security Considerations

1. **Local-only execution:** This server is designed to run on the user's local machine, not as a hosted service. It writes to local filesystem paths only.

2. **Fixed output paths:** The output directory (`content-writer-output/` by default) is a fixed constant or set via environment variable. It is never constructed from user input fields, preventing path traversal attacks.

3. **Input as data:** Caller-supplied frontmatter values are treated as data, not as instructions. The server validates phase ordering but does not execute arbitrary code from input fields.

4. **Error responses:** Phase-gate errors return structured JSON with only the expected phase name, never stack traces or filesystem paths.

---

## State Document Schema

All tools read and write `PROJECT-STATE.md` using the exact frontmatter field names defined in `skills/state-schema.md`. The file uses a restricted, regex-parseable YAML subset: flat `key: value` pairs only, no nested structures, no multiline blocks.

**Required frontmatter keys (in order):**
- `phase`
- `platform`
- `format`
- `topic`
- `angle`
- `audience`
- `awareness_stage`
- `goal`
- `framework`
- `length`
- `cta`
- `research_urls`
- `key_points`
- `seo_primary_keyword`
- `seo_secondary_keywords`
- `seo_meta_title`
- `seo_meta_description`
- `seo_slug`
- `platform_conventions_file`
- `voice_notes`
- `proof_points`
- `cta_placement`
- `draft_word_count`
- `cta_expanded`
- `seo_score`
- `ai_patterns_fixed`
- `ste_gate`
- `ste_per100w`
- `manual_check`
- `updated_at`

**Required body headings (in order):**
1. `## Discussion Brief`
2. `## Outline`
3. `## Draft`
4. `## Verified Content`

See `skills/state-schema.md` for full schema documentation.

---

## Testing

Run the test harness against fixture data:

```bash
node skills/adapters/mcp-server/server/test-harness.js
```

The test harness spawns the server as a child process, exercises all five behaviors, and reports PASS/FAIL for each assertion.
