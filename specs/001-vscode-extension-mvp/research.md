# Research: Envy VS Code Extension MVP

**Feature**: 001-vscode-extension-mvp  
**Date**: 2026-04-06  
**Purpose**: Resolve the single key unknown from Technical Context — how to handle `envy encrypt` / `envy decrypt` which require interactive passphrase input via a TTY.

---

## Question: Handling Passphrase-Requiring CLI Commands in VS Code Extensions

### Context

`envy encrypt` and `envy decrypt` display an interactive passphrase prompt on the terminal. When spawned via `child_process.exec` or `child_process.spawn` with piped stdio (the standard extension pattern), there is no TTY allocated and the passphrase prompt cannot be shown or answered. The command hangs or fails with a non-zero exit code.

---

## Decision

**Use `vscode.window.createTerminal` + `terminal.sendText(cmd)` + `terminal.show()` for `envy encrypt` and `envy decrypt`.**

The VS Code integrated terminal allocates a real PTY. The user sees the passphrase prompt in the terminal panel and types their passphrase normally. The extension does not intercept, read, or relay the passphrase at any point.

---

## Rationale

| Option | Assessment |
|--------|-----------|
| `child_process.exec` with piped stdio | REJECTED — no TTY; passphrase prompt blocked; command hangs or fails |
| `child_process.spawn` with `{ stdio: 'inherit' }` | REJECTED — the VS Code extension host is not attached to a user-facing terminal; `inherit` maps to the extension host's stdio, not the user's terminal |
| `node-pty` (pseudo-TTY library) | REJECTED for MVP — adds a native module dependency; complex to bundle with webpack; disproportionate complexity for two commands |
| VS Code `showInputBox({ password: true })` + pipe passphrase via stdin | REJECTED — `envy` reads the passphrase from the TTY directly using OS-level terminal APIs, not via piped stdin; piping a value through stdin would require the CLI to support `--passphrase-stdin` or `ENVY_PASSPHRASE` env var explicitly (this is supported for CI but not the intended UX for interactive use) |
| `vscode.window.createTerminal` + `sendText` | **CHOSEN** — clean, no new dependencies, standard VS Code pattern, lets the CLI own its own UX |

### Supporting Evidence

- VS Code's own Git extension uses the integrated terminal for interactive `git` operations requiring user input (e.g., rebases with conflict resolution) rather than attempting to proxy stdin.
- The `envy` CLI already supports `ENVY_PASSPHRASE_<ENV>` for non-interactive (CI) use. For the extension MVP, the interactive terminal path is preferred because it preserves the user experience and requires no changes to the CLI.
- `terminal.sendText(text, addNewLine: true)` schedules the command text in the terminal. The terminal shows as soon as `terminal.show()` is called. The passphrase prompt appears immediately.

---

## Trade-offs of the Chosen Approach

| Pro | Con |
|-----|-----|
| No new npm dependencies | Extension cannot detect success/failure — no exit code |
| User types passphrase in familiar terminal UI | Status bar refresh is delayed (3s fixed delay after sendText) |
| Works identically on macOS, Linux, Windows | Terminal panel opens (visible context switch) |
| Handles multi-environment decrypt naturally | User must interact with terminal panel, not Command Palette |

### Mitigation for "no exit code"

The status bar refresh uses a 3-second delay after `sendText`. This is intentional for the MVP. A more robust approach (post-MVP) would be to use a shell wrapper script that signals completion via a VS Code custom event, but this is not needed for the MVP success criteria.

---

## Secondary Research: CLI Detection

**Decision**: On `activate()`, call `execEnvy(['--version'], cwd)` via `child_process.exec`. Handle `ENOENT` (binary not found) as the "CLI not installed" signal.

**Rationale**: `envy --version` is a fast, non-destructive command with no side effects. ENOENT is the idiomatic Node.js signal for "binary not on PATH". This is simpler than using `which`/`where` (platform-specific) or `fs.access` (requires knowing the full path).

---

## Secondary Research: Status Bar Refresh After Non-Interactive Commands

**Decision**: For `initVault`, `setSecret`, `showDiff` — call `refreshStatusBar()` immediately after the `execEnvy` promise resolves.

**Decision**: For `encrypt`, `decrypt` — call `refreshStatusBar()` after a 3-second `setTimeout`.

**Rationale**: Non-interactive commands complete synchronously (from the extension's perspective). Interactive terminal commands have no completion event, so a short delay is the simplest reliable approach for the MVP.

---

## All NEEDS CLARIFICATION Items

None were present in the Technical Context. The research above resolves the one informally-identified unknown (passphrase interaction pattern).
