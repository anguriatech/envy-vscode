# Feature Specification: Envy VS Code Extension MVP

**Feature Branch**: `001-vscode-extension-mvp`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: User description: "Create the specification for the Envy VS Code Extension MVP — a VS Code extension that wraps the envy CLI to provide secret management directly within the editor."

## Context

Envy is a local-first encrypted secrets manager. Developers currently manage secrets (storing, sealing, reviewing changes) exclusively through the terminal. This extension brings those operations into VS Code so that developers never need to leave their editor to interact with their Envy vault.

**Architecture Constraint**: The extension is a pure UI wrapper. It delegates every vault operation to the local `envy` CLI binary on the user's PATH. It must not reimplement any cryptographic logic or vault management logic.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Safe Activation with Missing CLI Guidance (Priority: P1)

A developer installs the Envy VS Code Extension. If the `envy` CLI is not installed on their machine, the extension detects this immediately on activation and shows a clear, actionable error notification with a link to the installation guide. Extension features are disabled until the CLI is available.

**Why this priority**: This is the foundation for every other feature. Without detecting the CLI, all other commands would fail silently or with cryptic errors. Onboarding a new developer depends on this being correct.

**Independent Test**: Install the extension on a machine without the `envy` binary. Activate VS Code with any workspace. Verify the error notification appears and the link opens the installation guide.

**Acceptance Scenarios**:

1. **Given** the `envy` binary is not on the system PATH, **When** the extension activates, **Then** a VS Code error notification appears stating that the Envy CLI is not found, with a "View Installation Guide" action button.
2. **Given** the error notification is shown, **When** the user clicks "View Installation Guide", **Then** the Envy installation documentation is opened in the browser.
3. **Given** the `envy` binary is on the system PATH, **When** the extension activates, **Then** no error notification appears and the extension initializes normally.

---

### User Story 2 - Vault Sync Status at a Glance (Priority: P2)

A developer is working on a project. At any moment, they can see the sync state of their Envy vault directly in the VS Code status bar — without opening a terminal. They know immediately whether their vault has unsealed changes that need to be committed.

**Why this priority**: The status bar provides passive, always-visible awareness. It is the most immediate value proposition of the extension and requires no user action to benefit from.

**Independent Test**: Open a workspace with an initialized Envy vault. Verify the status bar item appears and reflects the output of `envy status` for that workspace.

**Acceptance Scenarios**:

1. **Given** the workspace has an initialized Envy vault, **When** the extension activates, **Then** a status bar item appears at the bottom right showing the sync state (e.g., "Envy: In Sync", "Envy: Modified", "Envy: Never Sealed").
2. **Given** the status bar item is visible, **When** the user executes any Envy command successfully, **Then** the status bar item refreshes to reflect the new state.
3. **Given** the workspace has no `envy.toml` (vault not initialized), **When** the extension activates, **Then** the status bar item shows a neutral state (e.g., "Envy: Not Initialized").
4. **Given** the `envy` CLI returns an error when checking status, **When** the extension tries to refresh, **Then** the status bar item shows an error indicator without crashing the extension.

---

### User Story 3 - Vault Initialization from the Editor (Priority: P3)

A developer starts a new project and wants to set up Envy without leaving VS Code. They open the Command Palette, run "Envy: Init Vault", and the vault is initialized in the current workspace folder.

**Why this priority**: Initialization is a prerequisite for all other vault operations. It enables the full workflow from within the editor.

**Independent Test**: Open a workspace folder with no `envy.toml`. Run "Envy: Init Vault" from the Command Palette. Verify `envy.toml` is created in the workspace root.

**Acceptance Scenarios**:

1. **Given** a workspace is open with no Envy vault, **When** the user runs "Envy: Init Vault" from the Command Palette, **Then** the vault is initialized in the workspace root and a success notification is shown.
2. **Given** the vault is initialized successfully, **When** the result is shown, **Then** the status bar item updates to reflect the initialized (but empty) vault state.
3. **Given** initialization fails (e.g., vault already exists), **When** the error occurs, **Then** an error notification displays the CLI error message.

---

### User Story 4 - Setting a Secret from the Editor (Priority: P4)

A developer needs to add or update a secret for their project. They run "Envy: Set Secret" from the Command Palette, enter the secret key in an input box, then the secret value in a second input box. The secret is stored in the vault.

**Why this priority**: Setting secrets is the primary write operation and the core of day-to-day Envy usage.

**Independent Test**: Open an initialized workspace. Run "Envy: Set Secret", provide key "TEST_KEY" and value "test_value". Verify the vault now contains the secret (checkable via the envy CLI in terminal).

**Acceptance Scenarios**:

1. **Given** an initialized Envy vault, **When** the user runs "Envy: Set Secret", **Then** VS Code shows an input box prompting for the secret key.
2. **Given** the key input box is shown, **When** the user enters a key and confirms, **Then** a second input box appears prompting for the secret value (with input obscured/masked).
3. **Given** both key and value are provided, **When** the user confirms the value, **Then** the secret is stored and a success notification is shown.
4. **Given** the user cancels either input box, **When** they press Escape, **Then** the operation is cancelled cleanly with no changes to the vault.
5. **Given** the set operation returns an error (e.g., invalid key name), **When** the error occurs, **Then** an error notification displays the CLI error message.

---

### User Story 5 - Reviewing Pending Changes Before Sealing (Priority: P5)

Before committing an updated `envy.enc` artifact, a developer wants to review exactly what secrets have changed since the last seal. They run "Envy: Show Diff" and see the diff output directly in VS Code without switching to a terminal.

**Why this priority**: The diff review is a critical safety step in the GitOps workflow. Surfacing it in the editor reduces friction in the pre-commit review loop.

**Independent Test**: Make a secret change in the vault. Run "Envy: Show Diff" from the Command Palette. Verify the Output Channel opens and shows the diff output.

**Acceptance Scenarios**:

1. **Given** an initialized vault with unsaved changes relative to the artifact, **When** the user runs "Envy: Show Diff", **Then** an Output Channel named "Envy" opens and displays the diff output.
2. **Given** the vault and artifact are in sync (no changes), **When** the user runs "Envy: Show Diff", **Then** the Output Channel shows the "no differences" output.
3. **Given** the diff operation returns an error, **When** the error occurs, **Then** the Output Channel shows the error output and an error notification is displayed.

---

### User Story 6 - Encrypting (Sealing) the Vault from the Editor (Priority: P6)

After reviewing the diff, a developer wants to seal their secrets into `envy.enc`. They run "Envy: Encrypt (Seal)" from the Command Palette. The CLI handles the passphrase prompt and the artifact is updated.

**Why this priority**: Encryption is the final step of the GitOps write cycle. Supporting it in the editor completes the end-to-end workflow.

**Independent Test**: Open an initialized vault with modified secrets. Run "Envy: Encrypt (Seal)". Verify `envy.enc` is created or updated in the workspace root.

**Acceptance Scenarios**:

1. **Given** an initialized vault with changes to seal, **When** the user runs "Envy: Encrypt (Seal)", **Then** the vault is sealed and output is shown in the "Envy" Output Channel.
2. **Given** the seal operation completes successfully, **When** the output is displayed, **Then** a success notification is shown and the status bar item refreshes.
3. **Given** the seal operation fails (e.g., no vault exists), **When** the error occurs, **Then** the Output Channel shows the error and an error notification is shown.

---

### User Story 7 - Decrypting the Vault Artifact from the Editor (Priority: P7)

A developer pulls a repository and wants to restore secrets from the `envy.enc` artifact. They run "Envy: Decrypt" from the Command Palette. The CLI handles the passphrase prompt and the vault is populated.

**Why this priority**: Decryption is the entry point for any developer joining a project with an existing sealed artifact. Completing the workflow symmetry with encryption.

**Independent Test**: Start with an `envy.enc` artifact but an empty vault. Run "Envy: Decrypt". Verify the vault is populated with the expected secrets.

**Acceptance Scenarios**:

1. **Given** an `envy.enc` artifact in the workspace root, **When** the user runs "Envy: Decrypt", **Then** the artifact is decrypted and output is shown in the "Envy" Output Channel.
2. **Given** the decrypt operation completes successfully, **When** the output is displayed, **Then** a success notification is shown and the status bar item refreshes.
3. **Given** the decrypt operation fails (e.g., no `envy.enc` found, wrong passphrase), **When** the error occurs, **Then** the Output Channel shows the error and an error notification is shown.

---

### Edge Cases

- What happens when VS Code is opened with no workspace folder (only a single file)?
- What happens when retrieving status takes a long time (large vault, slow machine)?
- What happens when the user leaves the secret value input box empty?
- What happens when a passphrase-requiring command (`envy encrypt`, `envy decrypt`) is run but there is no interactive terminal available to accept input?
- What happens when the workspace contains multiple project folders, each with their own `envy.toml`?
- What happens when the user runs two Envy commands in rapid succession before the first finishes?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST detect whether the `envy` CLI binary is available on the user's PATH when the extension activates.
- **FR-002**: When the `envy` CLI is not found on activation, the extension MUST show an error notification with an action button that opens the official installation guide.
- **FR-003**: The extension MUST display a persistent status bar item in the bottom-right area of the VS Code window showing the current vault sync state for the open workspace.
- **FR-004**: The status bar item MUST refresh after any Envy command executes successfully.
- **FR-005**: The status bar item MUST reflect a neutral "not initialized" state when the workspace has no Envy vault (`envy.toml` absent).
- **FR-006**: The extension MUST register the command "Envy: Init Vault" accessible via the VS Code Command Palette.
- **FR-007**: The extension MUST register the command "Envy: Set Secret" accessible via the VS Code Command Palette.
- **FR-008**: "Envy: Set Secret" MUST prompt the user for a secret key via a text input box, then prompt for the secret value via a second input box with the value obscured.
- **FR-009**: "Envy: Set Secret" MUST cancel cleanly without modifying the vault if the user dismisses either input box.
- **FR-010**: The extension MUST register the command "Envy: Show Diff" accessible via the VS Code Command Palette.
- **FR-011**: "Envy: Show Diff" MUST display the diff output in a dedicated VS Code Output Channel named "Envy".
- **FR-012**: The extension MUST register the command "Envy: Encrypt (Seal)" accessible via the VS Code Command Palette.
- **FR-013**: The extension MUST register the command "Envy: Decrypt" accessible via the VS Code Command Palette.
- **FR-014**: All commands that produce output MUST route that output to the "Envy" Output Channel.
- **FR-015**: All commands MUST show a VS Code error notification when the underlying vault operation fails, including the error message returned by the CLI.
- **FR-016**: All Envy commands MUST be non-operational (show a clear error or be disabled) when the `envy` CLI is not available on the PATH.

### Key Entities

- **Envy Vault**: The local encrypted secret store for a workspace, identified by `envy.toml` in the workspace root. Has a sync state relative to the sealed artifact.
- **Sync Status**: The state of the vault compared to the `envy.enc` artifact — one of: In Sync, Modified, Never Sealed, Not Initialized, or Error.
- **Sealed Artifact (`envy.enc`)**: The encrypted file committed to version control, produced by the encrypt operation and consumed by the decrypt operation.
- **Secret**: A key-value pair stored in the vault. Keys are environment-variable-style identifiers; values are sensitive strings never displayed in the UI.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can check the vault sync state without switching to the terminal — the status bar item is visible at all times within a workspace.
- **SC-002**: A developer can complete the full "add a secret and seal the vault" workflow (set → diff → encrypt) entirely within VS Code without opening a terminal.
- **SC-003**: When the `envy` CLI is missing, the developer receives an actionable error notification within 2 seconds of VS Code activating in any workspace.
- **SC-004**: All Command Palette operations surface their result (success or failure) within 10 seconds for typical workspaces (under 500 secrets).
- **SC-005**: Zero silent failures — every command either shows a success notification or a human-readable error message.
- **SC-006**: The extension does not crash VS Code or leave it in a broken state under any error condition (CLI not found, vault error, operation failure).

---

## Assumptions

- The `envy` CLI handles passphrase prompts natively via the terminal when invoked from within VS Code. For the MVP, passphrase-requiring commands (`envy encrypt`, `envy decrypt`) rely on the CLI's own terminal interaction behavior.
- The MVP targets the default environment only (no per-environment selection in the UI). Multi-environment support in the Command Palette is a post-MVP enhancement.
- The status bar refreshes on extension activation and after each command execution. Automatic background polling is not part of the MVP.
- A single workspace folder is assumed per VS Code window for the MVP. Multi-root workspace support is deferred.
- The Envy installation guide URL is available and stable at extension release time.

---

## Out of Scope (MVP)

- Environment selection UI (`-e production`, `-e staging`) in any command
- `envy run` integration (injecting secrets into VS Code launch configurations)
- `envy list`, `envy get`, `envy rm` commands
- `.env` migration wizard (`envy migrate`)
- Tree view or webview panel for browsing secrets
- Background polling or file-watcher-based status refresh
- Multi-root workspace support
