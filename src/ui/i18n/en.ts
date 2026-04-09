/**
 * src/ui/i18n/en.ts
 *
 * English (en) locale strings for the AgentsFlow UI.
 *
 * # Structure
 *
 * Keys are organised by feature area using a nested namespace pattern.
 * Each leaf value is a plain string.  Interpolation placeholders follow
 * the `{variableName}` convention (resolved at render time by a helper
 * such as `t(key, vars)`).
 *
 * # Namespaces
 *
 *   common                    — shared UI primitives (buttons, labels)
 *   agentProfiling            — strings for the Agent Profiling feature
 *     .modal                  — Profile Manager modal
 *     .fileExplorer           — .md file picker / explorer
 *     .profileList            — profile list inside the modal
 *     .profileEntry           — individual profile row
 *     .selectorDropdown       — selector dropdown options
 *     .errors                 — error messages
 *     .toasts                 — transient success / error toasts
 *
 * # Adding new strings
 *
 * 1. Add the key here under the appropriate namespace.
 * 2. Add matching keys to any other locale files (currently only `en`).
 * 3. Use the key via the `useI18n()` hook or the `t()` helper in JSX.
 *
 * # Future i18n setup
 *
 * This file is designed to be compatible with `i18next` or a lightweight
 * equivalent.  The nested object shape matches the standard resource bundle
 * format; migrating to `i18next` later requires no key changes.
 */

// ── Type ──────────────────────────────────────────────────────────────────

/**
 * Flat-key access helper type.
 * Converts the nested En object into a union of dot-notation key paths.
 *
 * Example: `TranslationKey` includes `"agentProfiling.modal.title"`.
 *
 * Not used at runtime, but enables autocomplete / type-safety at call sites
 * that accept a key string.
 */
type NestedKeys<T, Prefix extends string = ""> = {
  [K in keyof T]: T[K] extends string
    ? `${Prefix}${K & string}`
    : `${Prefix}${K & string}` | NestedKeys<T[K], `${Prefix}${K & string}.`>;
}[keyof T];

// ── Locale object ─────────────────────────────────────────────────────────

export const en = {
  // ── Shared primitives ────────────────────────────────────────────────────
  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    remove: "Remove",
    confirm: "Confirm",
    loading: "Loading…",
    noItems: "No items",
    enabled: "Enabled",
    disabled: "Disabled",
    optional: "(optional)",
    required: "Required",
    unknownError: "An unexpected error occurred.",
  },

  // ── Agent Profiling feature ───────────────────────────────────────────────
  agentProfiling: {
    // ── Profile Manager Modal ───────────────────────────────────────────────
    // Opened from the Properties Panel when the user clicks "Manage Profiles".
    modal: {
      /** Window / dialog title */
      title: "Agent Profiles",
      /** Subtitle shown below the title — {agentName} is interpolated */
      subtitle: "Profiles for {agentName}",
      /** Section heading for the list of existing profiles */
      existingProfiles: "Linked profiles",
      /** Placeholder text when the agent has no profiles */
      emptyState: "No profiles linked yet. Add a document to get started.",
      /** Section heading for the 'Add new profile' form area */
      addSection: "Add profile document",
      /** Primary action button to confirm adding a new profile */
      addButton: "Add profile",
      /** Tooltip / aria-label for the close button */
      closeButton: "Close profiles modal",
      /** Text shown while the profile list is loading */
      loadingProfiles: "Loading profiles…",
    },

    // ── File Explorer ───────────────────────────────────────────────────────
    // Embedded .md file picker opened inside the Add Profile form.
    fileExplorer: {
      /** Section / panel label */
      title: "Select document",
      /** Placeholder shown when no directory is expanded */
      emptyState: "No .md files found in this directory.",
      /** Label above the directory tree */
      directoryTree: "Project folders",
      /** Label above the file list (right panel) */
      fileList: "Documents (.md)",
      /** Button to confirm file selection */
      selectButton: "Select",
      /** Button to cancel file selection and return */
      cancelButton: "Cancel",
      /** Aria-label for a directory expand/collapse toggle */
      toggleDir: "Toggle {dirName}",
      /** Displayed when a directory is loading its contents */
      loadingDir: "Loading…",
      /** Tooltip for the import file button */
      importButton: "Import .md file from disk",
      /** Status text when a file is selected */
      selectedFile: "Selected: {fileName}",
      /** Prompt when no file is selected */
      noFileSelected: "No document selected",
    },

    // ── Profile list ────────────────────────────────────────────────────────
    // The list of AgentProfile entries rendered inside the modal.
    profileList: {
      /** Column header: selector label */
      headerSelector: "Selector",
      /** Column header: document path / label */
      headerDocument: "Document",
      /** Column header: enabled toggle */
      headerEnabled: "Enabled",
      /** Column header: actions (edit / remove) */
      headerActions: "Actions",
      /** Aria-label for the drag handle used for reordering */
      dragHandle: "Drag to reorder",
      /** Screen-reader announcement after a successful reorder */
      reorderSuccess: "Profile order updated.",
    },

    // ── Individual profile row ──────────────────────────────────────────────
    profileEntry: {
      /** Aria-label for the enabled toggle switch: {selector} is interpolated */
      toggleLabel: "Toggle {selector} profile",
      /** Aria-label for the remove button */
      removeLabel: "Remove profile",
      /** Confirmation prompt before removing a profile */
      removeConfirm: "Remove this profile document?",
      /** Aria-label for the edit / rename label button */
      editLabel: "Edit profile label",
      /** Placeholder for the inline label input */
      labelPlaceholder: "Optional label…",
    },

    // ── Selector dropdown ───────────────────────────────────────────────────
    // The <select> used to choose the profile category (selector).
    selectorDropdown: {
      /** Default / placeholder option */
      placeholder: "Select a selector…",
      /** Option labels — these mirror PROFILE_SELECTORS in src/types/agent.ts */
      options: {
        systemPrompt: "System Prompt",
        memory: "Memory",
        tools: "Tools",
        examples: "Examples",
        context: "Context",
        rules: "Rules",
        persona: "Persona",
        custom: "Custom…",
      },
      /** Label shown above the dropdown */
      label: "Selector",
      /** Helper text under the dropdown */
      helperText: "Choose the functional role of this document.",
      /** Aria-label for the selector dropdown */
      ariaLabel: "Profile selector",
    },

    // ── Error messages ──────────────────────────────────────────────────────
    // Displayed in inline error states or error toasts.
    errors: {
      /** File path is missing when trying to add a profile */
      filePathRequired: "Please select a document.",
      /** Selector is missing when trying to add a profile */
      selectorRequired: "Please select a selector.",
      /** The .adata file for the agent was not found */
      agentNotFound: "Agent metadata file not found. Save the project and try again.",
      /** The profile entry was not found (stale UI state) */
      profileNotFound: "Profile not found. Please refresh and try again.",
      /** Generic server / IPC error with message interpolation */
      genericError: "Error: {message}",
      /** Failed to load the profile list */
      loadFailed: "Failed to load profiles. Please try again.",
      /** Failed to add a new profile */
      addFailed: "Failed to add profile: {message}",
      /** Failed to update a profile */
      updateFailed: "Failed to update profile: {message}",
      /** Failed to remove a profile */
      removeFailed: "Failed to remove profile: {message}",
      /** Failed to reorder profiles */
      reorderFailed: "Failed to save new order: {message}",
    },

    // ── Toast notifications ─────────────────────────────────────────────────
    // Short-lived success / info messages shown as floating toasts.
    toasts: {
      /** Profile successfully added */
      addSuccess: "Profile added.",
      /** Profile successfully removed */
      removeSuccess: "Profile removed.",
      /** Profile label successfully updated */
      updateSuccess: "Profile updated.",
      /** Profile list reordered */
      reorderSuccess: "Order saved.",
    },
  },
} as const;

// ── Exports ───────────────────────────────────────────────────────────────

/** All valid dot-notation i18n key paths */
export type TranslationKey = NestedKeys<typeof en>;

/** The full locale type (useful for strict typing of locale objects) */
export type Locale = typeof en;

/**
 * Convenience helper: returns the translation string at a dot-notation path.
 *
 * Supports basic `{placeholder}` interpolation via the optional `vars` map.
 *
 * This is a **minimal** helper for use before a full i18n library is wired up.
 * Replace with `i18next.t()` when the library is integrated.
 *
 * @example
 * ```ts
 * t("agentProfiling.modal.subtitle", { agentName: "Alice" })
 * // → "Profiles for Alice"
 *
 * t("common.save")
 * // → "Save"
 * ```
 */
export function t(
  key: TranslationKey,
  vars?: Record<string, string>,
): string {
  const segments = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = en;
  for (const seg of segments) {
    if (node === null || typeof node !== "object") return key;
    node = node[seg];
  }
  if (typeof node !== "string") return key;

  if (!vars) return node;

  return node.replace(/\{(\w+)\}/g, (_match: string, name: string) => {
    return Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : `{${name}}`;
  });
}
