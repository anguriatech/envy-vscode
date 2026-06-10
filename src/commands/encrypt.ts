import * as vscode from 'vscode';
import { execEnvy } from '../cli';

/**
 * "Envy: Encrypt (Seal)" — headless invocation.
 *
 * Collects the passphrase through an obscured input box, passes it to the
 * CLI via the `ENVY_PASSPHRASE` env var (never argv), and observes the exit
 * code so a success or error toast can be shown. Refreshes the status bar
 * and tree view on success. The passphrase and any value-bearing stderr are
 * never written to the Output Channel.
 */
export async function handler(refresh: () => Promise<void>): Promise<void> {
    const pw = await vscode.window.showInputBox({
        prompt: 'Envy passphrase',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (v.length === 0 ? 'Passphrase cannot be empty' : undefined),
    });
    if (pw === undefined) {
        return;
    }
    if (pw.length === 0) {
        return;
    }

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (cwd === undefined) {
        void vscode.window.showErrorMessage('Envy: No workspace folder is open.');
        return;
    }

    const result = await execEnvy(['encrypt'], cwd, {
        env: { ...process.env, ENVY_PASSPHRASE: pw },
    });

    if (result.exitCode === 0) {
        void vscode.window.showInformationMessage('Vault sealed.');
        await refresh();
        return;
    }

    void vscode.window.showErrorMessage(
        result.stderr.trim() || 'Encryption failed.',
    );
}
