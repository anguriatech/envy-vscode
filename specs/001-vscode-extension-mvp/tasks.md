# Tasks: Envy VS Code Extension MVP

**Input**: Design documents from `/specs/001-vscode-extension-mvp/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: No automated test tasks (not requested). Manual Extension Development Host (F5) verification tasks are included at the end of each story phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US7)

---

## Phase 1: Setup

**Purpose**: Clean up the generated extension scaffold and wire the contribution points before any feature work begins.

- [x] T001 Remove the placeholder `helloWorld` command from `src/extension.ts` (delete the `registerCommand` call and the `console.log` line); leave the empty `activate()` and `deactivate()` shells
- [x] T002 Replace the `contributes.commands` array and `activationEvents` in `package.json` with the 5 Envy commands and `"onStartupFinished"` activation event per `specs/001-vscode-extension-mvp/contracts/commands.md`
- [x] T003 Create the `src/commands/` directory by adding a `.gitkeep` placeholder; it will be populated in later phases

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The CLI executor and extension scaffold must be complete before any command handler can be implemented.

**⚠️ CRITICAL**: All user story phases depend on T004–T006 being complete.

- [x] T004 Create `src/cli.ts`: define `CliResult` interface (`stdout: string`, `stderr: string`, `exitCode: number`), define `CliNotFoundError` class (extends `Error`), and export `async function execEnvy(args: string[], cwd: string): Promise<CliResult>` using `node:child_process` `exec` — resolve with stdout/stderr/exitCode on success, throw `CliNotFoundError` when exec fails with `ENOENT`, reject with the error otherwise
- [x] T005 Create `src/statusBar.ts`: export `function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem` that calls `vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)`, sets initial text to `$(sync~spin) Envy`, pushes the item to `context.subscriptions`, and calls `.show()`; export `async function refreshStatusBar(item: vscode.StatusBarItem, cwd: string): Promise<void>` stub (returns immediately) — full implementation in US2
- [x] T006 Rewrite `src/extension.ts` `activate()` to: (1) resolve workspace root from `vscode.workspace.workspaceFolders?.[0].uri.fsPath` (show error and return early if no folder is open), (2) create the `Envy` Output Channel via `vscode.window.createOutputChannel('Envy')` and push to `context.subscriptions`, (3) create the status bar item via `createStatusBar(context)`, (4) declare a module-level `let cliAvailable = false` flag, (5) call `execEnvy(['--version'], cwd)` to detect the CLI — set `cliAvailable = true` on success, leave false on `CliNotFoundError`; leave command registration stubs as `// TODO: register commands here`

**Checkpoint**: `npm run compile` must succeed with zero TypeScript errors before proceeding.

---

## Phase 3: User Story 1 — CLI Detection (Priority: P1) 🎯 MVP

**Goal**: When the `envy` CLI is not on PATH, the user sees an actionable error notification on extension activation.

**Independent Test**: Temporarily remove `envy` from PATH (or rename the binary). Press F5 to open Extension Development Host. Verify the error notification appears with a "View Installation Guide" button.

- [x] T007 [US1] In `src/extension.ts` `activate()`, after the `execEnvy(['--version'])` call fails with `CliNotFoundError`: call `vscode.window.showErrorMessage('Envy CLI not found. Install it to use this extension.', 'View Installation Guide')` and store the returned promise
- [x] T008 [US1] Chain a `.then(selection => { if (selection === 'View Installation Guide') vscode.env.openExternal(vscode.Uri.parse('https://github.com/anguriatech/envy#installation')) })` handler on the `showErrorMessage` promise from T007
- [x] T009 [US1] Add a guard at the top of every future command handler: `if (!cliAvailable) { vscode.window.showErrorMessage('Envy CLI is not installed.'); return; }` — add this as a shared helper `function requireCli(): boolean` in `src/extension.ts` that shows the message and returns false when CLI is unavailable
- [ ] T010 [US1] Manual F5 test — Extension Development Host: (a) with `envy` on PATH: activate extension, confirm no error notification; (b) with `envy` not on PATH (rename binary or clear PATH in the VS Code debug launch config in `.vscode/launch.json`): confirm error notification appears with "View Installation Guide" button; confirm clicking it opens the browser

**Checkpoint**: CLI detection fully functional. US1 independently verifiable.

---

## Phase 4: User Story 2 — Vault Sync Status at a Glance (Priority: P2)

**Goal**: A status bar item at the bottom right shows the current vault sync state whenever a workspace is open.

**Independent Test**: Open a workspace with `envy.toml`. Press F5. Verify the status bar item shows a sync state matching `envy status` output (run in terminal to cross-check).

- [x] T011 [US2] In `src/statusBar.ts`, implement `refreshStatusBar(item, cwd)`: call `execEnvy(['status'], cwd)`, inspect combined stdout for keywords — set item text to `$(sync) Envy: In Sync` if stdout includes "In Sync", `$(warning) Envy: Modified` if includes "Modified", `$(circle-slash) Envy: Never Sealed` if includes "Never Sealed"; set `$(circle-slash) Envy: Not Initialized` if `exitCode !== 0` and stderr includes "not found" / "no manifest"; set `$(error) Envy: Error` for any other failure; set `item.tooltip` to the full raw stdout
- [x] T012 [US2] In `src/extension.ts`, after the status bar item is created (T005/T006), call `refreshStatusBar(statusBarItem, cwd)` — this populates the status bar on activation
- [x] T013 [US2] Export `refreshStatusBar` from `src/statusBar.ts` and re-export a convenience `refresh` closure from `src/extension.ts` (capturing `statusBarItem` and `cwd`) so all command handlers can call `refresh()` without knowing the implementation details
- [ ] T014 [US2] Manual F5 test — open workspace with initialized vault in sync: verify status bar shows `$(sync) Envy: In Sync`; add a secret via terminal (`envy set X=1`), reload extension, verify `$(warning) Envy: Modified`; open workspace with no `envy.toml`, verify `$(circle-slash) Envy: Not Initialized`

**Checkpoint**: Status bar fully functional and independently verifiable.

---

## Phase 5: User Story 3 — Vault Initialization (Priority: P3)

**Goal**: "Envy: Init Vault" in Command Palette initializes the vault in the current workspace.

**Independent Test**: Open a folder with no `envy.toml`. Run "Envy: Init Vault" from Command Palette. Verify `envy.toml` is created and a success notification appears.

- [x] T015 [US3] Create `src/commands/initVault.ts`: export `async function handler(outputChannel: vscode.OutputChannel, cwd: string, refresh: () => Promise<void>): Promise<void>` — call `execEnvy(['init'], cwd)`, append stdout + stderr to `outputChannel` via `outputChannel.appendLine()`, call `vscode.window.showInformationMessage('Vault initialized.')` on success, call `vscode.window.showErrorMessage(result.stderr || 'envy init failed.')` on non-zero exit code, call `refresh()` on success
- [x] T016 [US3] In `src/extension.ts`, replace the `// TODO: register commands here` stub for init with `context.subscriptions.push(vscode.commands.registerCommand('envy-vscode.initVault', async () => { if (!requireCli()) return; await initVaultHandler(outputChannel, cwd, refresh); }))`
- [ ] T017 [US3] Manual F5 test — open folder with no `envy.toml`; run "Envy: Init Vault"; verify (a) `envy.toml` appears in workspace root, (b) success notification shown, (c) Output Channel shows CLI stdout, (d) status bar updates to reflect new state

**Checkpoint**: Init vault fully functional. US3 independently verifiable.

---

## Phase 6: User Story 4 — Set Secret (Priority: P4)

**Goal**: "Envy: Set Secret" collects a key and an obscured value via two input boxes, then stores the secret in the vault.

**Independent Test**: Open an initialized vault. Run "Envy: Set Secret". Enter key `TEST_KEY` and value `hunter2`. Verify secret exists via `envy list` in terminal. Verify cancelling either input box makes no change.

- [x] T018 [US4] Create `src/commands/setSecret.ts`: export `async function handler(outputChannel, cwd, refresh)` — call `vscode.window.showInputBox({ prompt: 'Secret key (e.g. DATABASE_URL)', placeHolder: 'KEY_NAME', ignoreFocusOut: true })` and store result as `key`; if `key` is `undefined` (user pressed Escape), return immediately without any side effect
- [x] T019 [US4] In `setSecret.ts`, call `vscode.window.showInputBox({ prompt: 'Secret value', password: true, ignoreFocusOut: true })` and store as `value`; if `value` is `undefined`, return immediately; compose the argument string as `` `${key}=${value}` `` — pass to `execEnvy(['set', `${key}=${value}`], cwd)`
- [x] T020 [US4] In `setSecret.ts`, on success show `vscode.window.showInformationMessage('Secret set.')` and call `refresh()`; on non-zero exit code show `vscode.window.showErrorMessage(result.stderr || 'envy set failed.')` and append stderr to `outputChannel`; do NOT append the secret value to the output channel at any point
- [x] T021 [US4] In `src/extension.ts`, register `envy-vscode.setSecret` command using the same `requireCli()` guard pattern, passing `outputChannel`, `cwd`, `refresh`
- [ ] T022 [US4] Manual F5 test — (a) run "Envy: Set Secret", enter `API_KEY` + `abc123`, confirm success notification and status bar refreshes; (b) run again and press Escape on the key prompt — confirm no notification and no vault change; (c) run again, enter key, press Escape on value prompt — confirm no vault change

**Checkpoint**: Set secret fully functional. Cancellation is clean. Secret value never appears in Output Channel.

---

## Phase 7: User Story 5 — Show Diff (Priority: P5)

**Goal**: "Envy: Show Diff" displays the diff between the vault and `envy.enc` in the Envy Output Channel.

**Independent Test**: Add a secret then run "Envy: Show Diff". Verify Output Channel opens and shows the added key. Run with no changes — verify "no differences" output.

- [x] T023 [US5] Create `src/commands/showDiff.ts`: export `async function handler(outputChannel, cwd)` — call `execEnvy(['diff'], cwd)`; call `outputChannel.clear()`, then `outputChannel.appendLine(result.stdout)` (and stderr if non-empty); call `outputChannel.show()`; on exit code 0 call `vscode.window.showInformationMessage('No pending changes.')`, on exit code 1 call `vscode.window.showInformationMessage('Differences found — review the Envy output channel.')`, on exit code ≥ 2 call `vscode.window.showErrorMessage(result.stderr || 'envy diff failed.')`
- [x] T024 [US5] In `src/extension.ts`, register `envy-vscode.showDiff` command with the `requireCli()` guard, passing `outputChannel` and `cwd`
- [ ] T025 [US5] Manual F5 test — (a) add a secret via terminal; run "Envy: Show Diff"; confirm Output Channel opens and shows the added key with `+` prefix; (b) run `envy encrypt` in terminal to seal; run "Envy: Show Diff" again; confirm "No pending changes" notification

**Checkpoint**: Show diff fully functional, Output Channel opens automatically.

---

## Phase 8: User Story 6 — Encrypt / Seal (Priority: P6)

**Goal**: "Envy: Encrypt (Seal)" opens the integrated terminal and runs `envy encrypt` so the user can enter their passphrase interactively.

**Independent Test**: Open initialized vault with unsealed changes. Run "Envy: Encrypt (Seal)". Verify the Envy integrated terminal opens, the passphrase prompt appears, and `envy.enc` is created/updated after entering the passphrase.

- [x] T026 [US6] Create `src/commands/encrypt.ts`: export `async function handler(refresh: () => Promise<void>): Promise<void>` — declare a module-level `let envyTerminal: vscode.Terminal | undefined`; if `envyTerminal` is undefined or its `exitStatus` is defined (it has been closed), create a new terminal via `vscode.window.createTerminal({ name: 'Envy' })` and assign to `envyTerminal`; call `envyTerminal.sendText('envy encrypt', true)`, then `envyTerminal.show()`; call `setTimeout(() => refresh(), 3000)` to refresh the status bar after 3 seconds
- [x] T027 [US6] In `src/extension.ts`, register `envy-vscode.encrypt` command with the `requireCli()` guard; import `handler` from `src/commands/encrypt.ts`; pass `refresh` as the only argument
- [ ] T028 [US6] Manual F5 test — add a secret via "Envy: Set Secret"; run "Envy: Encrypt (Seal)"; confirm Envy terminal panel appears, `envy encrypt` is pre-typed and executed, passphrase prompt is shown; enter passphrase; confirm `envy.enc` created in workspace root and status bar updates to "In Sync" after ~3 seconds

**Checkpoint**: Encrypt via integrated terminal works. PTY passphrase interaction confirmed.

---

## Phase 9: User Story 7 — Decrypt (Priority: P7)

**Goal**: "Envy: Decrypt" opens the integrated terminal and runs `envy decrypt` so the user can restore vault secrets from `envy.enc`.

**Independent Test**: With `envy.enc` present and an empty/different vault, run "Envy: Decrypt". Verify the terminal opens with the passphrase prompt and the vault is populated after entering the passphrase.

- [x] T029 [US7] Create `src/commands/decrypt.ts`: same terminal-reuse pattern as `encrypt.ts` but sends `'envy decrypt'`; reuse the same `envyTerminal` module-level reference (or create a fresh one); call `setTimeout(() => refresh(), 3000)` for status bar refresh
- [x] T030 [US7] In `src/extension.ts`, register `envy-vscode.decrypt` command with the `requireCli()` guard; import `handler` from `src/commands/decrypt.ts`; pass `refresh`
- [ ] T031 [US7] Manual F5 test — with `envy.enc` present; run "Envy: Decrypt"; confirm terminal opens with `envy decrypt` executing; enter passphrase; verify secrets are now accessible via `envy list` in a separate terminal; confirm status bar updates after ~3 seconds

**Checkpoint**: Decrypt via integrated terminal works. Full workflow (set → diff → encrypt → decrypt) is complete.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening across all user stories.

- [x] T032 [P] Run `npm run compile` and resolve any remaining TypeScript strict-mode errors across all new source files; confirm zero warnings
- [x] T033 [P] Run `npm run lint` (ESLint) and fix all reported issues in `src/extension.ts`, `src/cli.ts`, `src/statusBar.ts`, and all files in `src/commands/`
- [x] T034 Run `npm test` to confirm the existing Mocha scaffold test passes; update `src/test/extension.test.ts` to import the extension and assert it activates without throwing
- [ ] T035 Full end-to-end manual F5 test — complete workflow in a fresh workspace: (1) confirm CLI detection works; (2) run "Envy: Init Vault"; (3) run "Envy: Set Secret" twice; (4) run "Envy: Show Diff"; (5) run "Envy: Encrypt (Seal)"; (6) run "Envy: Show Diff" again (expect "No pending changes"); (7) run "Envy: Decrypt"; (8) confirm status bar reflects correct state at each step
- [x] T036 [P] Update `CLAUDE.md` project structure section (between the `MANUAL ADDITIONS` markers) with the final `src/` layout: `extension.ts`, `cli.ts`, `statusBar.ts`, `commands/initVault.ts`, `commands/setSecret.ts`, `commands/showDiff.ts`, `commands/encrypt.ts`, `commands/decrypt.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — `npm run compile` must pass before user story work begins
- **Phase 3–9 (User Stories)**: All depend on Phase 2 completion; stories can then proceed sequentially in priority order
- **Phase 10 (Polish)**: Depends on all user story phases complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. No story dependencies.
- **US2 (P2)**: Depends on Phase 2 + US1 (`cliAvailable` flag and `refresh` closure from T013). Start after US1 checkpoint.
- **US3 (P3)**: Depends on Phase 2. Can start after US1 (needs `requireCli()` helper from T009).
- **US4 (P4)**: Depends on Phase 2. Can start after US1 (needs `requireCli()`).
- **US5 (P5)**: Depends on Phase 2. Can start after US1 (needs `requireCli()`).
- **US6 (P6)**: Depends on Phase 2. Can start after US1 (needs `requireCli()` and `refresh`).
- **US7 (P7)**: Depends on Phase 2. Mirror of US6 — can start in parallel with US6 after US1.

### Within Each User Story

- Command file (`src/commands/*.ts`) → registration in `src/extension.ts`
- Registration MUST happen after the handler file is implemented

### Parallel Opportunities

- T015, T018, T023 (`initVault.ts`, `setSecret.ts`, `showDiff.ts`) can be written in parallel after Phase 2 — different files, no intra-story dependencies
- T026, T029 (`encrypt.ts`, `decrypt.ts`) can be written in parallel — nearly identical patterns
- T032, T033, T036 in Phase 10 can run in parallel

---

## Parallel Example: US3 + US4 + US5

```text
# After Phase 2 + US1 complete, these can run simultaneously:
Task T015: Create src/commands/initVault.ts
Task T018: Create src/commands/setSecret.ts (T018–T020)
Task T023: Create src/commands/showDiff.ts

# Then register each in extension.ts:
Task T016: Register envy-vscode.initVault
Task T021: Register envy-vscode.setSecret
Task T024: Register envy-vscode.showDiff
```

---

## Implementation Strategy

### MVP First (US1 + US2 only — Status Visibility)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T006)
3. Complete Phase 3: US1 CLI Detection (T007–T010)
4. Complete Phase 4: US2 Status Bar (T011–T014)
5. **STOP and VALIDATE**: Open workspace, verify status bar shows sync state, verify missing CLI shows notification
6. Extension is already useful at this point (passive monitoring)

### Full MVP (All 7 User Stories)

1. Complete Setup + Foundational
2. US1 → US2 (foundation layer — must be first)
3. US3 + US4 + US5 in parallel (write command files simultaneously, then register)
4. US6 + US7 in parallel (nearly identical terminal pattern)
5. Phase 10 Polish
6. Full end-to-end F5 validation (T035)

---

## Notes

- `cli.ts` is the **only** file that imports `child_process` — enforce this throughout
- `setSecret.ts` must **never** append the secret value to the Output Channel or any log
- `encrypt.ts` and `decrypt.ts` use `vscode.window.createTerminal` — NOT `child_process`
- All command handlers use `requireCli()` guard before touching the vault
- Status bar refresh uses `setTimeout(3000)` for terminal commands (encrypt/decrypt) — this is intentional for MVP
- `[P]` tasks = different files, no shared state dependencies
- Commit after each phase checkpoint to keep incremental progress
