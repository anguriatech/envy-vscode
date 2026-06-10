import * as vscode from 'vscode';
import { execEnvy, CliNotFoundError } from './cli';
import { createStatusBar, refreshStatusBar } from './statusBar';
import { EnvySecretsProvider, SecretKeyItem } from './treeView';
import { handler as initVaultHandler } from './commands/initVault';
import { handler as setSecretHandler } from './commands/setSecret';
import { handler as showDiffHandler } from './commands/showDiff';
import { handler as encryptHandler } from './commands/encrypt';
import { handler as decryptHandler } from './commands/decrypt';

// Cached on activation; read by requireCli() before every command.
let cliAvailable = false;

// Concurrency guard for the three crypto commands (encrypt, decrypt, diff).
// When a crypto command is in flight, a second invocation shows an
// "operation in progress" toast and aborts (no queueing). set and init
// are NOT serialized — they are short-lived and passphrase-free.
let inFlight: Promise<void> | undefined;

/**
 * Returns true if a crypto command is allowed to start. When a previous
 * crypto command is still in flight, shows a notification and returns false.
 */
function guardCrypto(): boolean {
    if (inFlight !== undefined) {
        void vscode.window.showInformationMessage('Envy: operation in progress');
        return false;
    }
    return true;
}

/**
 * Tracks a crypto command's promise. Sets `inFlight` while the promise is
 * pending and clears it in `.finally` so the next invocation can start.
 * The returned promise is the original `p` — callers can `await` it normally.
 */
function trackCrypto<T>(p: Promise<T>): Promise<T> {
    inFlight = p.then(
        () => undefined,
        () => undefined,
    );
    void p.finally(() => {
        inFlight = undefined;
    });
    return p;
}

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

    // "Envy Secrets" tree view in the Explorer sidebar.
    const treeProvider = new EnvySecretsProvider(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('envySecrets', treeProvider)
    );
    // Set initial loading state so viewsWelcome doesn't flicker on startup.
    void vscode.commands.executeCommand('setContext', 'envySecrets.state', 'loading');

    // Refresh closures — kept in one place so all handlers refresh both the
    // status bar and the tree view after successful operations.
    const refreshTree = async (): Promise<void> => {
        treeProvider.refresh();
    };

    // Register all Command Palette commands unconditionally so they always
    // appear in the palette. Workspace and CLI checks happen inside each handler.
    context.subscriptions.push(
        vscode.commands.registerCommand('envy-vscode.initVault', async () => {
            const cwd = getWorkspaceCwd();
            if (cwd === undefined || !requireCli()) { return; }
            await initVaultHandler(outputChannel, cwd, () => refreshStatusBar(statusBarItem, cwd));
            await refreshTree();
        }),
        vscode.commands.registerCommand('envy-vscode.setSecret', async (keyArg?: string) => {
            const cwd = getWorkspaceCwd();
            if (cwd === undefined || !requireCli()) { return; }
            await setSecretHandler(outputChannel, cwd, () => refreshStatusBar(statusBarItem, cwd), keyArg);
            await refreshTree();
        }),
        vscode.commands.registerCommand('envy-vscode.showDiff', async () => {
            const cwd = getWorkspaceCwd();
            if (cwd === undefined || !requireCli()) { return; }
            if (!guardCrypto()) { return; }
            await trackCrypto(showDiffHandler(outputChannel, cwd));
        }),
        vscode.commands.registerCommand('envy-vscode.encrypt', async () => {
            if (!requireCli()) { return; }
            if (!guardCrypto()) { return; }
            const cwd = getWorkspaceCwd();
            if (cwd === undefined) { return; }
            await trackCrypto(encryptHandler(() => refreshStatusBar(statusBarItem, cwd)));
            await refreshTree();
        }),
        vscode.commands.registerCommand('envy-vscode.decrypt', async () => {
            if (!requireCli()) { return; }
            if (!guardCrypto()) { return; }
            const cwd = getWorkspaceCwd();
            if (cwd === undefined) { return; }
            await trackCrypto(decryptHandler(() => refreshStatusBar(statusBarItem, cwd)));
            await refreshTree();
        }),
        vscode.commands.registerCommand('envy-vscode.refreshStatus', async () => {
            const cwd = getWorkspaceCwd();
            if (cwd !== undefined) {
                await refreshStatusBar(statusBarItem, cwd);
            }
        }),
        // Tree view commands (US2, US3, US4 — specs/002-tree-view).
        vscode.commands.registerCommand('envy-vscode.copyKeyName', async (item: SecretKeyItem) => {
            await vscode.env.clipboard.writeText(item.key);
            void vscode.window.showInformationMessage(`Copied: ${item.key}`);
        }),
        vscode.commands.registerCommand('envy-vscode.editSecret', async (item: SecretKeyItem) => {
            await vscode.commands.executeCommand('envy-vscode.setSecret', item.key);
        }),
        vscode.commands.registerCommand('envy-vscode.refreshTreeView', () => {
            treeProvider.refresh();
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
