# Data Model: Envy VS Code Extension MVP

**Feature**: 001-vscode-extension-mvp  
**Date**: 2026-04-06  
**Source**: Derived from `spec.md` Key Entities + Phase 0 research

---

The extension holds no persistent state of its own. All domain data lives in the envy vault managed by the CLI. The types below describe the in-memory representations used to communicate between the extension layers.

---

## Core Types

### `CliResult`

Returned by every `child_process.exec` call through the CLI executor.

| Field | Type | Description |
|-------|------|-------------|
| `stdout` | `string` | Standard output from the CLI process |
| `stderr` | `string` | Standard error output from the CLI process |
| `exitCode` | `number` | Process exit code (0 = success; see Envy exit code table) |

### `CliNotFoundError`

Typed error thrown when `child_process.exec` resolves with `ENOENT` (binary not on PATH).

| Field | Type | Description |
|-------|------|-------------|
| `message` | `string` | Human-readable message: "envy CLI not found on PATH" |

Extends `Error`. Caught in `extension.ts` `activate()` to trigger the installation guide notification.

---

## Domain Types

### `SyncStatus`

Represents the sync state of the vault relative to the sealed artifact. Derived by parsing `envy status` output.

| Value | Meaning |
|-------|---------|
| `InSync` | Vault matches the `envy.enc` artifact — no pending changes |
| `Modified` | Vault has changes not yet sealed into the artifact |
| `NeverSealed` | Vault exists but no `envy.enc` artifact has ever been created |
| `NotInitialized` | No `envy.toml` found in the workspace root — vault not set up |
| `Error` | Status check failed (CLI error, vault corruption, etc.) |

Used exclusively by `statusBar.ts` to set the status bar label and icon.

### `StatusBarState`

Transient in-memory object held by `statusBar.ts`. Never persisted.

| Field | Type | Description |
|-------|------|-------------|
| `status` | `SyncStatus` | Current resolved status |
| `label` | `string` | Text displayed on the status bar item |
| `tooltip` | `string` | Hover text shown on the status bar item |
| `isRefreshing` | `boolean` | True while a status check is in flight |

---

## Transient Types (exist only during a single command execution)

### `SecretEntry`

Holds key and value captured from the two-step "Envy: Set Secret" input flow. Lives only in the `setSecret` command handler stack frame — never written to any file, log, or extension storage.

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Environment-variable-style identifier (e.g., `DATABASE_URL`) |
| `value` | `string` | Sensitive secret value — passed directly to the CLI and immediately discarded |

---

## State Transitions: SyncStatus

```
Not Initialized
      │
      │  envy init succeeds
      ▼
Never Sealed ──────────── envy encrypt ──────────► In Sync
      ▲                                                 │
      │                                                 │ envy set / vault change
      │                                                 ▼
      │                                             Modified
      │                                                 │
      └─────────────── envy encrypt ───────────────────┘

Error  ◄──── any CLI failure during status check
```

---

## Notes

- The extension never inspects or stores secret values beyond the duration of the `setSecret` handler.
- `SyncStatus.Error` is a terminal display state for the current refresh cycle. The next successful refresh resets it.
- The workspace root (cwd for all CLI calls) is resolved once in `activate()` from `vscode.workspace.workspaceFolders[0].uri.fsPath`.
