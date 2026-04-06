import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	/** Activate the extension by name, regardless of publisher. */
	async function activateExtension(): Promise<void> {
		const ext = vscode.extensions.all.find(e => e.id.endsWith('envy-vscode'));
		if (ext !== undefined && !ext.isActive) {
			await ext.activate();
		}
	}

	test('Extension activates without throwing', async () => {
		await activateExtension();
		assert.ok(true);
	});

	test('All five Envy commands are registered', async () => {
		await activateExtension();
		const commands = await vscode.commands.getCommands(true);
		const envyCommands = [
			'envy-vscode.initVault',
			'envy-vscode.setSecret',
			'envy-vscode.showDiff',
			'envy-vscode.encrypt',
			'envy-vscode.decrypt',
		];
		for (const cmd of envyCommands) {
			assert.ok(
				commands.includes(cmd),
				`Expected command "${cmd}" to be registered`
			);
		}
	});
});
