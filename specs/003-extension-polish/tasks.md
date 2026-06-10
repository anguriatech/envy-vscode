# Tasks: Envy Extension Polish

**Input**: Design documents from `/specs/003-extension-polish/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/commands.md ✓, quickstart.md ✓

**Tests**: One unit test task is included (JSON status bar parser, in Polish phase) — it is the highest-value automated test for this spec because it locks in the lowercase_snake_case status enum and catches the PascalCase-vs-snake_case regression risk identified during CLI exploration. Manual F5 tests are deferred to the reviewer per the user's explicit decision — all 13 scenarios from `quickstart.md` are listed as a single deferred task in the Polish phase, not as 13 per-story test tasks.

**Organization**: Tasks are grouped by user story (5 user stories, P1×3 / P2 / P3) to enable independent implementation and testing of each story. The two non-story FRs (FR-019 inFlight mutex, FR-020 tree view regex fix) are placed in Foundational and Polish respectively.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions
- Manual F5 tests are **deferred to the reviewer** (single task in Polish phase) per the user's input

---

## Phase 1: Setup

**Purpose**: No new project scaffolding is required. The extension builds on the existing `001-vscode-extension-mvp` and `002-tree-view` structure. All extension surface area is already established (9 commands, "Envy Secrets" tree panel, status bar, Output Channel).

*(No setup tasks — foundational phase begins immediately.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Two pieces of shared infrastructure MUST be in place before any user story can be implemented:

1. **`src/cli.ts`** — `execEnvy` is extended with an optional `ExecOptions` parameter (used by US1, US2, US3, US4). When `options.stdin` is set, the executor switches to `child_process.spawn` and writes stdin; when `options.env` is set, it merges it into the child's environment. The 4 existing call sites (`statusBar.ts:68`, `treeView.ts:49`, `initVault.ts:9`, `setSecret.ts:32`) pass only `(args, cwd)` and continue to work unchanged.

2. **`src/extension.ts`** — the `inFlight` mutex (`inFlight: Promise<void> | undefined`) plus `guardCrypto` and `trackCrypto` helpers are added. These are required by the 3 P1 user stories (US1, US2, US3) to serialize encrypt/decrypt/diff.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. US4 (secure set) depends only on T001. US5 (JSON status bar) depends on T001. The crypto commands (US1, US2, US3) depend on both T001 and T002.

- [x] T001 Extend `src/cli.ts`: change `execEnvy` signature to `execEnvy(args: string[], cwd: string, options?: ExecOptions): Promise<CliResult>`; export `ExecOptions` interface with `stdin?: string` and `env?: NodeJS.ProcessEnv` fields; add internal `execEnvyExecFile` and `execEnvySpawn` helpers; branch on `options.stdin` to choose between `execFile` and `spawn`; in the spawn path, write `options.stdin` to `child.stdin` and call `child.stdin.end()`; attach `'data'` listeners on stdout/stderr; resolve to the existing `CliResult` shape (`{ stdout, stderr, exitCode }`); map spawn `ENOENT` to `CliNotFoundError`; preserve the existing 4 call sites' behaviour
- [x] T002 Add concurrency primitives to `src/extension.ts` at module-level (next to the existing `cliAvailable` flag at `src/extension.ts:12`): `let inFlight: Promise<void> | undefined;` — define `function guardCrypto(): boolean` that returns `false` and shows `vscode.window.showInformationMessage('Envy: operation in progress')` when `inFlight !== undefined`; define `function trackCrypto<T>(p: Promise<T>): Promise<T>` that wraps `p` with `.then(() => undefined, () => undefined)` to set `inFlight` and a `.finally(() => { inFlight = undefined; })` to clear it; do NOT export these — they are private to `src/extension.ts`

**Checkpoint**: `npm run compile` must succeed with zero errors after T001/T002. All 4 existing `execEnvy` call sites must still work unchanged. The 9 existing command registrations must still register and behave correctly when invoked. No behavior change is observable to the user at this point.

---

## Phase 3: User Story 1 — Seal the Vault from the Editor (Priority: P1) 🎯 MVP

**Goal**: A developer runs "Envy: Encrypt (Seal)", enters their passphrase in a single obscured input box, and the vault is sealed. A success/error toast appears; the status bar and tree view refresh on success. No integrated terminal opens. The passphrase never appears in argv (`ps`, `/proc/<pid>/cmdline`).

**Independent Test**: Open a workspace with an initialized vault that has at least one modified secret. Run "Envy: Encrypt (Seal)". Enter a correct passphrase in the obscured input. Verify a "Vault sealed." success toast appears, the status bar flips to "In Sync" within 2 seconds, no terminal opens, and `ps -ef` does NOT show the passphrase in any process's command line. Repeat with an incorrect passphrase — verify a clear error toast and the vault is unchanged.

- [x] T003 [US1] Rewrite `src/commands/encrypt.ts` to remove the integrated-terminal handoff: delete the module-level `envyTerminal` reference and the `vscode.window.createTerminal(...)` / `envyTerminal.sendText('envy encrypt', true)` calls; in the `handler(refresh)` function, call `vscode.window.showInputBox({ prompt: 'Envy passphrase', password: true, ignoreFocusOut: true, validateInput: v => v.length === 0 ? 'Passphrase cannot be empty' : undefined })`; if the result is `undefined` (Escape), return cleanly; if non-empty, call `const result = await execEnvy(['encrypt'], cwd, { env: { ...process.env, ENVY_PASSPHRASE: pw } })`; on `result.exitCode === 0` show `vscode.window.showInformationMessage('Vault sealed.')` and call the existing `refresh` callback; on non-zero exit show `vscode.window.showErrorMessage(result.stderr.trim() || 'Encryption failed.')` and do NOT call `refresh`; do NOT write anything to the Output Channel; do NOT store `pw` beyond the end of the handler
- [x] T004 [US1] In `src/extension.ts`, modify the `envy-vscode.encrypt` command registration to wrap the handler with the inFlight mutex: change the body to check `if (!requireCli()) { return; }` then `if (!guardCrypto()) { return; }` then resolve `cwd` then `await trackCrypto(encryptHandler(() => cwd !== undefined ? refreshStatusBar(statusBarItem, cwd) : Promise.resolve()));` then call the existing `await refreshTree()` (per 002 US4 wiring at `src/extension.ts:72`); this replaces the existing registration at `src/extension.ts:85-92`
- [x] T005 [US1] Manual F5 test (deferred to reviewer): run `quickstart.md` Scenarios 1 (Seal — correct passphrase) and the negative half of Scenario 1 (incorrect passphrase); verify success toast, status bar flip, no terminal, `ps` clean — **accepted as deferred; reviewer F5 pass was attempted in branch 003, partial validation done — see commit message for findings (encrypt-with-wrong-passphrase is a CLI key-rotation feature, not a bug)**

**Checkpoint**: US1 fully functional and independently testable. "Envy: Encrypt (Seal)" runs headless with passphrase-via-env-var, surfaces success/error via toast, refreshes status bar + tree on success, and bails out (with toast) if invoked while another crypto command is in flight.

---

## Phase 4: User Story 2 — Restore Secrets from a Sealed Artifact (Priority: P1)

**Goal**: A developer pulls a repository and runs "Envy: Decrypt", enters their passphrase, and the vault is restored. Success/error feedback is shown via toast; status bar and tree view update automatically.

**Independent Test**: Start with an `envy.enc` artifact in the workspace and an empty local vault. Run "Envy: Decrypt", provide the correct passphrase. Verify a "Vault restored." success toast, the tree view populates with the expected keys, and the status bar shows "In Sync" within 2 seconds. Repeat with a wrong passphrase — verify a clear error toast with no vault mutation.

- [x] T006 [US2] Rewrite `src/commands/decrypt.ts` to mirror the `encrypt.ts` pattern: delete the integrated-terminal handoff and module-level `envyTerminal` reference; in `handler(refresh)`, show the same obscured passphrase `showInputBox`; on a non-empty passphrase, call `const result = await execEnvy(['decrypt'], cwd, { env: { ...process.env, ENVY_PASSPHRASE: pw } })`; on `result.exitCode === 0` show `vscode.window.showInformationMessage('Vault restored.')` and call the existing `refresh` callback; on non-zero exit show `vscode.window.showErrorMessage(result.stderr.trim() || 'Decryption failed.')` and do NOT call `refresh`; do NOT write anything to the Output Channel; do NOT store `pw` beyond the end of the handler
- [x] T007 [US2] In `src/extension.ts`, modify the `envy-vscode.decrypt` command registration to wrap the handler with the inFlight mutex: same shape as the encrypt registration (T004) but calling `decryptHandler(...)` instead of `encryptHandler(...)`; replaces the existing registration at `src/extension.ts:93-100`
- [x] T008 [US2] Manual F5 test (deferred to reviewer): run `quickstart.md` Scenario 2 — **accepted as deferred**

**Checkpoint**: US2 fully functional and independently testable. "Envy: Decrypt" runs headless, surfaces success/error via toast, refreshes status bar + tree on success, and respects the inFlight mutex.

---

## Phase 5: User Story 3 — Review Pending Changes Without a Terminal (Priority: P1)

**Goal**: A developer runs "Envy: Show Diff", enters their passphrase, and the diff is rendered in the existing "Envy" Output Channel. No terminal opens; success or failure is signaled via toast.

**Independent Test**: Make a change to one secret. Run "Envy: Show Diff", enter the passphrase. Verify the "Envy" Output Channel opens and shows a diff for that secret, and a "Diff complete." success toast appears. Repeat with an empty diff (vault already in sync) — verify the "no differences" indicator.

- [x] T009 [US3] Rewrite `src/commands/showDiff.ts` to mirror the encrypt/decrypt pattern: delete the integrated-terminal handoff and module-level `envyTerminal` reference; in `handler(outputChannel, cwd)`, show the same obscured passphrase `showInputBox`; on a non-empty passphrase, call `const result = await execEnvy(['diff'], cwd, { env: { ...process.env, ENVY_PASSPHRASE: pw } })`; always write `result.stdout` to `outputChannel` (the diff contains secret values, but this is the existing 001 surface and the diff is gated by the user-entered passphrase — per FR-015 + the "Output Channel security note" in `contracts/commands.md`); on `result.exitCode === 0` show `vscode.window.showInformationMessage('Diff complete.')` and call `outputChannel.show()`; on non-zero exit show `vscode.window.showErrorMessage(result.stderr.trim() || 'Diff failed.')` and also call `outputChannel.show()` so the user sees the error
- [x] T010 [US3] In `src/extension.ts`, modify the `envy-vscode.showDiff` command registration to wrap the handler with the inFlight mutex: same shape as encrypt (T004) and decrypt (T007), but calling `showDiffHandler(outputChannel, cwd)`; replaces the existing registration at `src/extension.ts:80-84`
- [x] T011 [US3] Manual F5 test (deferred to reviewer): run `quickstart.md` Scenario 3 (with diff present) and the empty-diff variant — **accepted as deferred**

**Checkpoint**: US3 fully functional and independently testable. "Envy: Show Diff" runs headless, writes diff to Output Channel, surfaces success/error via toast, and respects the inFlight mutex.

---

## Phase 6: User Story 4 — Store and Edit Secrets Without Leaking the Value (Priority: P2)

**Goal**: A developer runs "Envy: Set Secret", enters a key, then a value into an obscured input. The value is never visible in the extension's process arguments or `ps` output during the few-millisecond process lifetime. A success toast confirms the write; the tree view and status bar update.

**Independent Test**: Run "Envy: Set Secret", enter a key and a known-marker value (e.g., `super-secret-marker-12345`). While the operation is running, sample `ps -ef` and verify the marker value never appears in argv. After completion, verify the value is in the vault.

- [x] T012 [US4] Modify `src/commands/setSecret.ts`: change the `execEnvy(['set', `${key}=${value}`], cwd)` call at the bottom of the handler to `execEnvy(['set', '--stdin', key], cwd, { stdin: value })` per the `ExecOptions` contract added in T001; the value is now piped to the child's stdin by `cli.ts`'s spawn path and never appears in argv; preserve all other behavior in the handler (key input, value input with `password: true`, success toast, error toast, refresh callback); do NOT write the value or key to the Output Channel on error; the existing `outputChannel.appendLine(result.stderr || 'envy set failed.')` line is preserved because `result.stderr` from the CLI does not contain the value
- [x] T013 [US4] Manual F5 test (deferred to reviewer): run `quickstart.md` Scenario 4 (`ps -ef` cleanliness, success toast, tree view update) and the tree-view-edit-icon variant of Scenario 4 (where the key is pre-populated by the existing 002 `editSecret` action) — **accepted as deferred**

**Checkpoint**: US4 fully functional. "Envy: Set Secret" writes through stdin; the value never appears in argv. The existing Command Palette flow and the tree-view edit icon flow both work.

---

## Phase 7: User Story 5 — Trust the Status Bar Indicator (Priority: P3)

**Goal**: The status bar derives its state from `envy status --format json` (structurally parsed, no text-table heuristic) and refreshes automatically after every write op. The tooltip aggregates across environments as `"{N} environments, {M} secrets total, last modified {RELATIVE_TIME}"`; when all timestamps are `null` (envs with 0 secrets) the tooltip falls back to `"last modified never"`.

**Independent Test**: In a vault with modified secrets, verify the status bar shows "Envy: Modified". Hover — verify the tooltip aggregates. Run a seal (US1) and verify the indicator flips to "In Sync" within 2 seconds. Open a folder with no `envy.toml` — verify "Not Initialized" (detected via exit-code + stderr, NOT via JSON parse). Open a folder with no secrets in a single env — verify the new "no secrets in <env>" stderr pattern is handled by the tree view (covered in Polish phase T017).

- [x] T014 [US5] Rewrite `src/statusBar.ts`: delete the `extractStatusColumns` function entirely (the text-table parser); add `interface StatusPayload { environments: Array<{ name: string; secret_count: number; last_modified_at: string | null; status: 'in_sync' | 'modified' | 'never_sealed' }>; artifact: { found: boolean; path: string; last_modified_at: string | null; environments: string[] } }`; add `function isStatusPayload(x: unknown): x is StatusPayload` that validates the shape; add `function parseStatusJson(text: string): StatusPayload` that wraps `vscode.JSON.parse(text)` and throws if `isStatusPayload(parsed) === false`; add `function reduceToState(envs: StatusPayload['environments']): 'InSync' | 'Modified' | 'NeverSealed' | 'Error'` that uses strict equality against the **lowercase snake_case** strings (`status === 'modified'` wins over `status === 'never_sealed'` wins over `status === 'in_sync'`; unknown status values fall through to `'in_sync'` defensively); add `function buildTooltip(payload: StatusPayload): string` that filters out `null` `last_modified_at` entries, sorts the remaining ISO-8601 strings, picks the most recent, formats it via `relativeTime()`, and returns the aggregated text (with the literal string `"never"` when all entries are `null` or `payload.environments` is empty); add `function relativeTime(iso: string): string` returning `"just now"` / `"X minutes ago"` / `"X hours ago"` / `"X days ago"` / `"X weeks ago"` based on `Date.now()` arithmetic; rewrite `refreshStatusBar(item, cwd)` to call `execEnvy(['status', '--format', 'json'], cwd)` (replacing the old `['status']`), set `item.text = '$(sync~spin) Envy'` immediately, on `CliNotFoundError` set the `'CliNotFound'` state, on exit ≠ 0 with stderr matching `/not an envy project|envy init/i` set the `'NotInitialized'` state (the JSON is NOT written in this case — the check is exit-code + stderr based), on exit 0 with valid JSON reduce to one of the 3 success states, on any other failure set the `'Error'` state; export `parseStatusJson`, `buildTooltip`, `relativeTime` (for the unit test in T018)
- [x] T015 [US5] Verify `src/extension.ts:71, 77, 89, 99, 105, 127` continue to call `refreshStatusBar(statusBarItem, cwd)` — the call sites are unchanged because the new `refreshStatusBar` keeps the same `(item, cwd)` signature; confirm by reading the file (no code change expected — the rewrite of `statusBar.ts` preserves the public API)
- [x] T016 [US5] Manual F5 test (deferred to reviewer): run `quickstart.md` Scenarios 5 (Modified → In Sync), 6 (Not Initialized), 7 (CLI Not Found), 12 (null last_modified_at), 13 (no envy.toml) — **accepted as deferred**

**Checkpoint**: US5 fully functional. Status bar derives state from JSON (no text-table parsing), tooltip aggregates across environments, refreshes automatically after every write op, and surfaces CLI / JSON / not-initialized error states without crashing.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting fixes (FR-020 tree view regex bug), automated unit tests for the new pure functions, and the deferred F5 reviewer pass.

- [x] T017 [P] Fix `src/treeView.ts:55`: change the `isEmptyEnvironment` regex from `/environment.+not found/i` to `/no secrets in|record not found/i` per FR-020. Both `envy list -e <env>` stderr patterns now match: `(no secrets in <env>)` (empty vault) and `error: database error: record not found` (missing env). Both route to the `empty` tree-view state. The `not initialized` state remains gated on the existing `/manifest|envy\.toml|not initialized/i` pattern at `src/treeView.ts:62` — that pattern is correct for the `envy list` error on an uninitialized workspace and is NOT changed
- [x] T018 [P] Add `src/test/statusBar.test.ts`: Mocha test suite that exercises the pure functions exported from `src/statusBar.ts` (per T014). Test cases: (1) `parseStatusJson` returns the parsed object on a valid payload with all 3 status enum values; (2) `parseStatusJson` throws on malformed JSON; (3) `parseStatusJson` throws when `isStatusPayload` rejects (e.g., `environments` is not an array, or an element lacks `name`); (4) `parseStatusJson` accepts `null` `last_modified_at` and does not throw; (5) `buildTooltip` returns the expected aggregated string for a payload with 3 envs and a most-recent timestamp; (6) `buildTooltip` returns `"last modified never"` when all entries have `null` `last_modified_at`; (7) `buildTooltip` returns `"last modified never"` when `environments` is empty; (8) `relativeTime` returns the correct tense for a known recent timestamp and for a known 3-day-old timestamp. These tests catch the PascalCase-vs-snake_case regression and the null-timestamp edge case
- [x] T019 [P] Update `src/test/extension.test.ts`: confirm the existing test at line 20 ("All Envy commands are registered") still passes — no edit expected because no new command IDs are added in 003. If a future change adds a new command, append it to the `envyCommands` array. For 003, the existing 9 commands remain registered and no change is needed
- [x] T020 [P] Update `AGENTS.md` (auto-generated by `update-agent-context.sh` after implementation): add `003-extension-polish` row in `Recent Changes`; the `Active Technologies` block is already updated (it was generated when the plan was written) — no manual edit expected. Re-run `bash .specify/scripts/bash/update-agent-context.sh opencode` if needed to refresh
- [x] T021 Manual F5 reviewer pass (deferred to reviewer): open a workspace with an initialized envy v0.2.7+ vault and run all 13 scenarios from `quickstart.md` end-to-end: Scenarios 1–4 (P1 crypto + P2 stdin set), Scenarios 5–7 + 12–13 (P3 status bar), Scenarios 8–9 (concurrency), Scenarios 10 (security), Scenario 11 (tree view empty-env fix). Capture screenshots of success toasts and the aggregated tooltip for the spec archive — **accepted as deferred; F5 coverage documented as future work in commit message**
- [x] T022 Run `npm run compile` from the repository root: resolve any TypeScript strict-mode errors across `src/cli.ts`, `src/statusBar.ts`, `src/commands/{setSecret,encrypt,decrypt,showDiff}.ts`, `src/extension.ts`, `src/treeView.ts`, and the new `src/test/statusBar.test.ts`; confirm zero webpack errors
- [x] T023 Run `npm run lint` from the repository root: fix all ESLint issues across the same files; the project's `eslint.config.mjs` is strict
- [x] T024 Run `npm test` from the repository root: confirm all Mocha tests pass, including the new `statusBar.test.ts` and the unchanged `extension.test.ts`; the existing test scaffolding from 001/002 should work without changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No tasks.
- **Phase 2 (Foundational)**: No dependencies — start immediately. **BLOCKS all user story phases.**
- **Phase 3 (US1)**: Depends on Phase 2 (T001 + T002) — needs `ExecOptions` and `inFlight` in place.
- **Phase 4 (US2)**: Depends on Phase 2 (T001 + T002) — same as US1.
- **Phase 5 (US3)**: Depends on Phase 2 (T001 + T002) — same as US1.
- **Phase 6 (US4)**: Depends on T001 only — needs `ExecOptions.stdin`; does NOT need T002 (no inFlight for set).
- **Phase 7 (US5)**: Depends on T001 only — needs `ExecOptions` so the status bar can call `execEnvy` (which it already does, unchanged); does NOT need T002 (no inFlight for status bar). T015 is a read-only verification, not a real dependency.
- **Phase 8 (Polish)**: Depends on all user story phases complete (T017 in particular requires the tree view's `getChildren()` to keep compiling).

### User Story Dependencies

- **US1 (P1, Seal)**: Depends on Phase 2 only. No story dependencies.
- **US2 (P1, Restore)**: Depends on Phase 2 only. No story dependencies. Can run in parallel with US1 (different files).
- **US3 (P1, Diff)**: Depends on Phase 2 only. No story dependencies. Can run in parallel with US1 and US2 (different files).
- **US4 (P2, Secure Set)**: Depends on T001 only. Can start before US1/US2/US3 are done. No story dependencies.
- **US5 (P3, JSON Status Bar)**: Depends on T001 only. Can start before US1/US2/US3 are done. No story dependencies.

### Within Each User Story

- The crypto command rewrite (T003 / T006 / T009) must complete before the inFlight wiring (T004 / T007 / T010) — the wiring references the handler function.
- Source changes complete before the manual F5 test task (T005 / T008 / T011 / T013 / T016 — all deferred to reviewer).
- US5: T014 (rewrite statusBar.ts) must complete before T018 (unit test that imports the new exports).

### Parallel Opportunities

- After Phase 2 completes, **US1, US2, US3, US4, US5 can all run in parallel** — they touch different files.
- US1 / US2 / US3 are very similar in shape (rewriting `commands/{encrypt,decrypt,showDiff}.ts` and wiring inFlight in `extension.ts`). An LLM agent could implement all three in one pass by parallelizing the three command-file rewrites, then doing the three inFlight wirings as a single edit block.
- US4 (T012) and US5 (T014) can start as soon as T001 completes — they don't need T002.
- Polish-phase tasks T017, T018, T019, T020 are all marked [P] — they touch different files (`treeView.ts`, new test file, `extension.test.ts`, `AGENTS.md`).
- The 13 manual F5 scenarios in `quickstart.md` are all deferred to a single reviewer pass (T021) — not split into 13 separate tasks.

---

## Parallel Example: After Phase 2 (US1 + US2 + US3 in parallel)

```text
# Phase 2 (T001 + T002) is complete. These can start simultaneously:

Worker A — US1 (Seal):
  T003 → T004 → T005  (deferred)

Worker B — US2 (Restore):
  T006 → T007 → T008  (deferred)

Worker C — US3 (Diff):
  T009 → T010 → T011  (deferred)

Worker D — US4 (Secure Set, depends only on T001):
  T012 → T013  (deferred)

Worker E — US5 (JSON Status Bar, depends only on T001):
  T014 → T015 (read-only) → T016  (deferred)

# Worker D and Worker E can also start before Phase 2's T002 completes
# (their tasks only depend on T001).
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 2: Foundational (T001 + T002)
2. Complete Phase 3: US1 (T003 → T004 → T005)
3. **STOP and VALIDATE**: "Envy: Encrypt (Seal)" works end-to-end with passphrase prompt, success toast, status bar refresh, no terminal, `ps` clean
4. Ship the MVP — the headless encrypt workflow alone is the biggest single UX improvement

### Incremental Delivery

1. Phase 2 → Phase 3 (US1) → MVP shipped
2. Phase 4 (US2): add headless decrypt — symmetric workflow complete
3. Phase 5 (US3): add headless diff — the pre-commit safety check joins the editor
4. Phase 6 (US4): secure set via stdin — security regression closed
5. Phase 7 (US5): JSON status bar — the always-on indicator becomes reliable
6. Phase 8: Polish (FR-020 tree view fix, unit tests, F5 reviewer pass, compile/lint/test) — ship

### Parallel Team Strategy

With multiple LLM agents or developers:

1. Agent 1: Phase 2 (T001, T002) — sequential
2. Once Phase 2 is done:
   - Agent 1: US1 (Seal)
   - Agent 2: US2 (Restore)
   - Agent 3: US3 (Diff)
   - Agent 4: US4 (Secure Set — can start earlier, only needs T001)
   - Agent 5: US5 (JSON Status Bar — can start earlier, only needs T001)
3. Phase 8: any agent (or the merge step) handles Polish

---

## Notes

- **`child_process` stays exclusively in `src/cli.ts`**: T001 adds the `spawn` import alongside the existing `execFile` import; no other file imports `child_process`.
- **Passphrases via env, values via stdin**: the passphrase env var (`ENVY_PASSPHRASE`) is added to the `env` object passed to `execEnvy`, never to argv. The secret value is written to the child's stdin via `{ stdin: value }`, never to argv. The child process inherits only the additions to `process.env` (built explicitly as `{ ...process.env, ENVY_PASSPHRASE: pw }`).
- **Wire-format `status` is lowercase_snake_case**: the CLI emits `"in_sync" | "modified" | "never_sealed"`. The status bar's priority reduction uses strict equality against these strings. Display labels (e.g., `Envy: In Sync`) remain title-case for human readability. The T018 unit test locks this in.
- **Null `last_modified_at` is valid**: an env with 0 secrets emits `"last_modified_at": null`. `buildTooltip` filters `null` entries and falls back to the literal string `"never"` when every entry is `null` (or `environments` is empty). The T018 unit test locks this in.
- **NotInitialized detection is exit-code + stderr based, NOT JSON-parse based**: the CLI does not write JSON when no `envy.toml` is present. The status bar must reach the `NotInitialized` state via `result.exitCode !== 0` + `stderr.match(/not an envy project|envy init/i)`, never via a JSON parse.
- **All 9 existing command IDs are preserved**: the `package.json` `contributes.commands` block is unchanged. The existing test in `src/test/extension.test.ts:20` continues to pass without modification.
- **No new `package.json` dependencies**: `vscode.JSON.parse` is built into the `vscode` module; `Date.now()` is built into the JS runtime; `child_process.spawn` is built into Node.js.
- **All 5 manual F5 tests in the user-story phases (T005, T008, T011, T013, T016) and the consolidated reviewer pass (T021) are deferred to the reviewer** per the user's explicit input. The implementation tasks (T003, T004, T006, T007, T009, T010, T012, T014) are LLM-actionable without a reviewer.
- **Total task count**: 24 tasks (T001–T024). Manual F5 tests are intentionally collapsed into per-story T005/T008/T011/T013/T016 + the consolidated T021, not expanded into 13+ per-scenario tasks.
- **Estimated parallelization**: 5 user stories can be worked in parallel after T001; US1/US2/US3 also need T002. US4 and US5 are unblocked after T001 only.
