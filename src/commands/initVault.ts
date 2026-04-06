import * as vscode from 'vscode';
import { execEnvy } from '../cli';

export async function handler(
    outputChannel: vscode.OutputChannel,
    cwd: string,
    refresh: () => Promise<void>
): Promise<void> {
    const result = await execEnvy(['init'], cwd);

    if (result.stdout) {
        outputChannel.appendLine(result.stdout);
    }
    if (result.stderr) {
        outputChannel.appendLine(result.stderr);
    }

    if (result.exitCode !== 0) {
        void vscode.window.showErrorMessage(result.stderr || 'envy init failed.');
        return;
    }

    void vscode.window.showInformationMessage('Vault initialized.');
    await refresh();
}
