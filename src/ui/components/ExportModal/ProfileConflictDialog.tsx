/**
 * src/ui/components/ExportModal/ProfileConflictDialog.tsx
 *
 * Modal dialog displayed when an agent profile .md file already exists at the
 * export destination and the user must decide whether to overwrite it.
 *
 * # Trigger
 *
 *   Rendered inline inside ExportModal when `profileConflictPrompt` is non-null.
 *   The dialog is shown as an overlay above the modal during the unified
 *   handleExport flow (after skills export completes).
 *
 * # Actions
 *
 *   Replace This  — replace only the current conflicting file, continue asking
 *   Replace All   — replace this file AND all remaining conflicts silently
 *   Cancel        — abort the entire profiles export immediately
 *
 * # Props
 *
 *   prompt    The conflict prompt received from the main process.
 *             Contains: promptId, agentName, destinationPath.
 *   onAction  Called with the user's chosen action. Parent is responsible for
 *             forwarding the response to the main process via respondProfileConflict().
 *
 * # Accessibility
 *
 *   - role="dialog" + aria-modal="true"
 *   - aria-labelledby points to the dialog title
 *   - Buttons have descriptive title attributes
 */

import React from "react";
import type { ExportProfileConflictPrompt, ExportProfileConflictAction } from "../../../electron/bridge.types.ts";

// ── Props ──────────────────────────────────────────────────────────────────

export interface ProfileConflictDialogProps {
  /** The conflict prompt sent by the main process. null = dialog hidden. */
  prompt: ExportProfileConflictPrompt | null;
  /** Called when the user selects an action. */
  onAction: (action: ExportProfileConflictAction) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ProfileConflictDialog({ prompt, onAction }: ProfileConflictDialogProps) {
  if (!prompt) return null;

  const { agentName, destinationPath } = prompt;

  // Show just the filename portion of the destination path for readability
  const fileName = destinationPath.split("/").pop() ?? destinationPath;

  return (
    <div
      className="profile-conflict-dialog__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-conflict-dialog-title"
    >
      <div className="profile-conflict-dialog__container">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="profile-conflict-dialog__header">
          <h2
            id="profile-conflict-dialog-title"
            className="profile-conflict-dialog__title"
          >
            Profile file already exists
          </h2>
        </div>

        {/* ── Message ──────────────────────────────────────────────── */}
        <div className="profile-conflict-dialog__body">
          <p className="profile-conflict-dialog__message">
            <code className="profile-conflict-dialog__path">{fileName}</code>
            {" "}for agent <strong>{agentName}</strong> ya existe. ¿Reemplazar?
          </p>
        </div>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <div className="profile-conflict-dialog__actions">
          <button
            className="profile-conflict-dialog__btn profile-conflict-dialog__btn--replace"
            onClick={() => onAction("replace")}
            title="Replace this profile file and continue asking for subsequent conflicts"
            autoFocus
          >
            Replace This
          </button>
          <button
            className="profile-conflict-dialog__btn profile-conflict-dialog__btn--replace-all"
            onClick={() => onAction("replace-all")}
            title="Replace this and all remaining conflicting profile files without asking again"
          >
            Replace All
          </button>
          <button
            className="profile-conflict-dialog__btn profile-conflict-dialog__btn--cancel"
            onClick={() => onAction("cancel")}
            title="Cancel the entire profiles export"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
