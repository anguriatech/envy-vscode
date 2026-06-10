# Command Contracts: Envy Tree View

**Feature Branch**: `002-tree-view`  
**Date**: 2026-04-06

---

## New Commands

### `envy-vscode.copyKeyName`

| Field | Value |
|-------|-------|
| ID | `envy-vscode.copyKeyName` |
| Title | `Envy: Copy Key Name` |
| Icon | `$(copy)` |
| Registered in | `extension.ts` |
| Handler file | `extension.ts` (inline — one line) |

**Behaviour**: Writes `item.key` to the system clipboard via `vscode.env.clipboard.writeText(item.key)`. Shows a brief info notification `'Copied: ${item.key}'` on success.

**Arguments**: Receives a `SecretKeyItem` as the first argument (passed automatically by VS Code when the command is invoked from a tree item context menu).

**Guard**: None required — `copyKeyName` is only reachable via a tree item that already exists in a valid vault.

---

### `envy-vscode.editSecret`

| Field | Value |
|-------|-------|
| ID | `envy-vscode.editSecret` |
| Title | `Envy: Edit Secret` |
| Icon | `$(edit)` |
| Registered in | `extension.ts` |
| Handler file | delegates to `envy-vscode.setSecret` |

**Behaviour**: Calls `vscode.commands.executeCommand('envy-vscode.setSecret', item.key)`. This passes the key name as a positional argument to the existing Set Secret handler, which pre-populates the key input box.

**Arguments**: Receives a `SecretKeyItem` as the first argument.

**Guard**: `requireCli()` — same guard applied inside the existing `setSecret` handler.

---

### `envy-vscode.refreshTreeView`

| Field | Value |
|-------|-------|
| ID | `envy-vscode.refreshTreeView` |
| Title | `Envy: Refresh Tree` |
| Icon | `$(refresh)` |
| Registered in | `extension.ts` |

**Behaviour**: Calls `provider.refresh()`, which fires the `onDidChangeTreeData` event and triggers a `getChildren()` call from VS Code.

**Arguments**: None.

---

## Modified Commands

### `envy-vscode.setSecret`

**Change**: Handler gains an optional `prefillKey?: string` parameter.

**New handler signature**:
```typescript
export async function handler(
    outputChannel: vscode.OutputChannel,
    cwd: string,
    refresh: () => Promise<void>,
    prefillKey?: string,
): Promise<void>
```

**Behaviour change**: The first `showInputBox` gains `value: prefillKey ?? ''` so the key is pre-populated when called from the tree view edit action.

**Backwards compatible**: When called from the Command Palette (no `prefillKey`), behaviour is identical to before.

---

## Package.json Additions

```json
{
  "contributes": {
    "views": {
      "explorer": [
        {
          "id": "envySecrets",
          "name": "Envy Secrets"
        }
      ]
    },
    "viewsWelcome": [
      {
        "view": "envySecrets",
        "contents": "No secrets found.\n[Set a secret](command:envy-vscode.setSecret) to add one.",
        "when": "envySecrets.state == 'empty'"
      },
      {
        "view": "envySecrets",
        "contents": "Vault not initialized.\n[Init Vault](command:envy-vscode.initVault) to get started.",
        "when": "envySecrets.state == 'notInitialized'"
      },
      {
        "view": "envySecrets",
        "contents": "Envy CLI not found. Install it to use this extension.",
        "when": "envySecrets.state == 'cliUnavailable'"
      },
      {
        "view": "envySecrets",
        "contents": "Unable to load secrets. Check the Envy Output Channel for details.",
        "when": "envySecrets.state == 'error'"
      }
    ],
    "commands": [
      {
        "command": "envy-vscode.copyKeyName",
        "title": "Envy: Copy Key Name",
        "icon": "$(copy)"
      },
      {
        "command": "envy-vscode.editSecret",
        "title": "Envy: Edit Secret",
        "icon": "$(edit)"
      },
      {
        "command": "envy-vscode.refreshTreeView",
        "title": "Envy: Refresh Tree",
        "icon": "$(refresh)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "envy-vscode.refreshTreeView",
          "when": "view == envySecrets",
          "group": "navigation"
        }
      ],
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
}
```
