# Implementation Plan: Envy Tree View

**Branch**: `002-tree-view` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/002-tree-view/spec.md`

## Summary

Add a persistent "Envy Secrets" panel to the VS Code Explorer sidebar that lists all vault key names from `envy list`. Each key row has two inline icon actions: copy the key name to the clipboard, and trigger the existing Set Secret flow with the key pre-populated. The panel auto-refreshes after write operations and supports a manual refresh button. No values are ever displayed or copied.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`) — same as `001-vscode-extension-mvp`  
**Primary Dependencies**: `vscode` API (built-in) — `TreeDataProvider`, `TreeItem`, `EventEmitter`, `env.clipboard`, `commands.executeCommand`; Node.js `child_process` via existing `cli.ts`  
**Storage**: N/A  
**Testing**: Mocha + `@vscode/test-cli` + `@vscode/test-electron` (existing scaffold)  
**Target Platform**: VS Code Extension Host (VS Code ^1.110.0)  
**Project Type**: VS Code Extension (additive feature on top of `001-vscode-extension-mvp`)  
**Performance Goals**: Panel renders ≤ 500 keys without degradation; `getChildren()` completes in < 2 seconds for typical vaults  
**Constraints**: `child_process` import stays exclusively in `cli.ts`; no vault logic outside `cli.ts`; no values in any output  
**Scale/Scope**: 1 new source file (`treeView.ts`), 2 modified files (`setSecret.ts`, `extension.ts`), `package.json` additions

## Constitution Check

*The constitution is written for the core Rust `envy` CLI. This plan covers the TypeScript VS Code extension companion — a separate project. The spirit of each principle is applied to the TypeScript context.*

| Principle | Applies? | Status | Notes |
|-----------|----------|--------|-------|
| I. Security by Default | ✓ Yes | **PASS** | Values are never fetched, stored, displayed, or copied. `envy list` returns only keys. Copy action writes only `item.key`. |
| II. Determinism | ✓ Yes | **PASS** | Tree reloads on demand and after write operations. No implicit state mutation. Panel state is deterministic from `envy list` output. |
| III. Rust Best Practices | Adapted | **PASS** | TypeScript `strict: true` is the equivalent. No `any` types. Errors propagated via the existing `CliResult`/`CliNotFoundError` contract. |
| IV. Modularity | ✓ Yes | **PASS** | `treeView.ts` is a UI layer only — delegates all vault access to `cli.ts`. Zero direct vault/file access. |
| V. Language | ✓ Yes | **PASS** | All identifiers, comments, and messages in English. |

**Result**: No violations. No Complexity Tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/002-tree-view/
├── plan.md              # This file
├── research.md          # API and pattern decisions
├── data-model.md        # SecretKeyItem, EnvySecretsProvider, TreeViewState
├── quickstart.md        # Manual F5 test scenarios
├── contracts/
│   └── commands.md      # New commands, modified setSecret, package.json additions
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── extension.ts            # MODIFIED: register tree view + 3 new commands; wire refreshTree
├── cli.ts                  # UNCHANGED: execEnvy(['list'], cwd) already supported
├── statusBar.ts            # UNCHANGED
├── treeView.ts             # NEW: SecretKeyItem + EnvySecretsProvider
└── commands/
    ├── initVault.ts        # UNCHANGED
    ├── setSecret.ts        # MODIFIED: add optional prefillKey?: string param
    ├── showDiff.ts         # UNCHANGED
    ├── encrypt.ts          # UNCHANGED
    └── decrypt.ts          # UNCHANGED
```

**Structure Decision**: Single-project flat layout. `treeView.ts` sits alongside `statusBar.ts` — both are VS Code UI components registered in `extension.ts`. No new directories needed.

## Phase Decisions

### Phase 0 Research (complete — see research.md)

| Unknown | Resolution |
|---------|------------|
| `registerTreeDataProvider` vs `createTreeView` | `registerTreeDataProvider` — no reveal/select needed |
| Empty/loading state display | `viewsWelcome` + context key `envySecrets.state` |
| Inline icon buttons | `view/item/context` menus with `"group": "inline"` |
| Refresh mechanism | `EventEmitter<void>.fire()` on provider; `refreshTree()` closure in `extension.ts` |
| Pre-populate Set Secret | Pass `item.key` as positional arg to `executeCommand('envy-vscode.setSecret', key)` |
| `envy list` passphrase | User confirmed: OS keyring, no passphrase → `execFile` safe |
| Explorer panel placement | `"contributes.views": { "explorer": [...] }` |

### Phase 1 Design (complete — see artifacts)

- **data-model.md**: `SecretKeyItem`, `EnvySecretsProvider`, `TreeViewState`
- **contracts/commands.md**: 3 new commands, `setSecret` signature change, full `package.json` diff
- **quickstart.md**: 7 manual F5 test scenarios

## Key Implementation Rules

1. **`child_process` stays in `cli.ts`**: `treeView.ts` calls `execEnvy` — never imports `child_process`.
2. **Values never surfaced**: `getChildren()` parses only key names from `envy list` stdout. The `envy get` command is never called.
3. **Context key required**: `setContext('envySecrets.state', state)` must be called every time panel state changes — without it, `viewsWelcome` entries do not render.
4. **`contextValue = 'secretKey'`**: Must be set on every `SecretKeyItem` — drives inline button `when` clauses in `package.json`.
5. **`setSecret` backwards-compatible**: `prefillKey` is optional with `undefined` default. Command Palette flow is unchanged.
6. **`refreshTree` wired in `extension.ts`**: Called after `initVault` and `setSecret` succeed — same pattern as `refreshStatusBar`.
