import * as vscode from 'vscode';
import { execEnvy, CliNotFoundError } from './cli';

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
 * Extract the Status column values from `envy status` table output.
 *
 * The table format is:
 *   | Environment | Secrets | Last Modified | Status         |
 *   | development | 4       | 2 minutes ago | ⚠ Modified     |
 *   | production  | 3       | 3 days ago    | ✓ In Sync      |
 *
 * Naive substring matching on the full output causes false positives because
 * the "Last Modified" column header contains the word "Modified". This function
 * extracts only the last pipe-delimited column of each data row — the Status
 * column — so comparisons are isolated from unrelated column content.
 *
 * Filtering rules (all case-insensitive after trim):
 *   - Skip rows with no `|` (non-table lines)
 *   - Skip the header row (last column is exactly "status")
 *   - Skip separator rows (last column contains only `=` or `-` characters)
 */
function extractStatusColumns(output: string): string[] {
    return output
        .split('\n')
        .filter(line => line.includes('|'))
        .map(line => {
            const parts = line.split('|');
            // split('|') on "| a | b |" yields ["", " a ", " b ", ""] — second-to-last is the value
            return (parts[parts.length - 2] ?? '').trim().toLowerCase();
        })
        .filter(col => {
            if (col.length === 0) { return false; }
            if (col === 'status') { return false; }                  // header row
            if (/^[=\-+\s]+$/.test(col)) { return false; }          // separator row
            return true;
        });
}

/**
 * Refresh the status bar item by running `envy status` in the workspace root.
 *
 * Status mapping (checked against Status column values only, case-insensitive):
 *   any row "modified"     → $(warning)      Envy: Modified
 *   any row "never sealed" → $(circle-slash)  Envy: Never Sealed
 *   any row "in sync"      → $(sync)          Envy: In Sync
 *   non-zero exit          → $(circle-slash)  Envy: Not Initialized
 *   CLI error              → $(error)         Envy: Error
 *
 * Priority: Modified > Never Sealed > In Sync
 */
export async function refreshStatusBar(item: vscode.StatusBarItem, cwd: string): Promise<void> {
    item.text = '$(sync~spin) Envy';
    try {
        const result = await execEnvy(['status'], cwd);
        const output = (result.stdout + result.stderr).trim();

        if (result.exitCode !== 0) {
            const lower = output.toLowerCase();
            const isNotInitialized =
                lower.includes('no manifest') ||
                lower.includes('not found') ||
                lower.includes('not initialized') ||
                lower.includes('envy.toml');
            item.text = isNotInitialized
                ? '$(circle-slash) Envy: Not Initialized'
                : '$(error) Envy: Error';
            item.tooltip = output || 'envy status returned a non-zero exit code.';
            return;
        }

        const statusCols = extractStatusColumns(output);

        if (statusCols.some(col => col.includes('modified'))) {
            item.text = '$(warning) Envy: Modified';
        } else if (statusCols.some(col => col.includes('never sealed'))) {
            item.text = '$(circle-slash) Envy: Never Sealed';
        } else if (statusCols.some(col => col.includes('in sync'))) {
            item.text = '$(sync) Envy: In Sync';
        } else {
            // exit 0 but no known status keyword found — vault likely empty/new
            item.text = '$(circle-slash) Envy: Not Initialized';
        }
        item.tooltip = output;
    } catch (error) {
        if (error instanceof CliNotFoundError) {
            item.text = '$(error) Envy: CLI Not Found';
            item.tooltip = 'Install the envy CLI to use this extension.';
        } else {
            item.text = '$(error) Envy: Error';
            item.tooltip = String(error);
        }
    }
}
