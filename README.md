# MAIFlow for Visual Studio Code

MAIFlow is a focused VS Code task-management extension. It brings your MAIFlow workspace into an editor sidebar so you can browse, filter, create, update, and open tasks without switching applications.

## Features

- MAIFlow Activity Bar view with refresh, flow/project filters, task creation, and workspace mapping.
- Task detail panel for editing title, description, status, priority, urgency, impact, and effort.
- Browser links to the full MAIFlow task and Profile pages.
- Test Connection and redacted MCP setup-template commands.
- Cached task list with stale/offline messaging and cancellable refreshes.
- Safe editor integration: no source code, selected text, diagnostics, or whole files are sent.

## Setup

1. Run **MAIFlow: Configure MAIFlow** from the Command Palette.
2. Keep the default endpoint, `https://app.maiflow.org/api/mcp`, unless you are using a local development server.
3. Create a token in **MAIFlow Profile → API access** and enter the `mf_live_…` token.
4. Run **MAIFlow: Test MAIFlow Connection**.
5. Open **MAIFlow** from the Activity Bar and optionally map the workspace to a flow/project.

The token is stored only with VS Code Secret Storage, keyed by the normalized endpoint. The server URL, a redacted token prefix, and last successful connection time are non-secret VS Code configuration metadata. Rotating or revoking a MAIFlow token invalidates existing clients, including this extension and other MCP clients using that token.

MAIFlow MCP requires an active Personal or Team plan. The extension does not perform Keycloak login, read browser cookies, access MAIFlow databases, or depend on Copilot or another AI extension.

## Settings and commands

The extension contributes `maiflow.serverUrl`, `maiflow.tokenPrefix`, and `maiflow.lastSuccessfulConnection`. The full token is never written to `settings.json`, workspace state, logs, URLs, or the extension package.

Use **Copy MAIFlow MCP Template** to copy a redacted remote MCP configuration for compatible AI tooling. Configure that client independently with the same token; this extension does not read or mutate another extension’s private configuration.

## Development

```text
npm install
npm run compile
npm test
npm run package
```

Optional read-only integration checks can be added with `MAIFLOW_EXTENSION_E2E_URL` and `MAIFLOW_EXTENSION_E2E_TOKEN`; credentials are intentionally not part of the extension configuration or project state.
