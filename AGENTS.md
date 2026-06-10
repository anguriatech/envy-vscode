# envy-vscode Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-06

## Active Technologies
- TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`) — same as `001-vscode-extension-mvp` + `vscode` API (built-in) — `TreeDataProvider`, `TreeItem`, `EventEmitter`, `env.clipboard`, `commands.executeCommand`; Node.js `child_process` via existing `cli.ts` (002-tree-view)

- TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`) + `vscode` API (built-in), Node.js `child_process` (built-in) — no additional runtime dependencies (001-vscode-extension-mvp)

## Project Structure

```text
src/
├── extension.ts            # activate() / deactivate() — command registration + status bar + tree view wiring
├── cli.ts                  # ONLY file that imports child_process — execEnvy(args, cwd)
├── statusBar.ts            # createStatusBar() + refreshStatusBar() — sync status display
├── treeView.ts             # EnvySecretsProvider (TreeDataProvider) + SecretKeyItem — "Envy Secrets" Explorer panel
└── commands/
    ├── initVault.ts        # "Envy: Init Vault"
    ├── setSecret.ts        # "Envy: Set Secret" — two-step InputBox (value obscured), optional prefillKey
    ├── showDiff.ts         # "Envy: Show Diff" — output to OutputChannel
    ├── encrypt.ts          # "Envy: Encrypt (Seal)" — integrated terminal (PTY passphrase)
    └── decrypt.ts          # "Envy: Decrypt" — integrated terminal (PTY passphrase)

src/test/
└── extension.test.ts       # Mocha tests — run via npm test

specs/001-vscode-extension-mvp/   # Design docs for this feature
specs/002-tree-view/              # Design docs for this feature
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`): Follow standard conventions

## Recent Changes
- 002-tree-view: Added TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`) — same as `001-vscode-extension-mvp` + `vscode` API (built-in) — `TreeDataProvider`, `TreeItem`, `EventEmitter`, `env.clipboard`, `commands.executeCommand`; Node.js `child_process` via existing `cli.ts`

- 001-vscode-extension-mvp: Added TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`) + `vscode` API (built-in), Node.js `child_process` (built-in) — no additional runtime dependencies

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
