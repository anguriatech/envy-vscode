import * as vscode from 'vscode';
import { execEnvy, CliNotFoundError } from './cli';

/**
 * Shape of the JSON payload returned by `envy status --format json` (CLI v0.2.7+).
 * The wire format uses lowercase snake_case for `status` (NOT PascalCase).
 */
export interface StatusPayload {
    environments: Array<{
        name: string;
        secret_count: number;
        last_modified_at: string | null;
        status: 'in_sync' | 'modified' | 'never_sealed' | string;
    }>;
    artifact: {
        found: boolean;
        path: string;
        last_modified_at: string | null;
        environments: string[];
    };
}

/**
 * Internal state for the status bar item. One of six mutually-exclusive values.
 * Display labels are title-case (e.g., "In Sync"); the wire-format comparison
 * is lowercase snake_case (see `reduceToState`).
 */
export type SyncState =
    | 'InSync'
    | 'Modified'
    | 'NeverSealed'
    | 'NotInitialized'
    | 'Error'
    | 'CliNotFound';

/**
 * Structural validator. Throws via the `parseStatusJson` caller when the
 * payload does not match.
 */
export function isStatusPayload(x: unknown): x is StatusPayload {
    if (typeof x !== 'object' || x === null) {
        return false;
    }
    const root = x as { environments?: unknown; artifact?: unknown };
    if (!Array.isArray(root.environments)) {
        return false;
    }
    for (const e of root.environments) {
        if (typeof e !== 'object' || e === null) {
            return false;
        }
        const env = e as { name?: unknown; secret_count?: unknown; last_modified_at?: unknown; status?: unknown };
        if (typeof env.name !== 'string') {
            return false;
        }
        if (typeof env.secret_count !== 'number') {
            return false;
        }
        if (env.last_modified_at !== null && typeof env.last_modified_at !== 'string') {
            return false;
        }
        if (typeof env.status !== 'string') {
            return false;
        }
    }
    if (typeof root.artifact !== 'object' || root.artifact === null) {
        return false;
    }
    return true;
}

/**
 * Parse the `envy status --format json` stdout. Throws when the JSON is
 * malformed or the schema check fails. Exported for unit testing.
 */
export function parseStatusJson(text: string): StatusPayload {
    const parsed: unknown = JSON.parse(text);
    if (!isStatusPayload(parsed)) {
        throw new Error('Invalid envy status JSON payload.');
    }
    return parsed;
}

/**
 * Reduce the environments array to one of three success states
 * (or an `'Error'` when the array is somehow non-empty but contains
 * no recognized status values — defensive).
 *
 * Priority: `modified` > `never_sealed` > `in_sync` > `Error`.
 * Unknown status values are treated as `in_sync` to fail safe.
 */
export function reduceToState(
    envs: StatusPayload['environments'],
): 'InSync' | 'Modified' | 'NeverSealed' | 'Error' {
    let sawNeverSealed = false;
    for (const e of envs) {
        if (e.status === 'modified') {
            return 'Modified';
        }
        if (e.status === 'never_sealed') {
            sawNeverSealed = true;
        }
    }
    if (sawNeverSealed) {
        return 'NeverSealed';
    }
    return 'InSync';
}

/**
 * Format an ISO-8601 UTC timestamp as a short English relative time.
 * Exported for unit testing. Uses `Date.now()` and an English tense table.
 */
export function relativeTime(iso: string): string {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) {
        return 'never';
    }
    const diffMs = Date.now() - then;
    if (diffMs < 0) {
        return 'just now';
    }
    const sec = Math.floor(diffMs / 1000);
    if (sec < 45) {
        return 'just now';
    }
    const min = Math.floor(sec / 60);
    if (min < 2) {
        return '1 minute ago';
    }
    if (min < 60) {
        return `${min} minutes ago`;
    }
    const hr = Math.floor(min / 60);
    if (hr < 2) {
        return '1 hour ago';
    }
    if (hr < 24) {
        return `${hr} hours ago`;
    }
    const day = Math.floor(hr / 24);
    if (day < 2) {
        return '1 day ago';
    }
    if (day < 14) {
        return `${day} days ago`;
    }
    const week = Math.floor(day / 7);
    if (week < 2) {
        return '1 week ago';
    }
    return `${week} weeks ago`;
}

/**
 * Build the aggregated tooltip text per FR-012.
 *   "{N} environments, {M} secrets total, last modified {RELATIVE}"
 * Skips `null` `last_modified_at` entries; when all entries are `null`
 * (or `environments` is empty), falls back to the literal string `"never"`.
 * Exported for unit testing.
 */
export function buildTooltip(payload: StatusPayload): string {
    const n = payload.environments.length;
    const m = payload.environments.reduce((acc, e) => acc + e.secret_count, 0);
    const timestamps = payload.environments
        .map((e) => e.last_modified_at)
        .filter((t): t is string => t !== null)
        .sort();
    const mostRecent = timestamps[timestamps.length - 1] ?? null;
    const rel = mostRecent === null ? 'never' : relativeTime(mostRecent);
    return `${n} environments, ${m} secrets total, last modified ${rel}`;
}

/**
 * Create and register the Envy status bar item.
 * Shows a spinner initially; refreshStatusBar() will update it.
 * Clicking the item invokes the refreshStatus command.
 */
export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.text = '$(sync~spin) Envy';
    item.command = 'envy-vscode.refreshStatus';
    item.show();
    context.subscriptions.push(item);
    return item;
}

/**
 * Refresh the status bar item by running `envy status --format json` in
 * the workspace root. Derives state from the JSON payload directly — no
 * text-table parsing.
 *
 * State mapping:
 *   CliNotFound       → $(error) Envy: CLI Not Found
 *   NotInitialized    → $(circle-slash) Envy: Not Initialized
 *   Error             → $(error) Envy: Error
 *   Modified          → $(warning) Envy: Modified
 *   NeverSealed       → $(circle-slash) Envy: Never Sealed
 *   InSync            → $(sync) Envy: In Sync
 *
 * NotInitialized is detected by exit code 1 + stderr pattern match on
 * `/not an envy project|envy init/i` — the CLI does NOT write JSON
 * when no `envy.toml` is present.
 */
export async function refreshStatusBar(item: vscode.StatusBarItem, cwd: string): Promise<void> {
    item.text = '$(sync~spin) Envy';
    let result;
    try {
        result = await execEnvy(['status', '--format', 'json'], cwd);
    } catch (error) {
        if (error instanceof CliNotFoundError) {
            item.text = '$(error) Envy: CLI Not Found';
            item.tooltip = 'Install the envy CLI to use this extension.';
            return;
        }
        item.text = '$(error) Envy: Error';
        item.tooltip = String(error);
        return;
    }

    if (result.exitCode !== 0) {
        const stderr = result.stderr.trim();
        if (/not an envy project|envy init/i.test(stderr)) {
            item.text = '$(circle-slash) Envy: Not Initialized';
            item.tooltip = "Vault not initialized. Run 'Envy: Init Vault' to get started.";
            return;
        }
        item.text = '$(error) Envy: Error';
        item.tooltip = stderr || 'envy status returned a non-zero exit code.';
        return;
    }

    let payload: StatusPayload;
    try {
        payload = parseStatusJson(result.stdout);
    } catch (err) {
        item.text = '$(error) Envy: Error';
        item.tooltip = 'Invalid envy status JSON payload.';
        return;
    }

    const state = reduceToState(payload.environments);
    switch (state) {
        case 'Modified':
            item.text = '$(warning) Envy: Modified';
            break;
        case 'NeverSealed':
            item.text = '$(circle-slash) Envy: Never Sealed';
            break;
        case 'Error':
            item.text = '$(error) Envy: Error';
            item.tooltip = 'envy status returned an unrecognized environment state.';
            return;
        case 'InSync':
        default:
            item.text = '$(sync) Envy: In Sync';
            break;
    }
    item.tooltip = buildTooltip(payload);
}
