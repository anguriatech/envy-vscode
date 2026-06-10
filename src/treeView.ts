import * as vscode from 'vscode';
import { execEnvy, CliNotFoundError } from './cli';

/** One of six mutually exclusive panel states. Drives viewsWelcome rendering. */
type TreeViewState = 'loading' | 'keys' | 'empty' | 'notInitialized' | 'cliUnavailable' | 'error';

/**
 * A single row in the "Envy Secrets" tree view representing one vault key.
 * Only the key name is stored — values are never fetched or displayed.
 */
export class SecretKeyItem extends vscode.TreeItem {
    constructor(public readonly key: string) {
        super(key, vscode.TreeItemCollapsibleState.None);
        // Required: matched by "viewItem == secretKey" in package.json when clauses
        // for the inline Copy and Edit icon buttons.
        this.contextValue = 'secretKey';
        this.iconPath = new vscode.ThemeIcon('key');
    }
}

/**
 * TreeDataProvider for the "Envy Secrets" panel.
 *
 * Fetches secret key names from `envy list` via the shared execEnvy executor.
 * Values are never fetched, stored, or surfaced.
 */
export class EnvySecretsProvider implements vscode.TreeDataProvider<SecretKeyItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    constructor(private readonly _cwd: string) {}

    /** Signal VS Code to re-call getChildren() and redraw the tree. */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SecretKeyItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<SecretKeyItem[]> {
        if (!this._cwd) {
            this._setState('notInitialized');
            return [];
        }

        try {
            const result = await execEnvy(['list'], this._cwd);

            if (result.exitCode !== 0) {
                // "environment '...' not found" means the vault exists but has no
                // secrets yet — the environment record is only created on first `envy set`.
                // This must be checked BEFORE the generic "not found" pattern below.
                const isEmptyEnvironment = /environment.+not found/i.test(result.stderr);
                if (isEmptyEnvironment) {
                    this._setState('empty');
                    return [];
                }

                // True no-vault errors mention the manifest file or initialization state.
                const isNoVault = /manifest|envy\.toml|not initialized/i.test(result.stderr);
                this._setState(isNoVault ? 'notInitialized' : 'error');
                return [];
            }

            // Parse one key name per line; discard empty lines and whitespace.
            const keys = result.stdout
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            this._setState(keys.length > 0 ? 'keys' : 'empty');
            return keys.map(key => new SecretKeyItem(key));
        } catch (err: unknown) {
            if (err instanceof CliNotFoundError) {
                this._setState('cliUnavailable');
            } else {
                this._setState('error');
            }
            return [];
        }
    }

    private _setState(state: TreeViewState): void {
        void vscode.commands.executeCommand('setContext', 'envySecrets.state', state);
    }
}
