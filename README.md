# Envy for VS Code

A VS Code extension that wraps the [envy](https://github.com/anguriatech/envy) CLI — a local-first encrypted secrets manager. All cryptographic operations are handled by the `envy` binary; this extension is a pure UI layer.

## Requirements

The `envy` CLI must be installed and available on your `PATH`. If it is not found on activation, the extension will show an error notification with a link to the installation guide.

See [https://github.com/anguriatech/envy#installation](https://github.com/anguriatech/envy#installation) for installation instructions.

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| **Envy: Init Vault** | Initialize an `envy` vault in the current workspace (`envy init`) |
| **Envy: Set Secret** | Add or update a secret via a two-step input — key (visible) then value (obscured) |
| **Envy: Show Diff** | Open the integrated terminal and run `envy diff` to see unsealed changes |
| **Envy: Encrypt (Seal)** | Open the integrated terminal and run `envy encrypt` — passphrase prompt appears in the terminal |
| **Envy: Decrypt** | Open the integrated terminal and run `envy decrypt` — passphrase prompt appears in the terminal |
| **Envy: Refresh Status** | Manually refresh the status bar item |

## Status Bar

A status bar item in the bottom-right corner shows the current vault state:

| Icon | Meaning |
|------|---------|
| `$(sync) Envy: In Sync` | Vault matches the sealed file |
| `$(warning) Envy: Modified` | Unsealed changes are present |
| `$(circle-slash) Envy: Never Sealed` | Vault has never been encrypted |
| `$(circle-slash) Envy: Not Initialized` | No `envy.toml` found in the workspace |
| `$(error) Envy: Error` | Unexpected CLI error |

Click the status bar item to manually refresh it.

## How It Works

- `envy init`, `envy set`, and `envy status` run via `execFile` (no shell, no PTY needed).
- `envy diff`, `envy encrypt`, and `envy decrypt` require an interactive passphrase prompt — they run inside the VS Code integrated terminal, which provides a real PTY.
- The secret value entered via "Envy: Set Secret" is **never** written to the Output Channel or any log.

## Release Notes

### 0.0.1

Initial release — MVP covering vault initialization, secret management, diff, encrypt, and decrypt.
