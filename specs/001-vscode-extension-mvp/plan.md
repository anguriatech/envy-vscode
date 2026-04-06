# Implementation Plan: Envy VS Code Extension MVP

**Branch**: `001-vscode-extension-mvp` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/001-vscode-extension-mvp/spec.md`

## Summary

Build a VS Code extension that surfaces Envy vault operations (init, set, diff, encrypt, decrypt, status) directly within the editor. The extension is a pure UI wrapper: it delegates every vault operation to the local `envy` binary via Node's `child_process`. No cryptographic logic is implemented in the extension. The architecture uses three clear layers — VS Code command registration, per-command handlers, and a single CLI executor module — to keep concerns separated and testable.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`)  
**Primary Dependencies**: `vscode` API (built-in), Node.js `child_process` (built-in) — no additional runtime dependencies  
**Storage**: N/A — all persistent state lives in the envy vault; extension holds no state beyond the lifetime of a single command  
**Testing**: Mocha + `@vscode/test-cli` + `@vscode/test-electron` (already scaffolded in `package.json`)  
**Target Platform**: VS Code ^1.110.0 — macOS, Linux, Windows  
**Project Type**: VS Code Extension  
**Performance Goals**: CLI binary detection <2 seconds on activation; all command feedback visible within 10 seconds  
**Constraints**: Zero cryptographic logic; secret values must not be logged, persisted, or held in memory beyond a single `envy set` call; all vault operations delegated to `envy` binary  
**Scale/Scope**: Single workspace folder per window (MVP); default environment only

## Constitution Check

*The Envy Constitution (v1.1.0) governs the Rust CLI. This extension is a TypeScript project in the same repository. The relevant principles are applied by analogy below.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security by Default | PASS | Secret values in `envy set` use `password: true` input. Output channels never log secret values. No secret data written to disk by the extension. |
| II. Determinism | PASS | Extension behaviour is a pure function of VS Code state + CLI output. No locale- or environment-dependent defaults. |
| III. Rust Best Practices (by analogy) | PASS | No unhandled Promise rejections; all async paths have `try/catch`. TypeScript strict mode enforced. Tests cover all command handlers. |
| IV. Modularity | PASS | Three-layer separation: `extension.ts` (registration) → `commands/*.ts` (handlers) → `cli.ts` (executor). No cross-layer leakage. |
| V. Language | PASS | All identifiers, comments, and documentation in English. |

No violations. Complexity Tracking table omitted.

## Project Structure

### Documentation (this feature)

```text
specs/001-vscode-extension-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 — passphrase-interaction pattern decision
├── data-model.md        # Phase 1 — domain types used by the extension
├── quickstart.md        # Phase 1 — developer setup guide
├── contracts/
│   └── commands.md      # VS Code contribution points (command IDs, titles, keybindings)
└── tasks.md             # Phase 2 output — NOT created by /speckit.plan
```

### Source Code (repository root)

```text
src/
├── extension.ts         # activate() + deactivate() — registers commands + status bar
├── cli.ts               # Node child_process wrapper — exec(cmd, cwd) → Promise<CliResult>
├── statusBar.ts         # StatusBarItem factory + refresh logic
└── commands/
    ├── initVault.ts     # "Envy: Init Vault"
    ├── setSecret.ts     # "Envy: Set Secret" — two-step InputBox flow
    ├── showDiff.ts      # "Envy: Show Diff" — output to OutputChannel
    ├── encrypt.ts       # "Envy: Encrypt (Seal)" — interactive terminal
    └── decrypt.ts       # "Envy: Decrypt" — interactive terminal

src/test/
└── extension.test.ts    # Mocha integration tests (VS Code test runner)
```

**Structure Decision**: Single-project extension layout. `cli.ts` is the only module that touches `child_process` — all command handlers call through it. `extension.ts` owns lifecycle (subscribe/dispose). `statusBar.ts` isolates status bar concerns so any command can trigger a refresh without knowing the VS Code API details.

## Phase 0: Research Findings

*See [research.md](research.md) for full details.*

Key decision: `envy encrypt` and `envy decrypt` require interactive passphrase input. The VS Code integrated terminal provides a real PTY. These two commands use `vscode.window.createTerminal` + `terminal.sendText()` + `terminal.show()` so the user can type their passphrase directly. All other commands (init, set, diff) use `child_process.exec` with piped stdout/stderr routed to the Output Channel.

## Phase 1: Design Decisions

### CLI Executor (`cli.ts`)

Single exported function: `execEnvy(args: string[], cwd: string): Promise<CliResult>`.

- Uses `child_process.exec` with `{ cwd }`.
- Returns `{ stdout, stderr, exitCode }`.
- Propagates `ENOENT` as a typed `CliNotFoundError` so callers can show the installation guide.

### Status Bar (`statusBar.ts`)

- Created once in `activate()`, disposed via `context.subscriptions`.
- `refresh(cwd: string)` calls `execEnvy(['status', '--format', 'json'], cwd)` and maps the parsed result to a label + tooltip.
- Falls back to parsing plain-text output if JSON format flag is unavailable (defensive assumption).
- Shows `$(sync~spin)` icon while refreshing.

### Command Handlers (`commands/*.ts`)

Each handler follows the same contract:
```
async function handler(outputChannel: vscode.OutputChannel, refreshStatusBar: () => void): Promise<void>
```

- `initVault`, `showDiff`: call `execEnvy`, write stdout/stderr to OutputChannel, show success/error notification.
- `setSecret`: two `showInputBox` calls → compose `KEY=VALUE` → call `execEnvy(['set', 'KEY=VALUE'])`. Value input uses `password: true`.
- `encrypt`, `decrypt`: create (or reuse) an integrated terminal, call `terminal.sendText('envy encrypt')` / `terminal.sendText('envy decrypt')`, call `terminal.show()`. No OutputChannel output (PTY handles it). Status bar refreshes after a fixed delay (3s) since there's no completion event from the terminal.

### CLI Detection

On `activate()`, call `execEnvy(['--version'], cwd)`. On `CliNotFoundError`, show an error notification with "View Installation Guide" action. All commands check the same cached detection result rather than re-running the check.
