# Developer Quickstart: Envy VS Code Extension MVP

**Feature**: 001-vscode-extension-mvp  
**Date**: 2026-04-06

---

## Prerequisites

- **Node.js** 22.x and **npm**
- **VS Code** 1.110.0 or newer
- **envy CLI** on PATH (for manual testing) — install via `brew install anguriatech/tap/envy` or `npm install -g @anguriatech/envy`
- TypeScript knowledge (strict mode)

---

## Setup

```bash
# Clone and install
git clone <repo>
cd envy-vscode
npm install
```

---

## Development Workflow

### Compile and launch

```bash
# Open VS Code in the project root
code .
```

Press **F5** to open a new Extension Development Host window with the extension loaded. The Output panel shows extension logs.

### Watch mode (auto-recompile on save)

```bash
npm run watch
```

Then press **F5** to launch the host. Reload the host window (`Ctrl+R`) after each recompile.

### Run tests

```bash
npm test
```

This compiles TypeScript, bundles via webpack, then runs the Mocha test suite inside a VS Code test runner.

### Lint

```bash
npm run lint
```

---

## Source Layout

```
src/
├── extension.ts         # Entry point — activate() + deactivate()
├── cli.ts               # child_process wrapper (ONLY file that calls exec/spawn)
├── statusBar.ts         # StatusBarItem creation and refresh
└── commands/
    ├── initVault.ts
    ├── setSecret.ts
    ├── showDiff.ts
    ├── encrypt.ts
    └── decrypt.ts
```

**Dependency rule**: `commands/*.ts` and `statusBar.ts` import from `cli.ts`. Nothing imports from `commands/*.ts` except `extension.ts`. `cli.ts` imports nothing from the extension.

---

## Adding a New Command

1. Create `src/commands/myCommand.ts` — export a single `async function handler(...)`.
2. Register in `src/extension.ts`: `vscode.commands.registerCommand('envy-vscode.myCommand', () => handler(...))`.
3. Add the contribution to `package.json` under `contributes.commands`.
4. Add a test case in `src/test/extension.test.ts`.

---

## Testing Manually

1. Launch Extension Development Host (F5).
2. Open a folder that has (or doesn't have) `envy.toml`.
3. Open Command Palette (`Ctrl+Shift+P`) and search "Envy" to see all registered commands.
4. Check the status bar bottom-right for the sync status item.
5. To test missing CLI: temporarily rename `envy` binary or set `PATH=""` in the debug launch config.

---

## Key VS Code APIs Used

| API | Purpose |
|-----|---------|
| `vscode.commands.registerCommand` | Register Command Palette entries |
| `vscode.window.showInputBox` | Collect secret key / value from user |
| `vscode.window.showInformationMessage` | Success notifications |
| `vscode.window.showErrorMessage` | Error notifications with action buttons |
| `vscode.window.createOutputChannel` | "Envy" output channel for CLI stdout/stderr |
| `vscode.window.createStatusBarItem` | Persistent sync-status indicator |
| `vscode.window.createTerminal` | Interactive terminal for encrypt/decrypt passphrase prompts |
| `vscode.workspace.workspaceFolders` | Resolve workspace root (cwd for CLI calls) |

---

## Important Constraints

- **Never log secret values.** The `envy set` value is passed directly to the CLI and must not appear in any `console.log`, Output Channel output, or notification.
- **Never implement cryptographic logic.** All vault operations go through the `envy` binary.
- **`cli.ts` is the only module that calls `child_process`.** All other modules call `execEnvy()` from `cli.ts`.
