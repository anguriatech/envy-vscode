# Feature Specification: Envy Extension Polish — Headless Crypto, JSON Status, Secure Set

**Feature Branch**: `003-extension-polish`  
**Created**: 2026-06-10  
**Status**: Draft  
**Input**: User description: "Complete the envy VS Code extension (specs/003-extension-polish) to be fully functional and useful as a graphical interface for managing encrypted secrets with the local-first `envy` CLI. ... The 003 spec must close three concrete UX gaps ... 1) encrypt/decrypt/diff require a passphrase and run in the integrated terminal — collect the passphrase in an obscured input box, pass it via env var, capture exit code, show success/error toast, and refresh status bar + tree on success. 2) status bar parses pipe-delimited `envy status` output — switch to `envy status --format json` and derive state from JSON. 3) `envy set` exposes the secret value in argv — switch to `envy set --stdin KEY` with the value piped via stdin so it never appears in argv."

## Context

The Envy VS Code extension already exposes 9 commands, an "Envy Secrets" Explorer panel, a sync status bar item, and a "Copy / Edit / Refresh" tree action set (see `specs/001-vscode-extension-mvp` and `specs/002-tree-view`). After those two features shipped, three concrete UX gaps remain that block the extension from being usable as a "fully functional" graphical interface for the `envy` CLI.

1. The three operations that need a passphrase (`envy encrypt`, `envy decrypt`, `envy diff`) are implemented as integrated-terminal handoffs. The user must type the passphrase by hand in the terminal, the extension never sees the exit code, and the status bar is refreshed with a blind 3-second timer that frequently desyncs. The CLI v0.2.6+ now accepts `ENVY_PASSPHRASE` and `ENVY_PASSPHRASE_<ENV>` environment variables, which makes the operations fully scriptable.

2. The status bar parses the `envy status` table by splitting rows on `|` and matching the last column. This breaks whenever the CLI changes its table layout (whitespace, column order, decoration). The CLI v0.2.0+ ships `envy status --format json` whose payload is structurally stable.

3. `envy set` is invoked with the secret value baked into argv (`envy set KEY=VALUE`), which makes the plaintext value visible in `/proc/<pid>/cmdline` and `ps aux` for the few-millisecond process lifetime. The CLI v0.2.7+ adds `envy set --stdin KEY` that reads the value from stdin so it never touches argv.

This feature closes all three gaps in a single shippable slice so the extension becomes a "fully functional" graphical interface for envy — no terminal handoffs, no plaintext in process listings, and a structurally-stable status indicator.

**Architecture Constraints** (preserved from the existing extension):
- `src/cli.ts` is the only module allowed to import `child_process`. All higher layers go through `execEnvy()`.
- Passphrases and secret values must never be written to the Output Channel, logs, telemetry, or any persistent storage.
- The status bar and tree view refresh after every successful write op (init, set, encrypt, decrypt).
- The passphrase input box must use `password: true` (obscured).
- All 9 currently-registered command IDs (`envy-vscode.initVault`, `envy-vscode.setSecret`, `envy-vscode.showDiff`, `envy-vscode.encrypt`, `envy-vscode.decrypt`, `envy-vscode.refreshStatus`, `envy-vscode.copyKeyName`, `envy-vscode.editSecret`, `envy-vscode.refreshTreeView`) must keep their IDs to avoid breaking user keybindings and `when` clauses.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Seal the Vault from the Editor (Priority: P1)

A developer has finished editing secrets and is ready to commit `envy.enc`. They open the Command Palette, run "Envy: Encrypt (Seal)", enter their passphrase into a single obscured input box, and the vault is sealed. A confirmation toast appears; the status bar and "Envy Secrets" tree view both update to the new state. The developer never opens a terminal and never waits on a blind timer.

**Why this priority**: This is the primary "close-the-loop" write operation. Without it, every seal still requires leaving the editor and re-focusing on a terminal, which is the central reason the extension is not yet "fully functional". The same UX pattern (passphrase prompt → headless exec → toast → refresh) is the basis for User Story 2 (decrypt) and User Story 3 (diff).

**Independent Test**: Open an initialized workspace with at least one modified secret. Run "Envy: Encrypt (Seal)". Provide a correct passphrase in the obscured input. Verify a success toast appears, the status bar flips to "In Sync" within 2 seconds, and the Output Channel is not used. Repeat with an incorrect passphrase and verify a clear error toast appears with no vault mutation.

**Acceptance Scenarios**:

1. **Given** an initialized vault with modified secrets, **When** the developer runs "Envy: Encrypt (Seal)", **Then** a single obscured passphrase input box appears and is the only UI interaction required.
2. **Given** the passphrase input box is shown, **When** the developer types a passphrase and confirms, **Then** the extension runs the seal operation silently (no terminal opens) and shows a success toast on completion.
3. **Given** the seal operation succeeds, **When** the toast appears, **Then** the status bar and "Envy Secrets" tree view both reflect the new state without manual refresh.
4. **Given** the developer enters an incorrect passphrase, **When** the CLI rejects it, **Then** the developer sees a clear error toast (e.g., "Encryption failed: wrong passphrase") and the vault is unchanged.
5. **Given** the developer dismisses the passphrase input box with Escape, **When** the cancellation occurs, **Then** no operation is started and the vault is unchanged.
6. **Given** a seal has just succeeded, **When** the developer inspects their shell history and `ps` output, **Then** the passphrase appears in neither location.

---

### User Story 2 — Restore Secrets from a Sealed Artifact (Priority: P1)

A developer pulls a repository and needs to populate their local vault from the existing `envy.enc`. They run "Envy: Decrypt", enter their passphrase, and the vault is restored. Success/failure feedback is shown via toast; the status bar and tree view update automatically.

**Why this priority**: Decryption is the symmetric counterpart to sealing and the entry point for every new contributor joining a project. It must offer the same headless, toasts-and-refresh UX as sealing — same P1 priority, treated together with User Story 1 as the "headless crypto" capability.

**Independent Test**: Start with an `envy.enc` artifact in the workspace and an empty local vault. Run "Envy: Decrypt", provide the correct passphrase. Verify a success toast, the tree view populates with the expected keys, and the status bar shows "In Sync". Repeat with a wrong passphrase and verify a clear error toast with no vault mutation.

**Acceptance Scenarios**:

1. **Given** an `envy.enc` artifact exists, **When** the developer runs "Envy: Decrypt", **Then** a single obscured passphrase input box appears and is the only UI interaction required.
2. **Given** the passphrase is entered correctly, **When** the operation completes, **Then** a success toast appears, the tree view loads the restored keys, and the status bar updates to "In Sync".
3. **Given** the passphrase is incorrect, **When** the CLI rejects it, **Then** an error toast appears with a human-readable message and the vault is unchanged.
4. **Given** no `envy.enc` exists in the workspace, **When** the developer runs "Envy: Decrypt", **Then** an error toast appears stating that no sealed artifact was found.
5. **Given** the developer dismisses the passphrase input box with Escape, **When** the cancellation occurs, **Then** no operation is started.

---

### User Story 3 — Review Pending Changes Without a Terminal (Priority: P1)

A developer is about to commit a modified `envy.enc` and wants to verify what will change. They run "Envy: Show Diff", enter their passphrase, and the diff is rendered in the existing "Envy" Output Channel. No terminal opens; success or failure is signaled via toast.

**Why this priority**: The diff is the safety check that gates the seal operation. As long as it requires leaving the editor, the GitOps workflow remains split between editor and terminal, which is exactly what this feature is meant to eliminate. Treated as P1 alongside encrypt and decrypt because all three form the "headless crypto" capability.

**Independent Test**: Make a change to one secret. Run "Envy: Show Diff", enter the passphrase. Verify the "Envy" Output Channel opens and shows a diff for that secret, and a success toast appears. Repeat with an empty diff (vault already in sync) and verify a "no differences" indicator.

**Acceptance Scenarios**:

1. **Given** the vault has unsaved changes relative to the artifact, **When** the developer runs "Envy: Show Diff", **Then** a single obscured passphrase input box appears and is the only UI interaction required.
2. **Given** the passphrase is correct, **When** the diff is produced, **Then** the "Envy" Output Channel shows the diff and a success toast confirms completion — no terminal opens.
3. **Given** the vault and artifact are already in sync, **When** the developer runs "Envy: Show Diff", **Then** the Output Channel shows the CLI's "no differences" output and a success toast appears.
4. **Given** the passphrase is incorrect, **When** the CLI rejects it, **Then** an error toast appears and the Output Channel surfaces the error.
5. **Given** the developer dismisses the passphrase input box with Escape, **When** the cancellation occurs, **Then** no operation is started and no Output Channel output is generated.

---

### User Story 4 — Store and Edit Secrets Without Leaking the Value (Priority: P2)

A developer runs "Envy: Set Secret", enters a key, then a value into an obscured input. The value is never visible in the extension's process arguments or `ps` output during the write — only the key and the operation are visible. A success toast confirms the write; the tree view and status bar update.

**Why this priority**: This is a security regression guard. Today the secret value is passed in argv (`envy set KEY=VALUE`), so a `ps aux` snapshot during the few-millisecond process lifetime exposes the plaintext. The CLI's new `envy set --stdin KEY` mode eliminates that window. While the existing value-obscured input is preserved (FR-008 from 001), the value's argv exposure is a P2 security issue that becomes more important as users adopt the extension for real secrets.

**Independent Test**: Run "Envy: Set Secret", enter a key and a known-marker value. While the operation is running, sample `ps -ef` (or `/proc/<pid>/cmdline` on Linux). Verify the marker value never appears in argv. After completion, verify the value is in the vault (e.g., by decrypting with the correct passphrase).

**Acceptance Scenarios**:

1. **Given** an initialized vault, **When** the developer runs "Envy: Set Secret" and provides a key and a value, **Then** the value is supplied to the CLI through stdin rather than argv.
2. **Given** the value is being written, **When** the process arguments are inspected by another user/tool, **Then** the value never appears in the process's command line.
3. **Given** the write succeeds, **When** the toast appears, **Then** the new key appears in the "Envy Secrets" tree view and the status bar reflects the new state.
4. **Given** the write fails (e.g., invalid key name), **When** the error occurs, **Then** an error toast appears with the CLI's error message; the value is never written to the Output Channel.
5. **Given** the developer runs "Envy: Set Secret" from the "Edit" tree-view action (which pre-fills the key), **When** the existing flow opens, **Then** the same stdin-based write path is used and the same value-protection guarantees hold.

---

### User Story 5 — Trust the Status Bar Indicator (Priority: P3)

A developer glances at the bottom-right status bar item and trusts that it reflects the current vault sync state, not a stale view that the extension inferred from a fragile table-parsing heuristic. The state updates correctly after every write (init, set, encrypt, decrypt), shows the correct label for "In Sync" / "Modified" / "Never Sealed" / "Not Initialized" / "Error" / "CLI Not Found", and does not desync if the CLI's table layout changes in a future release.

**Why this priority**: Status accuracy is a daily-use concern (the user checks the indicator dozens of times per day). It is P3 because it does not block the primary write workflow (the toasts in US1–US4 already confirm the immediate write outcome) — but without it the indicator becomes a liability, which is the original "fully functional" complaint. It is lower priority than US1–US4 because the previous table-parsing implementation does work for current CLI output; it just breaks on table-layout changes.

**Independent Test**: In a vault with modified secrets, verify the status bar shows "Envy: Modified". Run a seal (using the new headless flow from US1) and verify the indicator flips to "Envy: In Sync" within 2 seconds. Initialize a fresh workspace with no `envy.toml` and verify the indicator shows "Envy: Not Initialized". Uninstall the CLI and verify the indicator shows the "CLI Not Found" state.

**Acceptance Scenarios**:

1. **Given** the workspace has an initialized vault with no changes since the last seal, **When** the status bar refreshes, **Then** it shows "Envy: In Sync".
2. **Given** the workspace has an initialized vault with unsaved changes, **When** the status bar refreshes, **Then** it shows "Envy: Modified".
3. **Given** the workspace has an initialized vault that has never been sealed, **When** the status bar refreshes, **Then** it shows "Envy: Never Sealed".
4. **Given** the workspace has no `envy.toml`, **When** the status bar refreshes, **Then** it shows "Envy: Not Initialized".
5. **Given** the `envy` CLI is not installed, **When** the status bar refreshes, **Then** it shows a "CLI Not Found" state.
6. **Given** the status bar is rendered, **When** the developer hovers the item, **Then** a tooltip shows per-environment details (environment name, secret count, last modified timestamp) drawn directly from the CLI's JSON output — no human-readable table text.
7. **Given** the status bar refresh is in progress, **When** the JSON request is outstanding, **Then** a spinner is shown in the status bar.
8. **Given** the status bar is in any state, **When** the underlying vault changes externally (e.g., the developer runs `envy` in a terminal), **Then** the status bar is not required to auto-refresh; the user can click the status bar item to force a refresh, matching the existing "click to refresh" affordance.

---

### Edge Cases

- What happens when the developer enters an empty passphrase in the encrypt/decrypt/diff input box? (Should be rejected client-side as a validation error, with a clear inline message and no CLI invocation.)
- What happens when the `envy` CLI returns malformed JSON to `envy status --format json` (e.g., a corrupted install, an older CLI in the user's PATH)? (Status bar should fall back to an "Error" state and a tooltip with a short diagnostic, not crash or show a stale state.)
- What happens when the developer runs encrypt, decrypt, or diff while another of those three is still running? (The second invocation shows an "Envy: operation in progress" notification and aborts — no queueing. Set and Init are unaffected by the mutex because they are short-lived, idempotent, and passphrase-free.)
- What happens when the developer cancels the passphrase input box mid-typing with Escape? (No CLI process starts; vault and status bar unchanged.)
- What happens when the workspace has multiple root folders, each with its own `envy.toml`? (The extension still operates on the first root folder, consistent with the existing assumption in 001; multi-root support remains out of scope.)
- What happens when the tree view's regex is updated to match the actual `envy list` stderr but the underlying CLI changes its stderr text in a future release? (The tree view falls back to the `error` state and surfaces the unrecognized stderr — same fallback as the existing 002-tree-view contract. The regex update is not a guarantee; it is a one-shot fix for the 0.2.7 stderr wording.)
- What happens when the status bar is clicked while a refresh is in flight? (The click is debounced — only one refresh is in flight at a time, no double-fetch.)
- What happens when the developer writes a secret whose value contains newlines or null bytes? (Stdin-pipe transport handles arbitrary bytes; the value never appears in argv or in any log channel.)
- What happens when the `envy set --stdin` mode is unavailable because the user has an older CLI? (Out of scope for this iteration per FR-018 — the user sees the CLI's own error message and the extension surfaces it as a toast. Future iterations may add version detection.)
- What happens when `envy status --format json` is called on a workspace with no `envy.toml`? (The CLI writes no JSON to stdout, prints `error: not an envy project (run \`envy init\` to initialize)` to stderr, and exits 1. The status bar detects the no-manifest case via exit code 1 + stderr pattern match — not via JSON parse — and transitions to `NotInitialized`.)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST collect the passphrase for `envy encrypt`, `envy decrypt`, and `envy diff` through a VS Code input box configured with `password: true` so the value is obscured as it is typed.
- **FR-002**: The passphrase input box MUST be the only UI interaction required to start these operations — no integrated terminal, no secondary dialog, no pop-out panel.
- **FR-003**: The extension MUST pass the collected passphrase to the `envy` CLI via the `ENVY_PASSPHRASE` (or `ENVY_PASSPHRASE_<ENV>`) environment variable, never via a command-line argument that would be visible in `ps`/`/proc/<pid>/cmdline`.
- **FR-004**: The extension MUST execute `envy encrypt`, `envy decrypt`, and `envy diff` as headless invocations (no integrated terminal) so the exit code is observable in the extension.
- **FR-005**: On a successful `envy encrypt`, `envy decrypt`, or `envy diff` invocation, the extension MUST show a VS Code success toast and refresh both the status bar and the "Envy Secrets" tree view to reflect the new state.
- **FR-006**: On a failed `envy encrypt`, `envy decrypt`, or `envy diff` invocation (non-zero exit code), the extension MUST show a VS Code error toast containing a human-readable summary of the failure, and MUST NOT report success.
- **FR-007**: The passphrase input box MUST be cancellable by pressing Escape; cancellation MUST NOT start a CLI process and MUST NOT modify the vault or status bar.
- **FR-008**: The passphrase input box MUST reject empty passphrases client-side (inline validation) and MUST NOT invoke the CLI with an empty passphrase.
- **FR-009**: `envy set` MUST be invoked in a mode where the secret value is supplied through stdin and never appears as a CLI argument; the command line MUST contain only the key (and any non-secret flags).
- **FR-010**: The status bar MUST derive its state from `envy status --format json`, parsing the JSON payload directly — no text-table parsing, no pipe-delimited column extraction.
- **FR-011**: The status bar MUST display the labels "Envy: In Sync", "Envy: Modified", "Envy: Never Sealed", "Envy: Not Initialized", "Envy: Error", and "Envy: CLI Not Found" corresponding to the JSON payload's per-environment `status` values and the "no manifest" / CLI-missing error conditions.
- **FR-012**: The status bar's tooltip MUST surface an aggregated summary derived from the JSON payload — specifically, the total number of environments, the total number of secrets across all environments, and the most recent last-modified timestamp formatted as a human-readable relative time (e.g., "3 environments, 17 secrets total, last modified 5 minutes ago"). When the vault is empty, not initialized, in an error state, or the CLI is not found, the tooltip MUST be the human-readable status text only (no numeric summary). Per-environment `last_modified_at` is `string | null` (null when the environment has 0 secrets); the aggregation MUST skip `null` entries, and when every entry is `null` the tooltip MUST use the phrasing `last modified never`.
- **FR-013**: The status bar MUST show a spinner while a status refresh is in flight.
- **FR-014**: The "Envy: Show Diff" command MUST continue to render the diff into the existing "Envy" Output Channel (single Output Channel shared with init/set/encrypt/decrypt).
- **FR-015**: Passphrases and secret values MUST NEVER be written to the Output Channel, logs, telemetry, exceptions, or any persistent storage under any code path.
- **FR-016**: All 9 currently-registered command IDs (`envy-vscode.initVault`, `envy-vscode.setSecret`, `envy-vscode.showDiff`, `envy-vscode.encrypt`, `envy-vscode.decrypt`, `envy-vscode.refreshStatus`, `envy-vscode.copyKeyName`, `envy-vscode.editSecret`, `envy-vscode.refreshTreeView`) MUST retain their IDs to avoid breaking user keybindings.
- **FR-017**: The architecture constraint that `src/cli.ts` is the only module allowed to import `child_process` MUST be preserved; all other modules continue to delegate through `execEnvy()`.
- **FR-018**: *(Deferred / not implemented in this iteration.)* The spec assumes the user has `envy` CLI v0.2.7+ installed. If the user's CLI is older and rejects the new flags (`--stdin`, `--format json`, `ENVY_PASSPHRASE`), the user sees the CLI's own error message — the extension does not detect or work around the CLI version. Future iterations may add version detection and graceful fallback.
- **FR-019**: The extension MUST serialize `envy encrypt`, `envy decrypt`, and `envy diff` invocations through a single in-process mutex (an `inFlight: Promise<void> | undefined` reference). When any of these three commands is invoked while another of them is already running, the extension MUST show a "Envy: operation in progress" notification and abort the second invocation (no queueing, no waiting). `envy set` and `envy init` are NOT serialized by this mutex because they are short-lived, idempotent, and do not require a passphrase.
- **FR-020**: The `envy list` empty-environment detection regex in `src/treeView.ts` (the regex used to distinguish the "no secrets in this environment" state from the "environment does not exist / not initialized" state) MUST be updated to match the actual CLI stderr text, which is `no secrets in <env>` (for the empty-vault case) or `record not found` (for the missing-env case). The pre-existing regex `/environment.+not found/i` does not match either of these and must be replaced. Both stderr patterns should route to the `empty` tree-view state; the `not initialized` state remains gated on the existing `manifest|envy\.toml|not initialized` pattern.

### Key Entities

- **Passphrase**: A string the user enters to seal, unseal, or diff the vault. Obscured in the input box. Transported to the CLI only via environment variable. Never persisted, logged, or echoed.
- **Secret Value**: A string the user enters to set or edit a secret. Obscured in the input box. Transported to the CLI only via stdin. Never persisted, logged, echoed, or exposed in argv.
- **Vault Sync Status (JSON-derived)**: The structural state of the vault relative to the sealed artifact, derived from `envy status --format json`. The CLI emits per-environment `status` values as `lowercase_snake_case` strings: `"in_sync"`, `"modified"`, or `"never_sealed"`. The extension reduces these to one of six `SyncState` values: In Sync, Modified, Never Sealed, Not Initialized, Error, CLI Not Found. Per-environment fields are: `name: string`, `secret_count: number`, `last_modified_at: string | null` (null when the environment has 0 secrets), and `status: 'in_sync' | 'modified' | 'never_sealed'`. The aggregated tooltip draws from these fields.
- **Envy Operation Result**: The composite outcome of a headless `envy` CLI invocation — exit code, stdout, stderr, and a derived success/failure flag — used by the extension to decide whether to show a success toast, an error toast, or to refresh the status bar / tree view.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can complete the full "add a secret and seal the vault" workflow (`Set Secret` → `Show Diff` → `Encrypt`) entirely within VS Code, without ever opening a terminal.
- **SC-002**: After triggering `Encrypt`, `Decrypt`, or `Show Diff`, a success or error toast appears within 3 seconds of the CLI returning (i.e., no fixed blind timer is used).
- **SC-003**: After a successful `Encrypt` or `Decrypt`, the status bar and "Envy Secrets" tree view reflect the new state within 2 seconds — without the developer clicking refresh.
- **SC-004**: The status bar correctly displays its state for 100% of supported vault configurations (In Sync, Modified, Never Sealed, Not Initialized, Error, CLI Not Found) as exercised by an integration test suite.
- **SC-005**: The status bar's reported state is provably derived from a structural parse of the `envy status --format json` payload, not from any text-table heuristic — verifiable by feeding the extension a JSON payload whose content contradicts what a naive text-table parser would infer from an equivalent table rendering, and observing that the extension reports the JSON-derived state. The tooltip aggregates across environments ("{N} environments, {M} secrets total, last modified {RELATIVE_TIME}") and does not list per-environment detail.
- **SC-006**: The plaintext secret value is never exposed to other processes on the system during a `Set Secret` invocation — verifiable by sampling the OS's process list (e.g., `ps -ef` on Unix, Task Manager on Windows) for the duration of the write; the value never appears in any process's command line, command history, or environment dump of any non-Envy process.
- **SC-007**: The plaintext passphrase is never exposed to other processes on the system during an `Encrypt`, `Decrypt`, or `Show Diff` invocation — verifiable by the same process-list sampling as SC-006.
- **SC-008**: Zero plaintext secrets or passphrases appear in the "Envy" Output Channel, in any exception text, in the status-bar tooltip, or in any error toast (verifiable by a security smoke test that greps the output channel and notification history after a synthetic run).
- **SC-009**: All 9 existing command IDs continue to be registered with their existing IDs — verifiable by inspecting `package.json` `contributes.commands` after the change.
- **SC-010**: The extension does not crash VS Code or leave it in a broken state under any of the new failure paths: malformed JSON from the CLI, older CLI without `--stdin`, older CLI without `--format json`, older CLI without `ENVY_PASSPHRASE`, mid-typing Escape, empty passphrase, concurrent command invocations.
- **SC-011**: When `Encrypt`, `Decrypt`, or `Show Diff` is invoked while another of those three is still running, the second invocation shows an "Envy: operation in progress" toast and exits without queueing — verifiable by triggering Encrypt and immediately triggering Decrypt; only one CLI process starts and the second invocation produces the toast within 1 second.

---

## Assumptions

- The user's installed `envy` CLI is at least v0.2.7 (the spec assumes the user has the latest CLI; older versions are not supported in this iteration per FR-018 being deferred).
- The passphrase is the same for seal, unseal, and diff in the default environment. The `ENVY_PASSPHRASE_<ENV>` variant is available if multi-environment passphrase support is needed in a future iteration but is not part of this spec.
- The single workspace-folder assumption from `001-vscode-extension-mvp` and `002-tree-view` continues to hold (multi-root is out of scope).
- The "Envy" Output Channel established in 001 remains the single output surface for all commands.
- The "Envy Secrets" tree view continues to use `envy list` (not JSON) — the JSON migration applies only to the status bar because that is the surface the user never sees the raw output of and the surface most likely to drift with CLI table-layout changes.
- The click-to-refresh affordance on the status bar item is preserved (no automatic file-watcher-based polling is introduced).

---

## Out of Scope

- A generic "passphrase store" / keychain integration (e.g., macOS Keychain, Windows Credential Manager, 1Password CLI). The user types the passphrase every time the vault is sealed/unsealed.
- Per-environment passphrase support in the UI (no `ENVY_PASSPHRASE_<ENV>` selection; the spec uses the default `ENVY_PASSPHRASE`).
- A `Reveal Secret Value` action in the tree view (re-confirming the decision in 002-tree-view that values are never shown).
- Migrating the tree view to JSON-based key listing (the existing line-based `envy list` output is sufficient and stable).
- File-watcher-based auto-refresh of the status bar when the vault changes externally.
- Multi-root workspace support.
- A progress indicator for long-running seal/unseal/diff operations on large vaults (the existing toasts are sufficient for the typical 1–3 second CLI runtime; long operations still complete in the background and trigger a toast on completion).
- Introducing any new dependencies in the extension's `package.json` for these changes (everything is built on the existing Node.js `child_process` + VS Code API surface).
