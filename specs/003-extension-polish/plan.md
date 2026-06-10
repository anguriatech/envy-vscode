# Implementation Plan: Envy Extension Polish

**Branch**: `003-extension-polish` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/003-extension-polish/spec.md`

## Summary

Close three concrete UX gaps in the existing envy VS Code extension so it becomes a "fully functional" graphical interface for the local-first `envy` CLI:

1. **Headless crypto for `envy encrypt` / `envy decrypt` / `envy diff`** — collect the passphrase via `vscode.window.showInputBox({ password: true })`, pass it through `ENVY_PASSPHRASE` env var via an extended `execEnvy`, and observe the exit code so a success/error toast can fire and the status bar + tree can refresh on success. The current integrated-terminal handoff is replaced with a headless `child_process.spawn`-based invocation.
2. **JSON-driven status bar** — replace the fragile `split('|')` table parser in `statusBar.ts` with a direct parse of `envy status --format json` (validated structurally, with graceful fallback on malformed JSON). The tooltip aggregates across environments (`{N} environments, {M} secrets total, last modified {RELATIVE_TIME}`).
3. **Stdin-based `envy set`** — add an optional `stdin` input to `execEnvy` and switch `setSecret` to `envy set --stdin KEY`, writing the value to the child's stdin. The value never appears in argv.

A new single-process mutex (`inFlight: Promise<void> | undefined`) in `src/extension.ts` serializes encrypt/decrypt/diff; a second invocation while one is in flight shows an "Envy: operation in progress" toast and aborts (no queue). `set` and `init` are not serialized.

No new `package.json` dependencies. No changes to any of the 9 existing command IDs. The `child_process` import boundary stays inside `src/cli.ts`.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode, `module: Node16`, `target: ES2022`) — same as `001-vscode-extension-mvp` and `002-tree-view`  
**Primary Dependencies**: `vscode` API (built-in) — `window.showInputBox({ password: true })`, `JSON.parse` (via the JSON module exposed by VS Code), `commands.executeCommand`, `env.clipboard`; Node.js `child_process` via existing `cli.ts` (extending to use `spawn` for stdin)  
**Storage**: N/A — all persistence stays inside the `envy` CLI's vault; the extension holds no in-memory secret beyond the lifetime of one handler invocation  
**Testing**: Mocha + `@vscode/test-cli` + `@vscode/test-electron` (existing scaffold from 001/002) — no new test framework  
**Target Platform**: VS Code Extension Host (VS Code ^1.110.0)  
**Project Type**: VS Code Extension (additive change on top of `001-vscode-extension-mvp` + `002-tree-view`)  
**Performance Goals**: Each headless crypto invocation returns within 3 seconds of the CLI finishing (SC-002); status bar and tree refresh within 2 seconds of a successful write (SC-003); spinner visible on the status bar while refresh is in flight  
**Constraints**: `child_process` import stays exclusively in `src/cli.ts` (FR-017); passphrases and secret values NEVER appear in the Output Channel, logs, exceptions, or toasts (FR-015); all 9 command IDs preserved (FR-016); no new `package.json` dependencies; `execEnvy` is **extended** (not replaced) with optional `stdin` and `env` parameters (FR-003, FR-009)  
**Scale/Scope**: 4 source files modified (`src/cli.ts`, `src/statusBar.ts`, `src/extension.ts`, `src/commands/setSecret.ts`), 3 source files rewritten (`src/commands/encrypt.ts`, `src/commands/decrypt.ts`, `src/commands/showDiff.ts`), 0 new files, 0 new dependencies, 0 new commands. The new `inFlight` mutex lives inside `src/extension.ts` (the cleaner of the two candidate locations — see Research Decision 7).

## Constitution Check

*The constitution is written for the core Rust `envy` CLI. This plan covers the TypeScript VS Code extension companion — a separate project. The spirit of each principle is applied to the TypeScript context.*

| Principle | Applies? | Status | Notes |
|-----------|----------|--------|-------|
| I. Security by Default | ✓ Yes | **PASS** | FR-003 routes the passphrase through `ENVY_PASSPHRASE` env var, never argv. FR-009 routes the secret value through stdin, never argv. FR-015 forbids passphrases/values in Output Channel, logs, exceptions, or toasts. The `showInputBox({ password: true })` mask is preserved. SC-006 and SC-007 are the security smoke tests. |
| II. Determinism | ✓ Yes | **PASS** | Status bar derives state from a structurally-validated JSON payload, not a text-table heuristic — deterministic given the same payload. The 2-second refresh window is bounded and observable. No new sources of non-determinism. |
| III. Rust Best Practices | Adapted | **PASS** | TypeScript `strict: true` + `module: Node16` + ESLint strict. No `any` types. Errors propagated through the existing `CliResult` / `CliNotFoundError` contract. The new `execEnvy` overload surfaces spawn errors with structured fields (`code`, `signal`, `exitCode`) — no opaque strings. |
| IV. Modularity | ✓ Yes | **PASS** | `cli.ts` is the only module importing `child_process`. `commands/encrypt.ts`, `commands/decrypt.ts`, `commands/showDiff.ts`, and `commands/setSecret.ts` call only `execEnvy`. The new `inFlight` mutex lives in `extension.ts` next to the existing `cliAvailable` flag — same module-level scope, no new layer. |
| V. Language | ✓ Yes | **PASS** | All identifiers, comments, and user-facing strings in English. Toast text and tooltip template are short English phrases. |

**Result**: No violations. No Complexity Tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/003-extension-polish/
├── plan.md              # This file
├── research.md          # Phase 0 output — 7 design decisions
├── data-model.md        # Phase 1 output — StatusPayload, SyncState, OperationResult
├── quickstart.md        # Phase 1 output — Manual F5 test scenarios
├── contracts/
│   └── commands.md      # Phase 1 output — execEnvy contract change + 3 command signatures + package.json diff
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── extension.ts            # MODIFIED: add inFlight mutex, wire refresh-after-crypto, pass env vars
├── cli.ts                  # MODIFIED: extend execEnvy with optional { stdin, env }; add spawn-based path
├── statusBar.ts            # REWRITTEN: JSON-driven, no text-table parsing; aggregated tooltip
├── treeView.ts             # MODIFIED: update empty-env detection regex (FR-020)
└── commands/
    ├── initVault.ts        # UNCHANGED
    ├── setSecret.ts        # MODIFIED: pass value via stdin (--stdin flag, write to child.stdin)
    ├── showDiff.ts         # REWRITTEN: headless execEnvy with ENVY_PASSPHRASE + output channel on success
    ├── encrypt.ts          # REWRITTEN: headless execEnvy with ENVY_PASSPHRASE + success/error toast
    └── decrypt.ts          # REWRITTEN: headless execEnvy with ENVY_PASSPHRASE + success/error toast
```

**Structure Decision**: Single-project flat layout. No new files, no new directories, no new modules. The four `commands/*.ts` files keep their existing one-purpose-per-file shape. The `inFlight` mutex is a 3-line module-level state in `src/extension.ts` next to the existing `cliAvailable` flag — see Research Decision 7 for the placement rationale.

## Phase Decisions

### Phase 0 Research (complete — see research.md)

| Unknown | Resolution |
|---------|------------|
| `showInputBox({ password: true })` UX | Reused as-is from 001. Single obscured input, Escape-cancellable. |
| `vscode.JSON.parse` vs `JSON.parse` for status payload | `vscode.JSON.parse` — handles trailing-newline/edge cases and matches the "use built-in" guidance. |
| `spawn` vs `execFile` for stdin | `spawn` for `envy set --stdin` (per user constraint). `execFile` retained for all other invocations. |
| `execEnvy` extension shape | Optional `options?: { stdin?: string; env?: NodeJS.ProcessEnv }` parameter — non-breaking, additive. |
| Status bar JSON structure | 6 mutually-exclusive states: `InSync`, `Modified`, `NeverSealed`, `NotInitialized`, `Error`, `CliNotFound`. Aggregated tooltip across all environments. |
| Tooltip aggregation algorithm | `N environments, M secrets total, last modified <relative time of most recent env>`. Empty / non-init / error / CLI-missing states use the human-readable status text only. |
| `inFlight` mutex placement | `src/extension.ts` — co-located with `cliAvailable` and the `refreshTree` closure. Cleaner than placing it in `cli.ts` (which is purely an executor). |
| Old-CLI fallback | OUT OF SCOPE per user decision — FR-018 is deferred, not implemented. |

### Phase 1 Design (complete — see artifacts)

- **research.md** — 7 decisions (one per row above) with rationale + alternatives considered
- **data-model.md** — `StatusPayload` (the JSON schema), `SyncState` (6 states), `EnvyOperationResult` (the headless invocation result), `OpKind` (the discriminator used by the `inFlight` mutex)
- **contracts/commands.md** — `execEnvy` contract change, signatures of the 4 modified/rewritten command handlers, exact `package.json` diff, mutex behavior
- **quickstart.md** — 10 manual F5 test scenarios covering the three P1 user stories + the P2 stdin story + the P3 JSON status bar + the new mutex behavior

## Key Implementation Rules

1. **`child_process` stays in `src/cli.ts`**: `commands/*.ts` and `statusBar.ts` continue to call `execEnvy` only. The `spawn` import joins `execFile` inside `cli.ts`.
2. **`execEnvy` is extended, not replaced**: an optional `options?: { stdin?: string; env?: NodeJS.ProcessEnv }` parameter is added at the end of the existing signature. All 4 existing call sites that pass `(args, cwd)` continue to work unchanged.
3. **Stdin uses `spawn`, argv uses `execFile`**: `cli.ts` branches internally — when `options.stdin` is set, it uses `spawn('envy', args, { cwd, env, shell: useShell })`, attaches `'data'`/`'close'` listeners, writes stdin, and resolves the same `CliResult` shape. When `options.stdin` is `undefined`, the existing `execFile` path is used.
4. **Passphrases via env, not stdin or argv**: the passphrase env var (`ENVY_PASSPHRASE`) is added to the `env` object passed to `execEnvy`, never to argv. The child process inherits only the additions to `process.env` — `cli.ts` builds `env: { ...process.env, ENVY_PASSPHRASE: pw }` explicitly.
5. **Passphrases and values are never stringified into any error path**: every catch block logs only the `error.message` (or no message at all when the message could contain the value). The Output Channel is never appended with `result.stdout`/`result.stderr` for `set` / encrypt / decrypt / diff — only for `init` and `showDiff` (which are non-secret).
6. **Status bar parses JSON, never text**: the `extractStatusColumns` function in `statusBar.ts` is deleted. The new `parseStatusJson(payload)` function uses `vscode.JSON.parse`, validates the resulting object against a minimal schema (`environments: Array<{ name, status, secret_count, last_modified_at }>`), and returns a tagged union. Malformed JSON → `'Error'` state, not a crash. **Wire-format `status` values are lowercase snake_case** (`"in_sync" | "modified" | "never_sealed"`); the priority reduction uses strict equality against these strings. **Null `last_modified_at` is valid** (an env with 0 secrets) and is skipped during the "most recent" aggregation. The `NotInitialized` detection is exit-code + stderr based (`/not an envy project|envy init/i`), NOT JSON-parse based — the CLI does not write JSON when no `envy.toml` is present.
7. **`inFlight` mutex is a single line of state in `src/extension.ts`**: `let inFlight: Promise<void> | undefined;` Each of the 3 crypto command registrations wraps its handler with: if `inFlight !== undefined`, show toast and return; otherwise assign `inFlight = handler(...)` and `.finally(() => { inFlight = undefined; })`. `setSecret` and `initVault` are unaffected.
8. **All 9 command IDs are preserved**: `envy-vscode.initVault`, `envy-vscode.setSecret`, `envy-vscode.showDiff`, `envy-vscode.encrypt`, `envy-vscode.decrypt`, `envy-vscode.refreshStatus`, `envy-vscode.copyKeyName`, `envy-vscode.editSecret`, `envy-vscode.refreshTreeView` — the `package.json` `contributes.commands` array is unchanged.
9. **No new `package.json` dependencies**: `vscode.JSON.parse` is built into the `vscode` module; `Date.now()` / `Intl.RelativeTimeFormat` (or a 20-line `relativeTime()` helper) is built into the JS runtime; `child_process.spawn` is built into Node.js.
10. **Manual F5 tests are deferred to the reviewer at the end**: the `quickstart.md` lists 10 scenarios but they are not run during `/speckit.implement`. The reviewer runs them as the final acceptance step.
11. **Tree view empty-env detection is fixed (FR-020)**: `src/treeView.ts:55` regex `/environment.+not found/i` is replaced with `/no secrets in|record not found/i`. The 0.2.7 CLI's empty-vault stderr is `(no secrets in <env>)` and the missing-env stderr is `error: database error: record not found`; the old regex matched neither, causing the tree view to fall through to the `error` state for these common cases. Both new patterns route to the `empty` state. The `not initialized` state remains gated on the existing `manifest|envy\.toml|not initialized` pattern.

## Out of Scope (Implementation)

- A version-detection probe (`envy --version`) and conditional fallback paths for older CLIs. (FR-018 deferred per user decision.)
- A per-environment passphrase UI (the spec uses the default `ENVY_PASSPHRASE` only).
- A file-watcher-based auto-refresh of the status bar.
- A keychain integration for storing the passphrase.
- Migrating the tree view to JSON-based key listing (the `envy list` line-based output is sufficient and stable).
- Adding a `Reveal Secret Value` action in the tree view (re-confirms 002-tree-view decision).
- Multi-root workspace support.
