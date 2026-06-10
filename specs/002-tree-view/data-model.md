# Data Model: Envy Tree View

**Feature Branch**: `002-tree-view`  
**Date**: 2026-04-06

---

## Entities

### SecretKeyItem

A single row in the Envy Secrets tree view representing one vault key.

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | The secret key name (e.g., `DATABASE_URL`). Read from `envy list` stdout. |
| `label` | `string` | Display text — same as `key`. |
| `contextValue` | `'secretKey'` | Fixed string; required for `view/item/context` menu `when` clause targeting. |
| `collapsibleState` | `None` | Keys are leaf nodes — no children. |
| `iconPath` | `ThemeIcon('key')` | VS Code built-in icon; visually distinguishes key rows from placeholder messages. |

**Invariant**: `key` is never an empty string. Items with empty keys are filtered out during parsing.

---

### EnvySecretsProvider

The `TreeDataProvider` implementation. Owns the fetch-and-parse loop and signals the VS Code tree view when data changes.

| Field | Type | Description |
|-------|------|-------------|
| `_onDidChangeTreeData` | `EventEmitter<void>` | Internal emitter; firing triggers a full tree reload. |
| `onDidChangeTreeData` | `Event<void>` | Public event surface registered with the tree view. |
| `_state` | `TreeViewState` | Current panel state (see `TreeViewState` below). |
| `_cwd` | `string \| undefined` | Workspace root path. `undefined` when no workspace folder is open. |

**Methods**:

| Method | Signature | Description |
|--------|-----------|-------------|
| `refresh()` | `() => void` | Fires `_onDidChangeTreeData` and resets state to `loading`. |
| `getTreeItem()` | `(element: SecretKeyItem) => TreeItem` | Returns `element` as-is (elements are already `TreeItem` instances). |
| `getChildren()` | `() => Promise<SecretKeyItem[]>` | Calls `execEnvy(['list'], cwd)`, parses stdout, returns items. Side-effect: updates `_state` and sets VS Code context key. Returns `[]` on empty/error to trigger `viewsWelcome`. |

---

### TreeViewState

Discriminated union representing the five mutually exclusive panel states.

| Value | Trigger | `viewsWelcome` shown |
|-------|---------|----------------------|
| `'loading'` | `refresh()` called, fetch in progress | No (tree is refreshing) |
| `'keys'` | `getChildren()` returned ≥1 items | No (actual items rendered) |
| `'empty'` | `getChildren()` returned 0 items, exit 0 | "No secrets found…" |
| `'notInitialized'` | `getChildren()` exit ≠ 0, stderr matches no-vault pattern | "Vault not initialized…" |
| `'error'` | `getChildren()` exit ≠ 0, other error | "Unable to load secrets…" |
| `'cliUnavailable'` | `cliAvailable === false` at call time | "Envy CLI not found…" |

State is communicated to `package.json` `when` clauses via:
```typescript
vscode.commands.executeCommand('setContext', 'envySecrets.state', state);
```

---

## State Transitions

```
                  ┌──────────────────────────────────────┐
                  │            refresh() called           │
                  ▼                                       │
            [loading] ──getChildren()──▶ [keys]          │
                  │                      │               │
                  │                      └───────────────┘
                  │
                  ├──▶ [empty]          (0 items, exit 0)
                  ├──▶ [notInitialized] (exit ≠ 0, no vault)
                  ├──▶ [cliUnavailable] (ENOENT / cliAvailable false)
                  └──▶ [error]          (exit ≠ 0, other)
```

---

## Context Keys Set by Extension

| Key | Values | Purpose |
|-----|--------|---------|
| `envySecrets.state` | `'loading' \| 'keys' \| 'empty' \| 'notInitialized' \| 'error' \| 'cliUnavailable'` | Controls which `viewsWelcome` entry is shown |
