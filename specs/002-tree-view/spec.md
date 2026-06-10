# Feature Specification: Envy Tree View

**Feature Branch**: `002-tree-view`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: User description: "Create the specification for the Envy Tree View. We need a side-panel explorer in VS Code that lists all the secret keys currently in the vault. Rules: 1. Use the existing cli.ts to fetch the keys. 2. Only show keys, NEVER values by default. 3. Include inline actions (icons) on each key to copy the key name or trigger the existing setSecret command. Branch name: 002-tree-view."

## Context

The Envy VS Code Extension currently exposes vault operations through the Command Palette. Developers have no visual overview of what secrets their vault contains — they must run CLI commands in a terminal to inspect key names. This feature adds a persistent side-panel explorer (tree view) that lists all secret keys so developers can see, copy, and update secrets without leaving the editor.

**Architecture Constraint**: The tree view is a pure UI layer over the existing CLI integration. It must use the same `envy` binary delegation already established in the extension. It must never read, display, or copy secret values.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browse Secret Keys in the Side Panel (Priority: P1)

A developer opens a workspace with an initialized Envy vault. In the VS Code Explorer side panel, an "Envy Secrets" section appears listing every key currently stored in the vault. The developer can see the full inventory of secrets at a glance without typing any commands.

**Why this priority**: A readable, always-visible list of keys is the core value of this feature. All other interactions (copy, edit) depend on keys being displayed first. Without this, the feature delivers zero value.

**Independent Test**: Open a workspace with an initialized vault containing at least two secrets. Verify the "Envy Secrets" panel appears in the VS Code sidebar and lists all key names. Confirm no values appear anywhere in the panel.

**Acceptance Scenarios**:

1. **Given** an initialized vault with at least one secret, **When** the workspace is opened, **Then** the "Envy Secrets" panel appears in the VS Code sidebar listing each key on its own row.
2. **Given** the panel is showing keys, **When** the developer inspects any row, **Then** only the key name is visible — no values, passwords, or masked characters appear.
3. **Given** an initialized vault with no secrets, **When** the panel loads, **Then** an empty-state message is shown (e.g., "No secrets found. Use 'Envy: Set Secret' to add one.").
4. **Given** a workspace with no `envy.toml` (vault not initialized), **When** the panel loads, **Then** a message is shown indicating the vault is not initialized (e.g., "Vault not initialized. Run 'Envy: Init Vault' to get started.").
5. **Given** the `envy` CLI is not available on the PATH, **When** the panel loads, **Then** the panel shows an appropriate unavailable state without crashing.

---

### User Story 2 — Copy a Key Name with One Click (Priority: P2)

A developer sees a key in the Envy Secrets panel and wants to reference it in their code. They click the copy icon next to the key name and the key is immediately available in their clipboard — ready to paste as an environment variable reference.

**Why this priority**: Copying key names is the most frequent read-only interaction. Developers reference key names constantly when writing code that reads environment variables. One-click copy removes the need to memorize or retype key names.

**Independent Test**: Open a vault with at least one key. Hover over a key row in the panel to reveal the copy icon. Click it. Paste into a text editor. Verify only the key name (not the value) was copied.

**Acceptance Scenarios**:

1. **Given** the panel lists at least one key, **When** the developer hovers over a key row, **Then** a copy icon becomes visible on that row.
2. **Given** the copy icon is visible, **When** the developer clicks it, **Then** the key name is written to the system clipboard.
3. **Given** the copy action succeeds, **When** the developer pastes into any editor, **Then** only the key name appears (e.g., `DATABASE_URL`) — the value is never copied.
4. **Given** the copy action succeeds, **When** the clipboard is updated, **Then** a brief confirmation feedback is shown (e.g., inline icon state change or a transient notification).

---

### User Story 3 — Update a Secret Value Directly from the Tree (Priority: P3)

A developer sees an outdated secret in the Envy Secrets panel. They click the edit icon next to the key and the existing "Envy: Set Secret" flow opens, pre-populated with that key name so they only need to enter the new value.

**Why this priority**: Editing a secret from the key list is the natural next step after browsing. Triggering the existing Set Secret command from the tree reuses established, trusted UI without duplicating logic. It closes the browsing-to-editing loop without a terminal.

**Independent Test**: Open a vault with at least one key. Hover over a key row to reveal the edit icon. Click it. Verify the Set Secret input flow opens with the key name pre-filled in the first input box. Enter a new value and confirm. Verify the secret is updated.

**Acceptance Scenarios**:

1. **Given** the panel lists at least one key, **When** the developer hovers over a key row, **Then** an edit icon becomes visible on that row alongside the copy icon.
2. **Given** the edit icon is visible, **When** the developer clicks it, **Then** the "Envy: Set Secret" input flow is triggered with the key name already populated.
3. **Given** the Set Secret flow opens pre-populated, **When** the developer provides a new value and confirms, **Then** the secret is updated in the vault.
4. **Given** the developer cancels the Set Secret flow, **When** they press Escape, **Then** no change is made to the vault and the panel remains unchanged.

---

### User Story 4 — Keep the Panel Up to Date (Priority: P4)

After setting a secret or initializing a vault, the developer sees the Envy Secrets panel automatically reflect the new state — without manually triggering a refresh. A refresh button in the panel header is also available for manual control.

**Why this priority**: A stale list is worse than no list. Developers trust what the panel shows; if it does not update after writes, it becomes unreliable. Auto-refresh after write operations and a manual refresh escape hatch together cover the full reliability requirement.

**Independent Test**: Add a new secret via "Envy: Set Secret". Verify the new key appears in the panel without manually pressing refresh. Then press the panel's refresh button. Verify the list reloads.

**Acceptance Scenarios**:

1. **Given** the panel is open, **When** a vault write operation completes (e.g., "Envy: Set Secret" succeeds), **Then** the panel automatically reloads and shows the updated key list.
2. **Given** the panel is open, **When** "Envy: Init Vault" completes successfully, **Then** the panel transitions from the "not initialized" state to listing the (empty) vault.
3. **Given** the panel is open at any time, **When** the developer clicks the refresh button in the panel header, **Then** the panel reloads the key list from the vault.
4. **Given** a refresh is in progress, **When** the panel is reloading, **Then** a loading indicator is shown so the developer knows the list is updating.

---

### Edge Cases

- What happens when the vault contains a very large number of secrets (e.g., 500+ keys)?
- What happens when a key name contains special characters or spaces?
- What happens when two write operations complete in rapid succession — does the panel update correctly?
- What happens when the vault is modified externally (CLI in terminal) while the panel is open?
- What happens when the workspace has multiple root folders, each with their own `envy.toml`?
- What happens when the copy-to-clipboard operation fails (e.g., clipboard access denied by the OS)?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST provide a tree view panel in the VS Code sidebar under a view container named "Envy Secrets".
- **FR-002**: The tree view MUST display all secret key names currently in the vault, each as a separate row.
- **FR-003**: The tree view MUST never display, hint at, or copy secret values under any circumstance.
- **FR-004**: The tree view MUST use the existing CLI integration (the `envy` binary via the established executor) to retrieve the list of keys — no new vault access logic may be introduced.
- **FR-005**: Each key row MUST show an inline "Copy Key" action (icon button) that writes the key name to the system clipboard when clicked.
- **FR-006**: Each key row MUST show an inline "Edit Secret" action (icon button) that triggers the existing "Envy: Set Secret" command with the key name pre-populated.
- **FR-007**: The tree view MUST show an empty-state message when the vault is initialized but contains no secrets.
- **FR-008**: The tree view MUST show a "not initialized" message when no `envy.toml` is present in the workspace.
- **FR-009**: The tree view MUST show an appropriate unavailable message when the `envy` CLI is not found, consistent with the existing CLI detection behavior.
- **FR-010**: The tree view MUST provide a refresh action in the panel header that reloads the key list on demand.
- **FR-011**: The tree view MUST automatically reload after any vault write operation (Set Secret, Init Vault) completes successfully within the extension.
- **FR-012**: The tree view MUST show a loading indicator while the key list is being fetched.

### Key Entities

- **Secret Key**: A single environment-variable-style identifier stored in the vault (e.g., `DATABASE_URL`). Has no value visible in the UI.
- **Tree Item**: A row in the Envy Secrets panel representing one Secret Key, with inline Copy and Edit actions.
- **Panel State**: One of — Loading, Keys Listed, Empty Vault, Not Initialized, CLI Unavailable.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can see the full list of vault key names without opening a terminal or running any command — the panel is visible passively on workspace open.
- **SC-002**: A developer can copy a key name to the clipboard in a single click with no additional keystrokes.
- **SC-003**: A developer can start editing an existing secret's value in under 5 seconds from seeing the key in the panel.
- **SC-004**: The panel updates to reflect vault changes within 3 seconds after any write operation completes through the extension.
- **SC-005**: Zero secret values are ever written to the clipboard, shown in the panel, or logged anywhere in the extension.
- **SC-006**: The panel renders correctly and without performance degradation for vaults with up to 500 secrets.

---

## Assumptions

- The `envy` CLI provides a subcommand to list key names without requiring a passphrase (equivalent to `envy list` or similar). If listing requires decryption, this spec will need revision.
- The Edit Secret inline action reuses the existing "Envy: Set Secret" two-step input flow with the key name pre-populated. No new input UI is designed for this feature.
- The tree view appears as a section within the built-in VS Code Explorer sidebar, not as a new dedicated sidebar icon.
- A single workspace folder is assumed per VS Code window. Multi-root workspace support is deferred.
- Automatic refresh on external vault changes (e.g., CLI edits in a terminal) is out of scope; only write operations initiated through the extension trigger auto-refresh.

---

## Out of Scope

- Displaying or revealing secret values (even behind a "click to reveal" toggle)
- Deleting secrets from the tree view
- Renaming keys from the tree view
- Drag-and-drop reordering of keys
- Grouping or filtering keys (e.g., by prefix or environment)
- Environment selection (`-e production`) in the tree view
- Searching or filtering the key list
- Background polling or file-watcher-based refresh
- Multi-root workspace support
