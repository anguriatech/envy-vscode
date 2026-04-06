# Contracts: VS Code Contribution Points

**Feature**: 001-vscode-extension-mvp  
**Date**: 2026-04-06  
**Source**: `spec.md` FR-006 through FR-016 + `package.json` contribution schema

This document defines the public-facing contract of the extension: the command IDs, titles, and behaviours that users and other extensions can depend on. Changes to command IDs or titles are breaking changes.

---

## Commands

All commands are registered under the `envy-vscode` namespace and accessible via the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Command ID | Palette Title | Spec Ref | Interactive? |
|------------|---------------|----------|--------------|
| `envy-vscode.initVault` | Envy: Init Vault | FR-006 | No — output to channel |
| `envy-vscode.setSecret` | Envy: Set Secret | FR-007, FR-008 | Yes — two InputBox prompts |
| `envy-vscode.showDiff` | Envy: Show Diff | FR-010, FR-011 | No — output to channel |
| `envy-vscode.encrypt` | Envy: Encrypt (Seal) | FR-012 | Yes — opens integrated terminal |
| `envy-vscode.decrypt` | Envy: Decrypt | FR-013 | Yes — opens integrated terminal |

---

## Command Behaviours

### `envy-vscode.initVault`

- **Precondition**: `envy` CLI must be on PATH; workspace folder must be open.
- **Action**: Runs `envy init` in the workspace root.
- **Success**: Info notification + status bar refresh.
- **Failure**: Error notification with CLI stderr message.
- **Output**: stdout/stderr written to the "Envy" Output Channel.

### `envy-vscode.setSecret`

- **Precondition**: `envy` CLI on PATH; workspace folder open; vault initialized.
- **Step 1**: `showInputBox({ prompt: "Secret key (e.g. DATABASE_URL)", ignoreFocusOut: true })` → if cancelled, abort cleanly.
- **Step 2**: `showInputBox({ prompt: "Secret value", password: true, ignoreFocusOut: true })` → if cancelled, abort cleanly.
- **Action**: Runs `envy set KEY=VALUE` in workspace root.
- **Success**: Info notification + status bar refresh.
- **Failure**: Error notification with CLI stderr message.
- **Output**: stdout/stderr written to the "Envy" Output Channel (secret value is NOT echoed).

### `envy-vscode.showDiff`

- **Precondition**: `envy` CLI on PATH; workspace folder open.
- **Action**: Runs `envy diff` in workspace root.
- **Success**: Output Channel focused with diff output; exit code 0 → info notification "No changes"; exit code 1 → info notification "Differences found — review the Envy output channel".
- **Failure**: Error notification with CLI stderr message.
- **Output**: stdout/stderr written to "Envy" Output Channel; channel is shown automatically.

### `envy-vscode.encrypt`

- **Precondition**: `envy` CLI on PATH; workspace folder open.
- **Action**: Creates (or reuses) an integrated terminal named "Envy", sends `envy encrypt` via `terminal.sendText()`, shows the terminal.
- **Success**: Terminal visible; user types passphrase in the integrated terminal; status bar refreshes after 3 seconds.
- **Failure**: If terminal creation fails, error notification shown.
- **Note**: The extension cannot intercept the passphrase prompt. The terminal handles all I/O.

### `envy-vscode.decrypt`

- **Precondition**: `envy` CLI on PATH; workspace folder open; `envy.enc` artifact present.
- **Action**: Creates (or reuses) an integrated terminal named "Envy", sends `envy decrypt`, shows the terminal.
- **Success**: Terminal visible; user types passphrase; status bar refreshes after 3 seconds.
- **Failure**: If terminal creation fails, error notification shown.
- **Note**: Same terminal pattern as encrypt. Extension cannot observe passphrase I/O.

---

## Output Channel

| Name | Created | Lifetime |
|------|---------|----------|
| `Envy` | `activate()` | Disposed on `deactivate()` |

All non-interactive commands (init, set, diff) append their CLI output here. The channel is shown automatically when `showDiff` runs. Other commands show it only on error.

---

## Status Bar Item

| Property | Value |
|----------|-------|
| Alignment | `StatusBarAlignment.Right` |
| Priority | `100` |
| Text (examples) | `$(sync) Envy: In Sync`, `$(warning) Envy: Modified`, `$(circle-slash) Envy: Never Sealed`, `$(circle-slash) Envy: Not Initialized`, `$(error) Envy: Error` |
| Tooltip | Full output of `envy status` (plain text) |
| Command | None (display only for MVP) |

---

## `package.json` Contribution Snippet

The following is the authoritative `contributes` block to be merged into `package.json`:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "envy-vscode.initVault",
        "title": "Envy: Init Vault"
      },
      {
        "command": "envy-vscode.setSecret",
        "title": "Envy: Set Secret"
      },
      {
        "command": "envy-vscode.showDiff",
        "title": "Envy: Show Diff"
      },
      {
        "command": "envy-vscode.encrypt",
        "title": "Envy: Encrypt (Seal)"
      },
      {
        "command": "envy-vscode.decrypt",
        "title": "Envy: Decrypt"
      }
    ]
  },
  "activationEvents": [
    "onStartupFinished"
  ]
}
```

> **`activationEvents`**: `onStartupFinished` ensures the extension activates after VS Code startup completes, so the status bar item is populated without blocking editor startup.
