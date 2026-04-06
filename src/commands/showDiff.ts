import * as vscode from 'vscode';

// Module-level terminal reference — reused between invocations to avoid
// stacking up multiple Envy terminals. Replaced when the terminal is closed.
let envyTerminal: vscode.Terminal | undefined;

/**
 * Open the Envy integrated terminal and run `envy diff`.
 * The terminal provides a real PTY so the passphrase prompt works natively.
 * `envy diff` must decrypt the vault to compute the diff, so a passphrase
 * is required — this cannot run via execFile (no TTY).
 */
export async function handler(
    _outputChannel: vscode.OutputChannel,
    _cwd: string
): Promise<void> {
    if (envyTerminal === undefined || envyTerminal.exitStatus !== undefined) {
        envyTerminal = vscode.window.createTerminal({ name: 'Envy' });
    }
    envyTerminal.sendText('envy diff', true);
    envyTerminal.show();
}
