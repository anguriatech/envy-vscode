import * as vscode from 'vscode';

// Module-level terminal reference — reused between invocations to avoid
// stacking up multiple Envy terminals. Replaced when the terminal is closed.
let envyTerminal: vscode.Terminal | undefined;

/**
 * Open the Envy integrated terminal and run `envy encrypt`.
 * The terminal provides a real PTY so the passphrase prompt works natively.
 * Status bar is refreshed after a 3-second delay (no completion event from terminal).
 */
export async function handler(refresh: () => Promise<void>): Promise<void> {
    if (envyTerminal === undefined || envyTerminal.exitStatus !== undefined) {
        envyTerminal = vscode.window.createTerminal({ name: 'Envy' });
    }
    envyTerminal.sendText('envy encrypt', true);
    envyTerminal.show();
    setTimeout(() => { void refresh(); }, 3000);
}
