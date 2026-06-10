# Developer Quickstart: Envy Extension Polish

**Feature Branch**: `003-extension-polish`  
**Date**: 2026-06-10

> **Note**: Per the user's input, manual F5 tests are **deferred to the reviewer** at the end of the spec. This document lists the 10 scenarios the reviewer will run as the final acceptance step. They are NOT run during `/speckit.implement`.

---

## Prerequisites

- Node.js 22.x
- `npm install` already run (dependencies unchanged from 001/002)
- `envy` CLI v0.2.7+ on PATH
- An initialized Envy vault in a test workspace folder (run `envy init`, set at least one secret via the CLI in a terminal)
- A second workspace with an `envy.enc` artifact but empty local vault, for the decrypt scenario

---

## Files Changed / Created

| File | Change |
|------|--------|
| `src/cli.ts` | **MODIFIED** — `execEnvy` gains optional `{ stdin, env }`; spawn path for stdin |
| `src/statusBar.ts` | **REWRITTEN** — JSON-driven, 6-state model, aggregated tooltip |
| `src/commands/setSecret.ts` | **MODIFIED** — value flows through `{ stdin: value }` |
| `src/commands/encrypt.ts` | **REWRITTEN** — headless, passphrase via env var |
| `src/commands/decrypt.ts` | **REWRITTEN** — headless, passphrase via env var |
| `src/commands/showDiff.ts` | **REWRITTEN** — headless, passphrase via env var, Output Channel on success |
| `src/extension.ts` | **MODIFIED** — `inFlight` mutex, `guardCrypto`, `trackCrypto`; wraps 3 crypto commands |
| `src/treeView.ts` | **MODIFIED** — `getChildren()` empty-env detection regex updated per FR-020 |
| `package.json` | **UNCHANGED** |

---

## Manual F5 Test Scenarios (Reviewer Acceptance)

### Scenario 1: Seal the vault from the editor (P1, US1)

1. Open the workspace with an initialized vault that has at least one secret modified after the last seal.
2. Press F5 to open the Extension Development Host.
3. Open the Command Palette and run **Envy: Encrypt (Seal)**.
4. Verify a single obscured passphrase input box appears — **no terminal opens**.
5. Enter the correct passphrase and press Enter.
6. Verify a **"Vault sealed."** success toast appears.
7. Verify the status bar flips to `$(sync) Envy: In Sync` within 2 seconds.
8. Verify the "Envy Secrets" tree view is unchanged (sealing does not add/remove keys).
9. Repeat with an incorrect passphrase — verify a clear error toast appears and the vault is unchanged.

### Scenario 2: Restore the vault from a sealed artifact (P1, US2)

1. Start with an `envy.enc` artifact in the workspace and an empty local vault.
2. Run **Envy: Decrypt**.
3. Verify a single obscured passphrase input box appears — no terminal opens.
4. Enter the correct passphrase and press Enter.
5. Verify a **"Vault restored."** success toast appears.
6. Verify the "Envy Secrets" tree view populates with the expected keys.
7. Verify the status bar shows `$(sync) Envy: In Sync` within 2 seconds.
8. Repeat with a wrong passphrase — verify a clear error toast appears.

### Scenario 3: Review pending changes (P1, US3)

1. In a vault with one secret modified after the last seal, run **Envy: Show Diff**.
2. Verify a single obscured passphrase input box appears — no terminal opens.
3. Enter the correct passphrase and press Enter.
4. Verify the **"Envy" Output Channel** opens automatically and shows the diff for that secret.
5. Verify a **"Diff complete."** success toast appears.
6. Repeat after sealing (vault in sync) — verify the Output Channel shows the "no differences" output and a success toast still appears.

### Scenario 4: Set a secret without exposing the value (P2, US4)

1. Run **Envy: Set Secret**.
2. Enter a key (e.g., `MARKER_KEY`) and a value (e.g., `super-secret-marker-value-12345`).
3. **While the operation is running**, open a separate terminal and run `ps -ef | grep envy` (Unix) or inspect Task Manager (Windows). Verify the marker value does NOT appear in any process's command line.
4. Verify a **"Secret set."** success toast appears.
5. Verify the new key appears in the "Envy Secrets" tree view.
6. Verify the status bar reflects the new state (likely `$(warning) Envy: Modified`).
7. Repeat, but this time trigger the Set Secret from the **edit icon** on an existing key in the tree view — verify the key input box is pre-populated and the value still never appears in argv.

### Scenario 5: Status bar shows JSON-derived state (P3, US5)

1. With a vault in `Modified` state, verify the status bar shows `$(warning) Envy: Modified`.
2. **Hover** the status bar item — verify the tooltip shows e.g. `1 environments, 3 secrets total, last modified 5 minutes ago` (numbers/relative time will vary).
3. Run **Envy: Encrypt (Seal)** with the correct passphrase.
4. Verify the status bar flips to `$(sync) Envy: In Sync` within 2 seconds.
5. Hover again — verify the tooltip still aggregates (now showing `last modified just now`).

### Scenario 6: Status bar — Not Initialized

1. Open a folder with no `envy.toml`.
2. Verify the status bar shows `$(circle-slash) Envy: Not Initialized`.
3. Hover — verify the tooltip is the human-readable status text only: `Vault not initialized. Run 'Envy: Init Vault' to get started.` (no numeric summary).

### Scenario 7: Status bar — CLI Not Found

1. Temporarily rename the `envy` binary (e.g., `mv $(which envy) $(which envy).bak`).
2. Restart the Extension Development Host.
3. Verify the status bar shows `$(error) Envy: CLI Not Found`.
4. Hover — verify the tooltip is `Install the envy CLI to use this extension.`
5. Restore the `envy` binary and reload the window.

### Scenario 8: Concurrency — Encrypt while another Encrypt is in flight (FR-019, SC-011)

1. Run **Envy: Encrypt (Seal)**. While the passphrase input box is open (or while the operation is running), quickly trigger **Envy: Encrypt (Seal)** again from the Command Palette.
2. Verify the second invocation shows an **"Envy: operation in progress"** toast within 1 second and exits without starting a second CLI process.
3. Verify only one CLI process is running in `ps -ef` (Unix) or Task Manager (Windows) at any time.

### Scenario 9: Concurrency — Decrypt + Diff interleaved (FR-019)

1. Run **Envy: Decrypt** — quickly trigger **Envy: Show Diff** from the Command Palette before the decrypt finishes.
2. Verify the diff command shows the "operation in progress" toast and aborts.
3. After the decrypt finishes, run **Envy: Show Diff** again — verify it runs normally.

### Scenario 10: Passphrase and value are never in the Output Channel (SC-008)

1. Run all of: set, encrypt, decrypt, diff with synthetic values `PP-TEST-MARKER-12345` (passphrase) and `VAL-TEST-MARKER-67890` (value).
2. Open the **"Envy" Output Channel**.
3. Grep the channel for `PP-TEST-MARKER-12345` and `VAL-TEST-MARKER-67890`.
4. **Expected**: `VAL-TEST-MARKER-67890` may appear in the Output Channel ONLY in the context of a `Show Diff` output (which is the user-requested diff). `PP-TEST-MARKER-12345` must NEVER appear in the Output Channel under any circumstance.

### Scenario 11: Tree view — empty environment shows the welcome message (FR-020)

1. In a workspace with an initialized vault, delete all secrets from one environment via the CLI (e.g., `envy rm KEY1 KEY2 KEY3 -e staging` until `envy list -e staging` returns exit 1 with stderr `error: database error: record not found`).
2. Open the "Envy Secrets" panel.
3. Verify the panel shows the **"No secrets found in this environment. [Set a secret]…"** welcome message — NOT the "Unable to load secrets…" error state.
4. Click the **"Set a secret"** link in the welcome message — verify the Set Secret input box opens.
5. Add a secret — verify the panel transitions to the "keys" state and the new key appears.

### Scenario 12: Status bar — JSON with `null` last_modified_at (edge case)

1. In a fresh workspace, run `envy init` and then `envy set NEW_KEY=foo` (without sealing). The vault has one environment with one secret; its `last_modified_at` will be populated.
2. Hover the status bar — verify the tooltip shows e.g. `1 environments, 1 secrets total, last modified just now` (or similar relative time).
3. Delete the secret via `envy rm NEW_KEY` (without sealing). The environment now has 0 secrets and `last_modified_at` becomes `null` in the JSON.
4. Hover the status bar — verify the tooltip falls back to `1 environments, 0 secrets total, last modified never`.

### Scenario 13: Status bar — NotInitialized (no envy.toml)

1. Open a folder with no `envy.toml`.
2. Verify the status bar shows `$(circle-slash) Envy: Not Initialized` (NOT `Envy: Error`).
3. Hover — verify the tooltip is the human-readable status text: `Vault not initialized. Run 'Envy: Init Vault' to get started.`
4. The CLI does NOT write JSON in this case (verified by capturing stdout from a manual `envy status --format json` invocation in the same folder — it should be empty). The status bar must reach the `NotInitialized` state from the exit code + stderr pattern, not from a JSON parse.

---

## Running Tests

```bash
npm test        # Mocha + @vscode/test-electron
npm run lint    # ESLint strict
npm run compile # webpack — zero errors required
```

---

## Key Implementation Notes

- `cli.ts` is the only module that imports `child_process`. The `spawn` import joins `execFile` there.
- `execEnvy` is extended with an optional `options?: { stdin?, env? }` parameter. The existing 4 call sites are unchanged because they pass only `(args, cwd)`.
- The passphrase is set on the child's environment, not on argv. The child process inherits only the additions to `process.env` (`cli.ts` builds `env: { ...process.env, ENVY_PASSPHRASE: pw }`).
- The secret value is written to the child's stdin, not to argv. `cli.ts` switches to `spawn` only when `options.stdin` is set.
- The status bar's `extractStatusColumns` function (text-table parsing) is deleted. The new `parseStatusJson` uses `vscode.JSON.parse` and a structural validator.
- The `inFlight` mutex is 3 lines of state + 2 helpers in `src/extension.ts`, not in `cli.ts`. The mutex protects only the three crypto commands.
- No new `package.json` dependencies.
- The 9 existing command IDs are unchanged. Verify with: `grep -c '"command":' package.json` — should return 9.
