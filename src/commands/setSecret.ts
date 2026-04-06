import * as vscode from 'vscode';
import { execEnvy } from '../cli';

export async function handler(
    outputChannel: vscode.OutputChannel,
    cwd: string,
    refresh: () => Promise<void>
): Promise<void> {
    // Step 1: collect the secret key.
    const key = await vscode.window.showInputBox({
        prompt: 'Secret key (e.g. DATABASE_URL)',
        placeHolder: 'KEY_NAME',
        ignoreFocusOut: true,
    });
    if (key === undefined) {
        return; // user pressed Escape — abort cleanly
    }

    // Step 2: collect the secret value (obscured).
    // The value is NEVER written to the Output Channel.
    const value = await vscode.window.showInputBox({
        prompt: 'Secret value',
        password: true,
        ignoreFocusOut: true,
    });
    if (value === undefined) {
        return; // user pressed Escape — abort cleanly
    }

    const result = await execEnvy(['set', `${key}=${value}`], cwd);

    if (result.exitCode !== 0) {
        // Append only the CLI error — never the key or value.
        outputChannel.appendLine(result.stderr || 'envy set failed.');
        void vscode.window.showErrorMessage(result.stderr || 'envy set failed.');
        return;
    }

    void vscode.window.showInformationMessage('Secret set.');
    await refresh();
}
