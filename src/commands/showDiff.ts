import * as vscode from 'vscode';
import { execEnvy } from '../cli';

/**
 * "Envy: Show Diff" — headless invocation.
 *
 * Collects the passphrase through an obscured input box, passes it to the
 * CLI via the `ENVY_PASSPHRASE` env var (never argv), and observes the exit
 * code so a success or error toast can be shown. Writes the diff to the
 * existing "Envy" Output Channel. The diff may contain secret values, but
 * this is the user-requested, passphrase-gated read surface established in
 * 001-vscode-extension-mvp. The passphrase itself is NEVER written to the
 * Output Channel.
 */
export async function handler(
    outputChannel: vscode.OutputChannel,
    cwd: string,
): Promise<void> {
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

    const result = await execEnvy(['diff'], cwd, {
        env: { ...process.env, ENVY_PASSPHRASE: pw },
    });

    if (result.stdout.length > 0) {
        outputChannel.appendLine(result.stdout);
    }
    if (result.stderr.length > 0) {
        outputChannel.appendLine(result.stderr);
    }

    if (result.exitCode === 0) {
        void vscode.window.showInformationMessage('Diff complete.');
        outputChannel.show();
        return;
    }

    void vscode.window.showErrorMessage(
        result.stderr.trim() || 'Diff failed.',
    );
    outputChannel.show();
}
