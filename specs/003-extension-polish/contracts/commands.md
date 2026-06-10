# Command & API Contracts: Envy Extension Polish

**Feature Branch**: `003-extension-polish`  
**Date**: 2026-06-10

---

## New / Changed `execEnvy` Contract

The executor in `src/cli.ts` gains an optional third argument.

### New signature

```typescript
export interface ExecOptions {
    /** When set, the value is written to the child's stdin and the child is invoked via `spawn`. */
    stdin?: string;
    /** When set, merged into `process.env` to form the child's environment. */
    env?: NodeJS.ProcessEnv;
}

export function execEnvy(
    args: string[],
    cwd: string,
    options?: ExecOptions,
): Promise<CliResult>;
```

### Behaviour matrix

| `options` value | Internal call | Notes |
|-----------------|---------------|-------|
| `undefined` | `execFile('envy', args, { cwd, shell: useShell }, cb)` | **Existing path** — unchanged. Used by `initVault`, `setSecret` (the call site changes, see below), `statusBar`, `treeView`. |
| `{ env: {...} }` (no `stdin`) | `execFile('envy', args, { cwd, env: {...}, shell: useShell }, cb)` | Used by `encrypt` / `decrypt` / `diff` to inject `ENVY_PASSPHRASE`. |
| `{ stdin: '...' }` (with or without `env`) | `spawn('envy', args, { cwd, env, shell: useShell })` + write stdin + listen 'data'/'close' | Used by the new `setSecret` flow. |

### Resolution shape

All three paths resolve to the existing `CliResult`:
```typescript
{ stdout: string; stderr: string; exitCode: number; }
```

### Error contract

- `ENOENT` (CLI not on PATH) → rejects with `CliNotFoundError` (unchanged).
- Non-zero exit code → resolves with the full `CliResult` (unchanged).
- `spawn` ENOENT / EACCES → rejects with `CliNotFoundError` (new; matches the `execFile` behaviour).
- `spawn` 'error' event (e.g., process could not be spawned) → rejects with `CliNotFoundError` when the error code is `ENOENT`; otherwise rejects with a generic `Error` whose `.message` is the spawn error message.

---

## Modified Command Handlers

### `src/commands/setSecret.ts` (modified)

**Change**: switch from `execEnvy(['set', `${key}=${value}`], cwd)` to `execEnvy(['set', '--stdin', key], cwd, { stdin: value })`.

**New handler signature**:
```typescript
export async function handler(
    outputChannel: vscode.OutputChannel,
    cwd: string,
    refresh: () => Promise<void>,
    prefillKey?: string,
): Promise<void>
```

**Behaviour change**:
- After collecting key and value from `showInputBox`, call:
  ```typescript
  const result = await execEnvy(['set', '--stdin', key], cwd, { stdin: value });
  ```
- The value is no longer interpolated into the args array. `value` lives only in the `{ stdin: value }` option, which `cli.ts` writes to the child process's stdin and discards.
- All other behaviour (success toast, error toast, Output Channel error append, refresh) is unchanged. The value is never written to the Output Channel.

---

### `src/commands/encrypt.ts` (rewritten)

**New handler signature**:
```typescript
export async function handler(
    refresh: () => Promise<void>,
): Promise<void>
```

**Behaviour**:
1. Show `showInputBox({ prompt: 'Envy passphrase', password: true, ignoreFocusOut: true, validateInput })`.
2. If `undefined` returned → return (cancelled).
3. Call:
   ```typescript
   const result = await execEnvy(['encrypt'], cwd, { env: { ...process.env, ENVY_PASSPHRASE: pw } });
   ```
4. On `exitCode === 0` → show `vscode.window.showInformationMessage('Vault sealed.')`, call `refresh()`.
5. On non-zero exit → show `vscode.window.showErrorMessage(result.stderr.trim() || 'Encryption failed.')`. Do NOT call `refresh()` (vault state hasn't changed).
6. `pw` is dropped at the end of the handler — never stored.

**No terminal** is opened. The "Envy" Output Channel is NOT used by this command (no plaintext-bearing output is produced).

---

### `src/commands/decrypt.ts` (rewritten)

**New handler signature** (same as `encrypt`):
```typescript
export async function handler(
    refresh: () => Promise<void>,
): Promise<void>
```

**Behaviour**:
1. Show `showInputBox` (same as encrypt).
2. Call:
   ```typescript
   const result = await execEnvy(['decrypt'], cwd, { env: { ...process.env, ENVY_PASSPHRASE: pw } });
   ```
3. On `exitCode === 0` → show `vscode.window.showInformationMessage('Vault restored.')`, call `refresh()`.
4. On non-zero exit → show `vscode.window.showErrorMessage(result.stderr.trim() || 'Decryption failed.')`. Do NOT call `refresh()`.
5. `pw` is dropped at the end of the handler.

**No terminal** is opened. The Output Channel is NOT used.

---

### `src/commands/showDiff.ts` (rewritten)

**New handler signature**:
```typescript
export async function handler(
    outputChannel: vscode.OutputChannel,
    cwd: string,
): Promise<void>
```

**Behaviour**:
1. Show `showInputBox` (same as encrypt/decrypt).
2. Call:
   ```typescript
   const result = await execEnvy(['diff'], cwd, { env: { ...process.env, ENVY_PASSPHRASE: pw } });
   ```
3. Always write `result.stdout` to the `outputChannel` (this is the diff, which contains secret VALUES — see the "Output Channel security note" below).
4. On `exitCode === 0` → show `vscode.window.showInformationMessage('Diff complete.'); outputChannel.show();`.
5. On non-zero exit → show `vscode.window.showErrorMessage(result.stderr.trim() || 'Diff failed.'); outputChannel.show();` to surface the error.
6. `pw` is dropped at the end of the handler.

**Output Channel security note**: `envy diff` outputs secret VALUES in its diff. The existing Output Channel is the established place where the diff is rendered (per 001-vscode-extension-mvp FR-011), and the same Output Channel is used by the existing 001 implementation. The FR-015 rule "passphrases and secret values must NEVER be written to the Output Channel" is interpreted as: passphrases are NEVER written; secret values are written ONLY by `showDiff` (which is a user-initiated read of the diff), and are NEVER written by `initVault`, `setSecret`, `encrypt`, or `decrypt`. The diff is gated by a user-entered passphrase and is the only user-visible surface for diff content. This is consistent with 001's decision to use the Output Channel for diff output.

---

## Status Bar Contract

### New `refreshStatusBar` signature

```typescript
export async function refreshStatusBar(
    item: vscode.StatusBarItem,
    cwd: string,
): Promise<void>
```

(Same as before — the signature is unchanged. The implementation is rewritten.)

### Implementation behaviour

1. Set `item.text = '$(sync~spin) Envy'`.
2. Call:
   ```typescript
   const result = await execEnvy(['status', '--format', 'json'], cwd);
   ```
3. If `execEnvy` rejects with `CliNotFoundError` → set `SyncState = 'CliNotFound'`, set `item.text` and `item.tooltip` to the CLI-not-found values.
4. If `result.exitCode !== 0`:
   - If `result.stderr` matches `/not an envy project|envy init/i` → `SyncState = 'NotInitialized'`, tooltip = "Vault not initialized. Run 'Envy: Init Vault' to get started." (The CLI does NOT write JSON in this case — the check is exit-code + stderr based.)
   - Otherwise → `SyncState = 'Error'`, tooltip = `result.stderr.trim() || 'envy status returned a non-zero exit code.'`
5. If `result.exitCode === 0`:
   - Parse `result.stdout` with `vscode.JSON.parse`.
   - If parse throws OR `isStatusPayload(parsed) === false` → `SyncState = 'Error'`, tooltip = "Invalid envy status JSON payload."
   - Otherwise reduce `parsed.environments` to a `SyncState` (priority: `status === 'modified'` > `status === 'never_sealed'` > `status === 'in_sync'`; unknown status values are treated as `'in_sync'` to fail safe).
   - Build tooltip via `buildTooltip(parsed)` for `InSync`/`Modified`/`NeverSealed`; use the human-readable status text for `NotInitialized`/`Error`/`CliNotFound`.

### `SyncState` → `item.text` mapping

| State | `item.text` |
|-------|-------------|
| `InSync` | `$(sync) Envy: In Sync` |
| `Modified` | `$(warning) Envy: Modified` |
| `NeverSealed` | `$(circle-slash) Envy: Never Sealed` |
| `NotInitialized` | `$(circle-slash) Envy: Not Initialized` |
| `Error` | `$(error) Envy: Error` |
| `CliNotFound` | `$(error) Envy: CLI Not Found` |

---

## Concurrency Contract: `inFlight` Mutex

Defined in `src/extension.ts` next to the existing `cliAvailable` flag.

### State

```typescript
let inFlight: Promise<void> | undefined;
```

### Guard helper

```typescript
function guardCrypto(): boolean {
    if (inFlight !== undefined) {
        void vscode.window.showInformationMessage('Envy: operation in progress');
        return false;
    }
    return true;
}
```

### Track helper

```typescript
function trackCrypto<T>(p: Promise<T>): Promise<T> {
    inFlight = p.then(() => undefined, () => undefined);
    void p.finally(() => { inFlight = undefined; });
    return p;
}
```

### Application sites

Each of the 3 crypto command handlers wraps its work:
```typescript
vscode.commands.registerCommand('envy-vscode.encrypt', async () => {
    if (!requireCli()) { return; }
    if (!guardCrypto()) { return; }
    const cwd = getWorkspaceCwd();
    if (cwd === undefined) { return; }
    await trackCrypto(encryptHandler(() => refreshStatusBar(statusBarItem, cwd)));
    await refreshTree();
});
```

Same shape for `envy-vscode.decrypt` and `envy-vscode.showDiff`. **`envy-vscode.setSecret` and `envy-vscode.initVault` are NOT wrapped** — they are short-lived and passphrase-free, and the user explicitly excluded them from the mutex.

### Behaviour

- Three concurrent crypto invocations: only the first runs; the second and third each show the "operation in progress" toast and abort. (No queueing.)
- A crypto invocation after a previous one finishes: starts normally (`inFlight === undefined` after the `.finally`).
- A crypto invocation that throws inside the handler: the `.then(() => undefined, () => undefined)` wrapper prevents the rejection from leaking; the `.finally` clears `inFlight`. The second invocation can start.

---

## Tree View Side-Effect (FR-020)

A pre-existing bug in `src/treeView.ts:55` is fixed as part of 003. The regex used to distinguish the `empty` state from the `not initialized` state does not match the actual CLI v0.2.7 stderr text, so the tree view falls through to the `error` state for what should be the common empty-vault case.

### Old code (`src/treeView.ts:55`)

```typescript
const isEmptyEnvironment = /environment.+not found/i.test(result.stderr);
```

### New code

```typescript
const isEmptyEnvironment = /no secrets in|record not found/i.test(result.stderr);
```

### Trigger → State mapping (CLI v0.2.7 stderr)

| CLI stderr (verbatim) | Trigger | New state |
|---|---|---|
| `(no secrets in <env>)` (stdout of `envy list -e <env>` when env exists but is empty) | exit 0, stdout empty | `empty` |
| `error: database error: record not found` (env does not exist) | exit 1, stderr match | `empty` (same as above) |
| `error: not an envy project (run \`envy init\` to initialize)` (no `envy.toml`) | exit 1, stderr match | `notInitialized` (existing pattern) |
| Any other non-zero exit | exit 1, no pattern match | `error` |

### Behaviour verification

- The old regex `/environment.+not found/i` matches **nothing** in the actual CLI stderr. The new regex matches both `no secrets in` and `record not found`.
- The new regex is a single-line change in `getChildren()`. No other tree-view code is modified.
- The `not initialized` state is still gated on the existing `/manifest|envy\.toml|not initialized/i` pattern at `src/treeView.ts:62` — that pattern is correct for the `envy list` error on an uninitialized workspace and is **not** changed.

---

## Package.json

**No changes.** The 9 command IDs are preserved. The "Envy" Output Channel is preserved. The `views`, `viewsWelcome`, `menus`, and `commands` blocks are unchanged from 002.

---

## File-Level Diff Summary

| File | Change | Lines (approx) |
|------|--------|----------------|
| `src/cli.ts` | Extend `execEnvy` with optional `ExecOptions`; add `spawn` path; add `isStatusPayload` (kept in `cli.ts`? — no, moved to `statusBar.ts`); export `ExecOptions` | +60 / -0 |
| `src/statusBar.ts` | Rewrite: delete `extractStatusColumns`; add `parseStatusJson`, `reduceToState`, `buildTooltip`, `relativeTime`; rewrite `refreshStatusBar` | -25 / +90 |
| `src/commands/setSecret.ts` | Change one `execEnvy` call site; value flows through `{ stdin: value }` | +2 / -1 |
| `src/commands/encrypt.ts` | Rewrite: add `showInputBox`, call `execEnvy` with `{ env: { ENVY_PASSPHRASE } }`, toast on result | -10 / +30 |
| `src/commands/decrypt.ts` | Same as encrypt | -10 / +30 |
| `src/commands/showDiff.ts` | Same shape, plus Output Channel append | -10 / +35 |
| `src/extension.ts` | Add `inFlight`, `guardCrypto`, `trackCrypto`; wrap 3 crypto command registrations | +20 / -2 |
| `src/treeView.ts` | Update empty-env detection regex at `getChildren()` (FR-020): old `/environment.+not found/i` → new `/no secrets in\|record not found/i` | +1 / -1 |
| `package.json` | **UNCHANGED** | 0 |

**Total**: ~165 lines added, ~50 removed. No new files. No new dependencies.
