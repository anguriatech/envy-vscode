# Developer Quickstart: Envy Tree View

**Feature Branch**: `002-tree-view`  
**Date**: 2026-04-06

---

## Prerequisites

- Node.js 22.x
- `npm install` already run (dependencies unchanged from `001-vscode-extension-mvp`)
- `envy` CLI on PATH
- An initialized Envy vault in a test workspace folder (run `envy init` + `envy set TEST=foo` in a temp directory)

---

## Files Changed / Created

| File | Change |
|------|--------|
| `src/treeView.ts` | **NEW** — `SecretKeyItem` class + `EnvySecretsProvider` class |
| `src/commands/setSecret.ts` | **MODIFIED** — add optional `prefillKey?: string` param |
| `src/extension.ts` | **MODIFIED** — register tree view, 3 new commands, wire `refreshTree` into write operations |
| `package.json` | **MODIFIED** — add `views`, `viewsWelcome`, 3 commands, `menus` entries |

---

## Manual F5 Test Scenarios

### Scenario 1: Panel shows keys

1. Open the workspace with an initialized vault containing ≥ 1 secret.
2. Press F5 to open the Extension Development Host.
3. Open the Explorer sidebar (Ctrl+Shift+E).
4. Scroll to the bottom — verify the **Envy Secrets** section appears with all key names.
5. Confirm no values appear anywhere.

### Scenario 2: Copy key name

1. Hover over any key row in the Envy Secrets panel.
2. Click the copy icon (📋).
3. Open a new file and paste — verify only the key name is pasted.
4. Verify a "Copied: KEY_NAME" notification appears briefly.

### Scenario 3: Edit secret (pre-populated key)

1. Hover over a key row and click the edit icon (✏️).
2. Verify the Set Secret input box opens with the key name already filled in.
3. Enter a new value and confirm.
4. Verify the panel refreshes and the key is still listed (it was updated, not added/removed).

### Scenario 4: Add new secret, auto-refresh

1. Run **Envy: Set Secret** from the Command Palette (not from the tree).
2. Add a new key (e.g., `NEW_KEY=newval`).
3. Verify **NEW_KEY** appears in the Envy Secrets panel automatically without clicking refresh.

### Scenario 5: Empty vault

1. Open a workspace where `envy init` was run but no secrets were added.
2. Verify the Envy Secrets panel shows the "No secrets found" welcome message with the "Set a secret" link.

### Scenario 6: Vault not initialized

1. Open a folder with no `envy.toml`.
2. Verify the panel shows the "Vault not initialized" message with the "Init Vault" link.

### Scenario 7: Manual refresh

1. Add a secret via the CLI in the VS Code integrated terminal (`envy set MANUAL=1`).
2. Verify the panel does **not** auto-refresh (external change is out of scope).
3. Click the refresh button (🔄) in the panel header.
4. Verify `MANUAL` now appears in the list.

---

## Running Tests

```bash
npm test        # Mocha + @vscode/test-electron
npm run lint    # ESLint strict
npm run compile # webpack — zero errors required
```

---

## Key Implementation Notes

- `EnvySecretsProvider.getChildren()` must call `execEnvy(['list'], cwd)` — never access the vault directly.
- `SecretKeyItem.contextValue` must be exactly `'secretKey'` — this string is matched in `package.json` `when` clauses.
- The `envySecrets.state` context key must be set via `vscode.commands.executeCommand('setContext', ...)` every time state changes — without this, `viewsWelcome` entries will not render correctly.
- `setSecret.ts` handler receives `prefillKey` as the 4th argument — its `showInputBox` call gains `value: prefillKey ?? ''`. This is the only change to the existing Set Secret logic.
