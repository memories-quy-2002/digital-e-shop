# Codex MCP setup

The project-level MCP servers are declared in [`.codex/config.toml`](../.codex/config.toml).
Codex reads that file only after the repository is trusted. Local `npx` servers
download their packages on first launch; MarkItDown uses `uvx`, so install `uv`
on each device first. Remote servers do not need a local package install.

This setup requires Node.js 24.20.0 and network access to npm/PyPI and the
configured remote MCP hosts. Sign in to Composio and Mem0 separately on
each device. Keep API tokens and other credentials in the
machine's environment or the provider's sign-in store; never add them to the
project config.

The Filesystem MCP is scoped to the repository working directory. Chrome
DevTools and Playwright start their own browser integrations when used. GitNexus
starts as an MCP server; run its repository analysis command once in each fresh
checkout if the code graph has not been indexed yet:

```powershell
npx -y gitnexus@latest analyze
```

Lighthouse CI, Playwright CLI, Semgrep, Trivy, and Gitleaks are command-line
tools, not MCP servers. Their installation is separate from this file; the
project MCP entries for Chrome DevTools and Playwright are browser MCP servers.
