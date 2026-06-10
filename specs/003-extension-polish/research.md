# Research: Envy Extension Polish

**Feature Branch**: `003-extension-polish`  
**Date**: 2026-06-10

---

## Decision 1: Reuse `showInputBox({ password: true })` for the Passphrase Prompt

**Decision**: Collect the passphrase through `vscode.window.showInputBox({ prompt, password: true, ignoreFocusOut: true })` — the same pattern used by the existing Set Secret flow for the secret value (`src/commands/setSecret.ts:24`).

**Rationale**: The pattern is already in the codebase, is type-safe, returns `undefined` on Escape (clean cancellation), and uses the same obscured input widget users already trust. Reusing it means the three new crypto flows (encrypt/decrypt/diff) and the existing set flow all share one input UX, and the FR-007 / FR-008 cancellation + empty-validation rules are implemented with a 4-line guard.

**Implementation Detail**:
```typescript
const pw = await vscode.window.showInputBox({
    prompt: 'Envy passphrase',
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => v.length === 0 ? 'Passphrase cannot be empty' : undefined,
});
if (pw === undefined) { return; } // user pressed Escape
if (pw.length === 0) { return; }   // belt-and-braces; validateInput already covers this
```

**Alternatives Considered**:
- A webview-based prompt — rejected: adds a 100-line HTML/CSS payload and an extra disposal surface for the same UX.
- Reusing the `code` integration's built-in credential prompt — rejected: not portable and not the established pattern.

---

## Decision 2: `vscode.JSON.parse` (built-in) for the Status Payload

**Decision**: Parse `envy status --format json` output with `vscode.JSON.parse`, not the global `JSON.parse`.

**Rationale**: `vscode.JSON.parse` is the VS Code built-in JSON parser exposed by the `vscode` module. It tolerates JS-style comments and trailing commas (matching what some CLI tools emit even in `--format json` mode), and the spec's "use the built-in" guidance in the user's input pins it. The global `JSON.parse` would also work, but `vscode.JSON.parse` is the one VS Code-native option with no new dependency.

**Validation Strategy**: After `vscode.JSON.parse`, run a 15-line shape check:
```typescript
function isStatusPayload(x: unknown): x is StatusPayload {
    if (typeof x !== 'object' || x === null) { return false; }
    const envs = (x as { environments?: unknown }).environments;
    return Array.isArray(envs) && envs.every(e =>
        typeof (e as { name?: unknown }).name === 'string'
        && typeof (e as { status?: unknown }).status === 'string'
    );
}
```
If `isStatusPayload` returns `false`, the status bar transitions to `'Error'` with a tooltip of `Invalid envy status JSON payload` — no crash, no stale state.

**Alternatives Considered**:
- Global `JSON.parse` — works, but the user's input explicitly says "use `vscode.JSON.parse`".
- A Zod-style runtime validator — rejected: adds a dependency (violates "no new package.json dependencies").
- Hand-rolled try/catch around `JSON.parse` — works, but no structural validation beyond "is it valid JSON"; a valid-JSON object that lacks `environments` would still crash downstream.

---

## Decision 3: `spawn` for Stdin, `execFile` for Argv-Only Invocations

**Decision**: Extend `src/cli.ts` to branch on whether `options.stdin` is provided. When `stdin` is set, use `child_process.spawn('envy', args, { cwd, env, shell: useShell })`, write the value to `child.stdin`, attach `'data'`/`'close'` listeners, and resolve the same `CliResult` shape. When `stdin` is `undefined`, the existing `execFile` path is preserved.

**Rationale**: `execFile` does not give the caller a way to write to the child's stdin — its callback API completes when the process exits but no stream is exposed. `spawn` is the only Node.js built-in that provides a `Writable` stdin stream and supports listening on stdout/stderr separately, both of which are required for `envy set --stdin KEY`. Mixing both APIs in `cli.ts` keeps the boundary clean: the rest of the extension continues to call `execEnvy(args, cwd)` and gets a `CliResult` regardless of which Node primitive was used underneath.

**Implementation Sketch** (in `src/cli.ts`):
```typescript
export interface ExecOptions {
    stdin?: string;
    env?: NodeJS.ProcessEnv;
}

export function execEnvy(args: string[], cwd: string, options?: ExecOptions): Promise<CliResult> {
    if (options?.stdin === undefined) {
        return execEnvyExecFile(args, cwd, options?.env); // existing implementation
    }
    return execEnvySpawn(args, cwd, options.stdin, options?.env ?? process.env);
}
```

**Stdin Closure**: Write `options.stdin` to `child.stdin` and call `child.stdin.end()`. Do NOT buffer the value into a variable that outlives the handler — `options.stdin` is the only reference, and it is dropped when the promise resolves.

**Alternatives Considered**:
- `execFile` with `input` option (Node 18+ has it) — works for small inputs but spawns the process and writes stdin in a single shot; equivalent to spawn+write for our use case but doesn't support streaming. The user's input explicitly says "prefer Node.js spawn over execFile so the value stream can be written".
- A `Worker` thread — rejected: adds complexity for a 1-shot child process.
- A webview-based "paste the value" flow — rejected: never returns a string outside the user's explicit consent.

---

## Decision 4: `execEnvy` Extension Shape — Optional `options` Parameter

**Decision**: Add a single optional third parameter to `execEnvy`:
```typescript
export function execEnvy(
    args: string[],
    cwd: string,
    options?: { stdin?: string; env?: NodeJS.ProcessEnv },
): Promise<CliResult>
```

**Rationale**: This is the smallest change that satisfies FR-003 (env var for passphrase) and FR-009 (stdin for secret value) without breaking any of the 4 existing call sites. All existing call sites (`statusBar.ts:68`, `treeView.ts:49`, `initVault.ts:9`, `setSecret.ts:32`) pass `(args, cwd)` and continue to work — the new parameter is `undefined` and the `execFile` branch is taken.

**Backwards Compatibility**: Verified by reading the 4 call sites above. None passes a third argument. None mutates the returned `CliResult` shape.

**Alternatives Considered**:
- Two separate functions (`execEnvy` and `execEnvyWithStdin`) — rejected: doubles the surface and forces call sites to choose between them, but the only thing that differs is the optional `options` object. One function with a discriminated union is cleaner.
- An `options` object as the second parameter (replacing `cwd`) — rejected: breaks every existing call site.

---

## Decision 5: Status Bar JSON Schema and 6-State Model

**Decision**: Define a `StatusPayload` TypeScript type that mirrors the actual CLI v0.2.7 JSON output. **Important**: the CLI emits the `status` field as `lowercase_snake_case` (`"in_sync"`, `"modified"`, `"never_sealed"`), NOT PascalCase as previously assumed. The display labels in the status bar (`"Envy: In Sync"` etc.) remain English/title-case for human readability, but the wire-format comparison is lowercase snake_case.

```typescript
interface StatusPayload {
    environments: Array<{
        name: string;
        secret_count: number;
        last_modified_at: string | null;     // ISO 8601 UTC timestamp, or null when env has 0 secrets
        status: 'in_sync' | 'modified' | 'never_sealed';
    }>;
    artifact: {
        found: boolean;
        path: string;
        last_modified_at: string | null;
        environments: string[];
    };
}
```

The status bar reduces the `environments` array to one of six mutually-exclusive `SyncState` values, with the following priority order (top wins):

| Priority | State | Trigger |
|----------|-------|---------|
| 1 | `Error` | Malformed JSON, schema-invalid payload, or CLI non-zero exit other than "no manifest" |
| 2 | `NotInitialized` | CLI exit ≠ 0 AND stderr matches `/not an envy project\|envy init/i`. **The JSON is not written in this case** — the check is exit-code + stderr based, not JSON-parse based. |
| 3 | `Modified` | Any environment's `status === 'modified'` |
| 4 | `NeverSealed` | Any environment's `status === 'never_sealed'` (and none Modified) |
| 5 | `InSync` | All environments `status === 'in_sync'` (defensive: any unknown status value also falls here) |
| 6 | `CliNotFound` | `execEnvy` rejected with `CliNotFoundError` |

**Rationale**: The "Modified > NeverSealed > InSync" priority matches the existing 001 status bar behaviour and matches the user's mental model — "if anything is modified, that's what I need to know about." Adding `Error` and `CliNotFound` at higher priority reflects the new failure paths introduced by this spec.

**Tooltip Aggregation** (per FR-012, post-decision):
```typescript
function buildTooltip(payload: StatusPayload): string {
    const n = payload.environments.length;
    const m = payload.environments.reduce((acc, e) => acc + e.secret_count, 0);
    const timestamps = payload.environments
        .map(e => e.last_modified_at)
        .filter((t): t is string => t !== null)
        .sort();
    const mostRecent = timestamps[timestamps.length - 1] ?? null;
    const rel = mostRecent === null ? 'never' : relativeTime(mostRecent);
    return `${n} environments, ${m} secrets total, last modified ${rel}`;
}
```

`EnvironmentStatus.last_modified_at` is `string | null` (null when the environment has 0 secrets). The aggregation skips `null` entries; if every entry is `null` (or `payload.environments` is empty), the `rel` fallback is the string `"never"` and the tooltip reads `"N environments, M secrets total, last modified never"`.

When the state is `Empty` / `NotInitialized` / `Error` / `CliNotFound` / no `environments` array, the tooltip is the human-readable status text only (e.g., `"Vault not initialized. Run 'Envy: Init Vault' to get started."`).

**Relative Time**: A 15-line `relativeTime(iso: string): string` helper using `Date.now()` and an English tense table (`"just now"`, `"5 minutes ago"`, `"2 hours ago"`, `"3 days ago"`, `"2 weeks ago"`, `"never"`). No dependency on `Intl.RelativeTimeFormat` to keep the implementation portable and the strings stable.

**Alternatives Considered**:
- `Intl.RelativeTimeFormat` — works in Node 22, but the output is locale-sensitive and the user wants stable English strings.
- A library like `dayjs` / `date-fns` — rejected: violates the "no new dependencies" rule.

---

## Decision 6: `inFlight` Mutex Placement — `src/extension.ts`

**Decision**: Place the `inFlight` mutex as a module-level state in `src/extension.ts` next to the existing `cliAvailable` flag (`src/extension.ts:12`).

**Rationale**: The mutex guards the **command-handler** layer, not the **CLI executor** layer. Putting it in `cli.ts` would force every call site to think about concurrency, even though only the three crypto commands need it. Putting it in `extension.ts` keeps the concern co-located with the command-registration block where the three guarded commands are registered. The two other candidate locations were:

- `src/cli.ts` — rejected: the executor is currently stateless. Adding mutex state to it pollutes its contract.
- A new `src/mutex.ts` module — rejected: 3 lines of state do not justify a new file. The user's input explicitly said "~5 lines of code" and to "pick the cleaner one."

**Implementation Sketch** (in `src/extension.ts`):
```typescript
let inFlight: Promise<void> | undefined;

function guardCrypto(): boolean {
    if (inFlight !== undefined) {
        void vscode.window.showInformationMessage('Envy: operation in progress');
        return false;
    }
    return true;
}

function trackCrypto<T>(p: Promise<T>): Promise<T> {
    inFlight = p.then(() => undefined, () => undefined);
    p.finally(() => { inFlight = undefined; });
    return p;
}
```

The 3 crypto command handlers wrap their work in `if (!guardCrypto()) { return; } ... await trackCrypto(handler(...))`. Set and Init are unaffected.

**Edge Case — `inFlight` cleared before the second `.finally` callback**: The order is `inFlight = p.then(() => undefined, () => undefined)` (catch wrapper installed) and then `p.finally(() => { inFlight = undefined; })` (cleanup installed). If `p` rejects, both fire; `inFlight` is set to `undefined` after the cleanup runs. A second invocation during the microtask gap between the rejection and the `.finally` could observe `inFlight !== undefined` and bail out — which is the correct behaviour (we don't want to start a new operation while the rejected one is still unwinding).

**Alternatives Considered**:
- A counter-based `activeOps: number` — rejected: overengineered for 3 commands. The user explicitly asked for a single `inFlight` reference.
- A `Map<commandId, Promise>` — rejected: the three commands are mutually exclusive against each other but the user said "use a single mutex," not per-command mutexes.

---

## Decision 7: Old-CLI Fallback Is OUT OF SCOPE

**Decision**: FR-018 is marked deferred in the spec. The extension does NOT probe `envy --version`, does NOT detect a CLI version mismatch, and does NOT maintain separate code paths for older CLIs. If the user's CLI rejects `--stdin`, `--format json`, or `ENVY_PASSPHRASE`, the user sees the CLI's own error message (surfaced as a toast with `result.stderr`).

**Rationale**: User explicitly decided: "Assume envy CLI v0.2.7+ is always installed. If the user's CLI is older and rejects new flags, the user sees the CLI's own error message — we do not detect or work around CLI version. Remove FR-018 from requirements or mark it explicitly as 'deferred / not implemented in this iteration'." This decision saves ~40 lines of version-detection and dual-path code, and removes a class of subtle test-coverage requirements (testing both old and new CLI paths).

**Test Impact**: No integration test sets up an "old CLI" stub. The Mocha suite uses the actual installed CLI on the test machine, assumed to be v0.2.7+.

**Alternatives Considered**:
- A `--no-stdin` flag on `setSecret` that falls back to the existing argv path — rejected: violates the user's explicit decision.
- A version probe cached on activation — rejected: same reason, and adds an extra CLI invocation on every VS Code start.
