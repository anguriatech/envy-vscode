# Data Model: Envy Extension Polish

**Feature Branch**: `003-extension-polish`  
**Date**: 2026-06-10

---

## Entities

### StatusPayload

The shape produced by `envy status --format json`, validated by the status bar before any field is read. The CLI emits this to **stdout**, always as a single top-level JSON object (no envelope). When the workspace has no `envy.toml`, the JSON is **not** written — stderr gets `error: not an envy project (run \`envy init\` to initialize)` and exit code is 1. The status bar's `NotInitialized` detection is based on exit code + stderr pattern, not on JSON content.

| Field | Type | Description |
|-------|------|-------------|
| `environments` | `Array<EnvironmentStatus>` | One entry per environment in the vault. Required. |
| `artifact` | `{ found: boolean; path: string; last_modified_at: string \| null; environments: string[] }` | Information about the sealed artifact. Required by the CLI; the extension does not depend on it for state determination, but the validator still type-checks it. |

### EnvironmentStatus

One element in `StatusPayload.environments`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Environment name (e.g., `"development"`, `"production"`). |
| `secret_count` | `number` | Number of secrets stored in this environment. |
| `last_modified_at` | `string \| null` | ISO 8601 UTC timestamp of the most recent modification, or `null` when the environment has 0 secrets. The aggregation MUST skip `null` entries when picking the "most recent" timestamp. |
| `status` | `'in_sync' \| 'modified' \| 'never_sealed'` | CLI-reported state, **lowercase snake_case** (NOT PascalCase). Drives the priority reduction to a `SyncState` (below). |

**Validation** (`isStatusPayload` in `statusBar.ts`): the root must be an object with an `environments` array; each element must have `name: string`, `secret_count: number`, `last_modified_at: string | null`, and `status: string`. The `status` value is not strictly constrained to the 3 known strings — any other value is treated as `InSync` to fail safe (a vault never falsely reports `Modified`). Anything that fails the shape check → `'Error'`.

---

### SyncState

Discriminated union representing the six mutually-exclusive status bar states.

| Value | Trigger | Status-bar text | Tooltip |
|-------|---------|-----------------|---------|
| `'InSync'` | All environments `status === 'in_sync'` (defensive: any unknown status value also falls here) | `$(sync) Envy: In Sync` | `"{N} environments, {M} secrets total, last modified {RELATIVE}"` |
| `'Modified'` | Any environment `status === 'modified'` | `$(warning) Envy: Modified` | Same aggregated format |
| `'NeverSealed'` | Any `status === 'never_sealed'`, no `modified` | `$(circle-slash) Envy: Never Sealed` | Same aggregated format |
| `'NotInitialized'` | CLI exit ≠ 0 AND `result.stderr` matches `/not an envy project\|envy init/i`. The JSON is not written in this case, so the check is exit-code + stderr based, not JSON-parse based. | `$(circle-slash) Envy: Not Initialized` | `"Vault not initialized. Run 'Envy: Init Vault' to get started."` |
| `'Error'` | JSON parse throws, `isStatusPayload` returns `false`, or any other CLI non-zero exit (not matched by the NotInitialized pattern) | `$(error) Envy: Error` | The `result.stderr` text or `"Invalid envy status JSON payload."` |
| `'CliNotFound'` | `execEnvy` rejected with `CliNotFoundError` | `$(error) Envy: CLI Not Found` | `"Install the envy CLI to use this extension."` |

**Priority order** (top wins during the reduce step): `Error` > `NotInitialized` > `Modified` > `NeverSealed` > `InSync` > `CliNotFound`. `CliNotFound` is the only state that does not arise from a successful JSON parse — it is set in the catch branch.

**Tooltip aggregation when all `last_modified_at` are `null`**: the tooltip text falls back to `"{N} environments, {M} secrets total, last modified never"`. The `{RELATIVE}` placeholder resolves to the string `"never"` (not `""` or a missing field) so the tooltip remains grammatically well-formed.

---

### EnvyOperationResult

The composite outcome of a headless `envy` CLI invocation through `execEnvy`.

| Field | Type | Description |
|-------|------|-------------|
| `stdout` | `string` | Captured stdout (decoded as UTF-8). |
| `stderr` | `string` | Captured stderr (decoded as UTF-8). |
| `exitCode` | `number` | Process exit code. `0` = success. Non-zero = error. |

This is identical to the existing `CliResult` shape in `src/cli.ts:3` — no change to the type. The new `execEnvy` overload (with `options?: { stdin, env }`) resolves to the same shape, so no consumer-side change is needed.

---

### OpKind

A discriminator for the `inFlight` mutex, even though the mutex holds a single `Promise<void> | undefined` rather than a per-kind map. Used only for **debug logging** and the toast text:

| Value | Command | Toast text |
|-------|---------|------------|
| `'encrypt'` | `Envy: Encrypt (Seal)` | `"Envy: operation in progress"` |
| `'decrypt'` | `Envy: Decrypt` | `"Envy: operation in progress"` |
| `'diff'` | `Envy: Show Diff` | `"Envy: operation in progress"` |

**Note**: Per the user's input, the three OpKinds are mutually exclusive against each other (a single `inFlight` mutex). `set` and `init` are intentionally NOT OpKinds and bypass the mutex entirely.

---

### ExecOptions

The new optional third argument to `execEnvy`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stdin` | `string` | No | When set, `cli.ts` switches to `spawn` and writes this value to the child's stdin, then closes stdin. The value is never copied into argv. |
| `env` | `NodeJS.ProcessEnv` | No | When set, merged into `process.env` to form the child's environment. Used to pass `ENVY_PASSPHRASE` for crypto commands. |

If both fields are `undefined`, `execEnvy` takes the existing `execFile` path with no behavioural change.

---

## State Transitions

### Status Bar

```
                         ┌─────────────────────────────┐
                         │   refreshStatusBar() called   │
                         └──────────────┬───────────────┘
                                        ▼
                                  [spinner on]
                                        │
                ┌───────────────────────┼───────────────────────┐
                ▼                       ▼                       ▼
         parse JSON OK           parse JSON bad           execEnvy throws
                │                       │                  CliNotFoundError
                │                       │                       │
        reduceToState()           SyncState=Error      SyncState=CliNotFound
                │                       │                       │
        ┌───────┼───────┐               │                       │
        ▼       ▼       ▼               ▼                       ▼
     InSync  Modified  NeverSealed   (tooltip = stderr)   (tooltip = install msg)
        │       │       │
        └───────┴───────┴────► SyncState=NotInitialized
                                  (when environments=[] and
                                   exit 0, OR stderr matches
                                   "no manifest" / "envy.toml"
                                   / "not initialized")
```

### Command Concurrency (inFlight)

```
              ┌──────────────────────────────────┐
              │  encrypt / decrypt / diff invoked  │
              └──────────────────┬───────────────┘
                                 ▼
                          inFlight is...?
                          /                \
                       undefined         Promise (in-flight)
                          │                     │
                          ▼                     ▼
                   start the op          show "operation in
                   set inFlight =        progress" toast
                   p.then()              and ABORT
                          │                     │
                          ▼                     ▼
                   p resolves /         (return, no state
                   rejects               change)
                          │
                          ▼
                   inFlight = undefined
```

---

## Type-Specific Invariants

- **`StatusPayload.environments[i].secret_count >= 0`**: enforced by the validation function (`typeof === 'number'`); a negative value would be a CLI bug.
- **`StatusPayload.environments[i].status` ∈ {`'in_sync'`, `'modified'`, `'never_sealed'`}**: not strictly enforced by `isStatusPayload` (it only checks `string`); unknown statuses are treated as `in_sync` to fail safe (a vault never falsely reports `modified`).
- **Tree view empty-env detection (`src/treeView.ts`)** — corrected by FR-020:
  - Old regex `/environment.+not found/i` → matches nothing in the 0.2.7 CLI stderr.
  - New regex `/no secrets in|record not found/i` → matches `envy list`'s empty-env stderr (`(no secrets in <env>)`) and missing-env stderr (`error: database error: record not found`).
  - Both patterns route to the `empty` tree-view state.
  - The `not initialized` state is still gated on the existing `manifest|envy\.toml|not initialized` pattern (which is correct for the `envy list` error on an uninitialized workspace).
- **`ExecOptions.stdin` is `undefined` for every existing call site**: verified by reading `statusBar.ts:68`, `treeView.ts:49`, `initVault.ts:9`, `setSecret.ts:32`. None passes a third argument.
- **`ExecOptions.env` is `undefined` for every existing call site**: same as above.
- **`inFlight` is `undefined` after every successful or failed crypto operation**: enforced by `.finally()` in the `trackCrypto()` wrapper.
- **Passphrase / value never appears in any type field**: `ExecOptions.stdin` is dropped at the end of the handler; `ExecOptions.env.ENVY_PASSPHRASE` is dropped when the child process exits (Node.js clears the env on process exit).
