# Research: Envy Tree View

**Feature Branch**: `002-tree-view`  
**Date**: 2026-04-06

---

## Decision 1: TreeDataProvider Registration API

**Decision**: Use `vscode.window.registerTreeDataProvider('envySecrets', provider)` (not `createTreeView`).

**Rationale**: `registerTreeDataProvider` is sufficient — the tree view does not need programmatic reveal, selection management, or expand/collapse control. `createTreeView` returns a `TreeView` handle used for those advanced operations. Using the simpler API avoids an unnecessary object to dispose.

**Alternatives Considered**: `vscode.window.createTreeView` — evaluated and rejected for MVP; adds no value unless `reveal()` is needed (e.g., auto-select a newly added key).

---

## Decision 2: Empty and Non-Initialized State Display

**Decision**: Use `contributes.viewsWelcome` in `package.json` to show contextual messages for the empty-vault, not-initialized, and CLI-unavailable states. Return an empty array from `getChildren()` to trigger the welcome content.

**Rationale**: `viewsWelcome` is the VS Code-native API for empty tree states. It renders rich text including links and command buttons (e.g., "Run 'Envy: Init Vault'" as a clickable link). Returning placeholder `TreeItem` objects with labels like "No secrets found" requires zero API knowledge from users but is inconsistent with VS Code UX patterns.

**Implementation Detail**: A `when` clause on each `viewsWelcome` entry (e.g., `"when": "envySecrets.state == 'empty'"`) allows switching between messages. The tree provider sets a context key (`vscode.commands.executeCommand('setContext', 'envySecrets.state', 'empty')`) to control which message is shown.

**Alternatives Considered**: Returning a single disabled placeholder `TreeItem` — rejected because it looks like a real item and has no link/action affordance.

---

## Decision 3: Inline Item Actions (Icon Buttons)

**Decision**: Register two commands (`envy-vscode.copyKeyName`, `envy-vscode.editSecret`) and expose them as inline buttons via `contributes.menus["view/item/context"]` with `"group": "inline"`.

**Rationale**: The `"inline"` group in `view/item/context` renders commands as icon buttons directly on the hovered tree row — exactly the "icons on each key" behavior specified. The `when` clause `"view == envySecrets && viewItem == secretKey"` ensures buttons appear only on key rows (not on the panel header or in other views).

**Package.json shape**:
```json
"contributes": {
  "menus": {
    "view/item/context": [
      {
        "command": "envy-vscode.copyKeyName",
        "when": "view == envySecrets && viewItem == secretKey",
        "group": "inline@1"
      },
      {
        "command": "envy-vscode.editSecret",
        "when": "view == envySecrets && viewItem == secretKey",
        "group": "inline@2"
      }
    ]
  }
}
```

Each `SecretKeyItem` must set `contextValue = 'secretKey'` so the `when` clause resolves.

---

## Decision 4: Refresh Mechanism

**Decision**: `EnvySecretsProvider` exposes a `refresh()` method that fires its `EventEmitter`. `extension.ts` wraps this into a shared `refreshTree()` closure, which is called after successful `setSecret` and `initVault` commands (mirroring how `refreshStatusBar` is already called).

**Rationale**: The EventEmitter pattern (`_onDidChangeTreeData.fire()`) is the idiomatic VS Code approach. Firing with `undefined` refreshes the entire tree, which is correct since any vault write can add or remove any key.

**Alternatives Considered**: `setTimeout`-based polling — rejected; unnecessary since write operations are controlled by the extension. File-watcher (`vscode.workspace.createFileSystemWatcher`) — deferred per spec Out of Scope.

---

## Decision 5: Pre-populating Set Secret from Tree View

**Decision**: The `setSecret` command handler signature gains an optional `prefillKey?: string` parameter. When the edit icon in the tree calls `vscode.commands.executeCommand('envy-vscode.setSecret', item.key)`, the key is passed as a positional argument to the registered handler.

**Rationale**: `executeCommand` forwards positional arguments to the registered handler. This avoids creating a separate `editSecret` command that duplicates the Set Secret logic — the existing command is reused with an optional hint. The first `showInputBox` uses `value: prefillKey` to pre-populate.

**Contract change in `setSecret.ts`**:
- Old: `handler(outputChannel, cwd, refresh)`
- New: `handler(outputChannel, cwd, refresh, prefillKey?: string)`
- `showInputBox({ ..., value: prefillKey ?? '' })` for the key input

---

## Decision 6: `envy list` Output Parsing

**Decision**: Call `execEnvy(['list'], cwd)` and parse stdout as one key per line, trimming whitespace and filtering empty lines.

**Rationale**: The user confirmed `envy list` uses the OS keyring and requires no passphrase — safe for `execFile` (non-PTY). The assumed output format is one key name per line (e.g., `DATABASE_URL\nAPI_KEY\n`). If the actual format is tabular (with headers and separators), the parser must be updated — this is flagged as an implementation assumption.

**Fallback**: If `execEnvy(['list'])` exits with a non-zero code and stderr contains "not found" or "no manifest", the tree provider transitions to the `notInitialized` state. Any other non-zero exit transitions to `error` state.

---

## Decision 7: View Registration in Explorer Sidebar

**Decision**: Add the tree view to the built-in Explorer sidebar using `"contributes.views": { "explorer": [{ "id": "envySecrets", "name": "Envy Secrets" }] }`.

**Rationale**: Per spec Assumption — the tree view appears in the Explorer sidebar, not as a new dedicated sidebar icon. Using the `"explorer"` container key places it as a collapsible section in the standard Explorer panel, consistent with extensions like GitLens File History and npm Explorer.

**Alternatives Considered**: Creating a new `viewsContainers` entry with a custom icon — deferred; adds sidebar icon complexity unnecessary for MVP.
