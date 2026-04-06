import * as vscode from 'vscode';
import { execEnvy, CliNotFoundError } from './cli';
import { createStatusBar, refreshStatusBar } from './statusBar';
import { handler as initVaultHandler } from './commands/initVault';
import { handler as setSecretHandler } from './commands/setSecret';
import { handler as showDiffHandler } from './commands/showDiff';
import { handler as encryptHandler } from './commands/encrypt';
import { handler as decryptHandler } from './commands/decrypt';

// Cached on activation; read by requireCli() before every command.
let cliAvailable = false;

/**
 * Guard used at the top of every command handler.
 * Shows an error notification and returns false when the CLI is not installed.
 */
function requireCli(): boolean {
    if (!cliAvailable) {
        void vscode.window.showErrorMessage(
            'Envy CLI is not installed. Install it to use this extension.'
        );
    }
    return cliAvailable;
}

/**
 * Resolve the current workspace root, or show an error and return undefined.
 * Checked inside each command handler so that commands are always registered
 * (required for Command Palette visibility) even with no workspace open.
 */
function getWorkspaceCwd(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage('Envy: No workspace folder is open.');
        return undefined;
    }
    return folders[0].uri.fsPath;
}

export function activate(context: vscode.ExtensionContext): void {
    // Single shared Output Channel for all non-interactive commands.
    const outputChannel = vscode.window.createOutputChannel('Envy');
    context.subscriptions.push(outputChannel);

    // Persistent status bar item — bottom right.
    const statusBarItem = createStatusBar(context);

    // Register all Command Palette commands unconditionally so they always
    // appear in the palette. Workspace and CLI checks happen inside each handler.
    context.subscriptions.push(
        vscode.commands.registerCommand('envy-vscode.initVault', async () => {
            const cwd = getWorkspaceCwd();
            if (cwd === undefined || !requireCli()) { return; }
            await initVaultHandler(outputChannel, cwd, () => refreshStatusBar(statusBarItem, cwd));
        }),
        vscode.commands.registerCommand('envy-vscode.setSecret', async () => {
            const cwd = getWorkspaceCwd();
            if (cwd === undefined || !requireCli()) { return; }
            await setSecretHandler(outputChannel, cwd, () => refreshStatusBar(statusBarItem, cwd));
        }),
        vscode.commands.registerCommand('envy-vscode.showDiff', async () => {
            const cwd = getWorkspaceCwd();
            if (cwd === undefined || !requireCli()) { return; }
            await showDiffHandler(outputChannel, cwd);
        }),
        vscode.commands.registerCommand('envy-vscode.encrypt', async () => {
            if (!requireCli()) { return; }
            const cwd = getWorkspaceCwd();
            await encryptHandler(() => cwd !== undefined
                ? refreshStatusBar(statusBarItem, cwd)
                : Promise.resolve()
            );
        }),
        vscode.commands.registerCommand('envy-vscode.decrypt', async () => {
            if (!requireCli()) { return; }
            const cwd = getWorkspaceCwd();
            await decryptHandler(() => cwd !== undefined
                ? refreshStatusBar(statusBarItem, cwd)
                : Promise.resolve()
            );
        }),
        vscode.commands.registerCommand('envy-vscode.refreshStatus', async () => {
            const cwd = getWorkspaceCwd();
            if (cwd !== undefined) {
                await refreshStatusBar(statusBarItem, cwd);
            }
        }),
    );

    // Populate status bar and detect CLI (workspace-dependent — best-effort on activation).
    const cwd = getWorkspaceCwd();
    if (cwd !== undefined) {
        void execEnvy(['--version'], cwd)
            .then(async () => {
                cliAvailable = true;
                await refreshStatusBar(statusBarItem, cwd);
            })
            .catch((error: unknown) => {
                if (error instanceof CliNotFoundError) {
                    void vscode.window.showErrorMessage(
                        'Envy CLI not found. Install it to use this extension.',
                        'View Installation Guide'
                    ).then((selection) => {
                        if (selection === 'View Installation Guide') {
                            void vscode.env.openExternal(
                                vscode.Uri.parse('https://github.com/anguriatech/envy#installation')
                            );
                        }
                    });
                }
            });
    }
}

export function deactivate(): void {}
