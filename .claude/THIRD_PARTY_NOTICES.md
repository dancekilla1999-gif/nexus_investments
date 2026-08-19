# Third-party notices

The contents of `.claude/skills/`, `.claude/agents/`, and `.claude/commands/` were imported
from [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit), which is
distributed under the MIT License:

```
MIT License

Copyright (c) 2026 Leonardo Flores

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Not carried over: `.claude-plugin/marketplace.json` and `dist/` from the source repo — this
environment does not support the `/plugin` marketplace mechanism, so skills/agents/commands
were flattened directly into this repo's `.claude/` directory as project-level assets instead.

Several imported skills call out to external CLIs or services not configured in this
repository/environment (`codex`, `gemini`, `jira`, `datadog-cli`, `perplexity`,
`web-to-markdown`'s local `web2md`). Their `SKILL.md` files are present, but those skills will
only function once the corresponding tool/credentials are set up.
