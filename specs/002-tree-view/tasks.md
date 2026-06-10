# Tasks: Envy Tree View

**Input**: Design documents from `/specs/002-tree-view/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Automated test tasks cover command registration assertions (Mocha). Visual tree view behavior is verified via manual F5 Extension Development Host tests, included at the end of each story phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project scaffolding is required. The tree view builds on the existing `001-vscode-extension-mvp` structure. All setup is captured in the foundational `package.json` additions below.

*(No setup tasks — foundational phase begins immediately.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: All `package.json` contribution points — view registration, viewsWelcome, commands, and menus — must be defined before any source code can reference the view ID or command IDs. This phase has no source code changes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. The view ID `envySecrets` and all command IDs are referenced by both source code and `package.json` when clauses.

- [x] T001 Add `"contributes.views": { "explorer": [{ "id": "envySecrets", "name": "Envy Secrets" }] }` to `package.json` — registers the tree view panel in the VS Code Explorer sidebar
- [x] T002 Add all four `"contributes.viewsWelcome"` entries to `package.json` for states `empty`, `notInitialized`, `error`, and `cliUnavailable` per `contracts/commands.md` — each entry has a `when` clause matching `envySecrets.state == '<state>'`
- [x] T003 Add three new command contributions to the `"contributes.commands"` array in `package.json`: `envy-vscode.copyKeyName` (icon `$(copy)`), `envy-vscode.editSecret` (icon `$(edit)`), `envy-vscode.refreshTreeView` (icon `$(refresh)`) per `contracts/commands.md`
- [x] T004 Add `"contributes.menus"` entries to `package.json`: refresh button in `"view/title"` (group `navigation`, `when: "view == envySecrets"`); copy + edit inline buttons in `"view/item/context"` (group `inline@1` and `inline@2`, `when: "view == envySecrets && viewItem == secretKey"`) per `contracts/commands.md`

**Checkpoint**: `npm run compile` must succeed with zero errors after `package.json` changes before proceeding.

---

## Phase 3: User Story 1 — Browse Secret Keys in the Side Panel (Priority: P1) 🎯 MVP

**Goal**: The "Envy Secrets" panel appears in the VS Code Explorer sidebar and lists all vault key names fetched from `envy list`. No values are shown. Empty, not-initialized, and CLI-unavailable states are handled.

**Independent Test**: Open a workspace with an initialized vault containing ≥ 1 secret. Press F5. Open the Explorer sidebar. Verify the "Envy Secrets" section lists each key name on its own row. Confirm no values appear.

- [x] T005 [US1] Create `src/treeView.ts`: define `SecretKeyItem` class extending `vscode.TreeItem` — constructor takes `key: string`, sets `this.label = key`, `this.contextValue = 'secretKey'`, `this.iconPath = new vscode.ThemeIcon('key')`, `this.collapsibleState = vscode.TreeItemCollapsibleState.None`
- [x] T006 [US1] Add `EnvySecretsProvider` class to `src/treeView.ts` implementing `vscode.TreeDataProvider<SecretKeyItem>`: declare `private _onDidChangeTreeData = new vscode.EventEmitter<void>()`, expose `readonly onDidChangeTreeData = this._onDidChangeTreeData.event`, add `refresh(): void` method that fires `this._onDidChangeTreeData.fire()`; constructor accepts `cwd: string`
- [x] T007 [US1] Implement `getTreeItem(element: SecretKeyItem): vscode.TreeItem` in `EnvySecretsProvider` — returns `element` unchanged (elements are already `TreeItem` instances)
- [x] T008 [US1] Implement `async getChildren(): Promise<SecretKeyItem[]>` in `EnvySecretsProvider`: call `execEnvy(['list'], this._cwd)`, parse stdout by splitting on `\n`, trimming whitespace, filtering empty lines; return one `SecretKeyItem` per non-empty line; import `execEnvy` and `CliNotFoundError` from `../cli`
- [x] T009 [US1] Add state management to `EnvySecretsProvider.getChildren()`: after parsing, call `vscode.commands.executeCommand('setContext', 'envySecrets.state', state)` where `state` is `'keys'` if items.length > 0, `'empty'` if items.length === 0 and exitCode === 0, `'notInitialized'` if exitCode !== 0 and stderr matches `/not found|no manifest|no vault/i`, `'cliUnavailable'` if error is `CliNotFoundError`, `'error'` for any other non-zero exit; export `EnvySecretsProvider` from `src/treeView.ts`
- [x] T010 [US1] In `src/extension.ts`, import `EnvySecretsProvider` from `./treeView`; in `activate()`, after `createStatusBar`, instantiate `const provider = new EnvySecretsProvider(cwd ?? '')` and call `context.subscriptions.push(vscode.window.registerTreeDataProvider('envySecrets', provider))`; set initial context key `vscode.commands.executeCommand('setContext', 'envySecrets.state', 'loading')` before the first refresh
- [x] T011 [US1] Manual F5 test — Extension Development Host: (a) open workspace with ≥ 1 secret: verify "Envy Secrets" panel lists all key names, no values visible; (b) open workspace with no secrets: verify "No secrets found" welcome message appears; (c) open folder with no `envy.toml`: verify "Vault not initialized" message appears — **verified by reviewer via F5 on 2026-06-10**

**Checkpoint**: US1 fully functional. "Envy Secrets" panel visible and listing keys independently.

---

## Phase 4: User Story 2 — Copy a Key Name with One Click (Priority: P2)

**Goal**: Each key row shows a copy icon on hover. Clicking it writes the key name to the clipboard and shows a brief confirmation notification.

**Independent Test**: Open a vault with ≥ 1 key. Hover over a key row in the "Envy Secrets" panel. Verify the copy icon (📋) appears. Click it. Paste into a text editor. Verify only the key name (not the value) was pasted.

- [x] T012 [US2] In `src/extension.ts`, register `envy-vscode.copyKeyName` command: `vscode.commands.registerCommand('envy-vscode.copyKeyName', async (item: SecretKeyItem) => { await vscode.env.clipboard.writeText(item.key); void vscode.window.showInformationMessage(\`Copied: \${item.key}\`); })`; import `SecretKeyItem` from `./treeView`
- [x] T013 [US2] Manual F5 test — hover over a key row: verify copy icon appears; click it; paste into a new editor tab; verify only the key name is pasted (not the value); verify "Copied: KEY_NAME" notification appears briefly — **verified by reviewer via F5 on 2026-06-10**

**Checkpoint**: US2 functional. Copy icon visible on hover; clipboard receives only the key name.

---

## Phase 5: User Story 3 — Update a Secret Value Directly from the Tree (Priority: P3)

**Goal**: Each key row shows an edit icon on hover. Clicking it opens the existing "Envy: Set Secret" input flow with the key name pre-populated so the user only needs to enter a new value.

**Independent Test**: Open a vault with ≥ 1 key. Hover over a key row. Click the edit icon. Verify the Set Secret input box opens with the key name already filled in. Enter a new value. Verify the secret is updated.

- [x] T014 [US3] Modify `src/commands/setSecret.ts`: add optional fourth parameter `prefillKey?: string` to the `handler` function signature; update the first `vscode.window.showInputBox` call to include `value: prefillKey ?? ''` so the key field is pre-populated when provided
- [x] T015 [US3] In `src/extension.ts`, update the `envy-vscode.setSecret` command registration to forward a `keyArg` from command arguments: change handler to `async (keyArg?: string) => { ...; await setSecretHandler(outputChannel, cwd, refresh, keyArg); }` — this makes the command accept the optional key from `executeCommand` calls
- [x] T016 [US3] In `src/extension.ts`, register `envy-vscode.editSecret` command: `vscode.commands.registerCommand('envy-vscode.editSecret', async (item: SecretKeyItem) => { await vscode.commands.executeCommand('envy-vscode.setSecret', item.key); })`
- [x] T017 [US3] Manual F5 test — hover over a key row; click edit icon; verify Set Secret input box opens with key name pre-filled; enter a new value and confirm; verify success notification appears and key is still listed in the panel — **verified by reviewer via F5 on 2026-06-10**

**Checkpoint**: US3 functional. Edit icon visible on hover; Set Secret opens pre-populated with the key name.

---

## Phase 6: User Story 4 — Keep the Panel Up to Date (Priority: P4)

**Goal**: The "Envy Secrets" panel auto-refreshes after write operations (Set Secret, Init Vault) that succeed within the extension. A manual refresh button in the panel header reloads the key list on demand.

**Independent Test**: Run "Envy: Set Secret" and add a new key. Verify the new key appears in the panel automatically without clicking refresh. Then click the panel header refresh button (🔄) and verify the list reloads.

- [x] T018 [US4] In `src/extension.ts`, create a `refreshTree` closure: `const refreshTree = async (): Promise<void> => { provider.refresh(); }` — this parallels the existing `refresh` closure for `refreshStatusBar`; call `void refreshTree()` at the end of the `initVault` handler (after the existing `refresh()` call for the status bar)
- [x] T019 [US4] In `src/extension.ts`, wire `refreshTree` into the `setSecret` command: call `void refreshTree()` at the end of the `setSecret` handler (after the existing `refresh()` call for the status bar, inside the success branch of the handler — note `setSecret` handler already calls `refresh()` internally; wire `refreshTree` to be called from `extension.ts` after the command resolves, mirroring the `initVault` pattern)
- [x] T020 [US4] In `src/extension.ts`, register `envy-vscode.refreshTreeView` command: `vscode.commands.registerCommand('envy-vscode.refreshTreeView', () => { provider.refresh(); })`; push to `context.subscriptions`
- [x] T021 [US4] Manual F5 test — (a) run "Envy: Set Secret" via Command Palette; add a new key; verify it appears in "Envy Secrets" panel without clicking refresh; (b) click the refresh button (🔄) in the panel header; verify the list reloads; (c) run "Envy: Init Vault" in a fresh workspace; verify the panel transitions from "not initialized" to the empty-vault message — **verified by reviewer via F5 on 2026-06-10**

**Checkpoint**: US4 functional. Panel auto-refreshes after Set Secret and Init Vault; manual refresh works.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Automated test updates, compile/lint verification, and documentation.

- [x] T022 [P] Update `src/test/extension.test.ts`: add assertions that `envy-vscode.copyKeyName`, `envy-vscode.editSecret`, and `envy-vscode.refreshTreeView` are registered in `vscode.commands.getCommands(true)` — run `npm test` to confirm the new assertions pass
- [x] T023 [P] Run `npm run compile` and resolve any remaining TypeScript strict-mode errors across `src/treeView.ts`, `src/commands/setSecret.ts`, and `src/extension.ts`; confirm zero webpack errors
- [x] T024 [P] Run `npm run lint` and fix all ESLint issues in `src/treeView.ts`, `src/commands/setSecret.ts`, and `src/extension.ts`
- [x] T025 Run `npm test` to confirm all Mocha tests pass (includes the new command registration assertions from T022)
- [x] T026 [P] Update `CLAUDE.md` project structure section: add `treeView.ts` to the `src/` layout and add `TreeDataProvider`, `EventEmitter`, `env.clipboard` to the active technologies section (renamed to `AGENTS.md` during tooling migration; same content)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Foundational)**: No dependencies — start immediately. **BLOCKS all user story phases.**
- **Phase 3 (US1)**: Depends on Phase 2 — `package.json` view + command IDs must exist before source code references them.
- **Phase 4 (US2)**: Depends on Phase 3 — copy icon requires `SecretKeyItem.contextValue = 'secretKey'` which is defined in `src/treeView.ts`.
- **Phase 5 (US3)**: Depends on Phase 2 only — `setSecret.ts` change is independent of the tree view. Registration of `editSecret` in `extension.ts` depends on Phase 3 (`SecretKeyItem` import).
- **Phase 6 (US4)**: Depends on Phase 3 — `provider.refresh()` method must exist.
- **Phase 7 (Polish)**: Depends on all user story phases complete.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. No story dependencies.
- **US2 (P2)**: Depends on US1 — needs `SecretKeyItem` class and `contextValue = 'secretKey'` to exist.
- **US3 (P3)**: `setSecret.ts` change (T014) can start after Phase 2. Registration (T015, T016) depends on US1 for the `SecretKeyItem` import.
- **US4 (P4)**: Depends on US1 — needs `provider.refresh()` method. Auto-refresh wiring depends on `refreshTree` closure which needs `provider`.

### Within Each User Story

- `SecretKeyItem` (T005) before `EnvySecretsProvider` (T006–T009) — provider uses the item class
- Provider complete (T009) before registration in `extension.ts` (T010)
- Source changes complete before manual F5 test tasks

### Parallel Opportunities

- T001–T004 (package.json changes) can run sequentially as edits to the same file — no parallelism within Phase 2
- T005–T009 within US1 are sequential (each builds on the previous)
- T014 (setSecret.ts) can start in parallel with US1 work (T005–T010) — different files
- T022, T023, T024, T026 in Polish can run in parallel — different files

---

## Parallel Example: US1 + US3 (T014)

```text
# After Phase 2 completes, these can start simultaneously:

Developer / LLM context A:
  T005 → T006 → T007 → T008 → T009 → T010 → T011  (US1: tree view in extension.ts)

Developer / LLM context B:
  T014  (US3: modify setSecret.ts — independent file, no dependency on treeView.ts)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (`package.json` additions)
2. Complete Phase 3: US1 (T005–T011)
3. **STOP and VALIDATE**: "Envy Secrets" panel shows keys → US1 independently functional
4. Proceed to US2, US3, US4 in order

### Incremental Delivery

1. Phase 2 → Phase 3 (US1): Panel shows keys → MVP delivered
2. Phase 4 (US2): Copy icon works → browsing + copy workflow complete
3. Phase 5 (US3): Edit icon pre-populates key → full read+write loop from panel
4. Phase 6 (US4): Auto-refresh wired → panel stays current after every write
5. Phase 7: Polish → ship

---

## Notes

- `child_process` must stay exclusively in `src/cli.ts` — `treeView.ts` calls `execEnvy()`, never imports `child_process`
- `setContext('envySecrets.state', ...)` must be called on every state change — `viewsWelcome` entries will silently not render if this is omitted
- `SecretKeyItem.contextValue` must be exactly `'secretKey'` (case-sensitive) — this string is matched in `package.json` `when` clauses
- The `prefillKey` change to `setSecret.ts` is backward-compatible — Command Palette flow works unchanged when `keyArg` is `undefined`
- Manual F5 tests (T011, T013, T017, T021) require a workspace with an initialized vault containing ≥ 1 secret
