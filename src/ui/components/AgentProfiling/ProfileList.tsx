/**
 * src/ui/components/AgentProfiling/ProfileList.tsx
 *
 * Renders the list of existing AgentProfile entries inside the modal.
 *
 * Each row shows:
 *   - Selector label (e.g. "System Prompt")
 *   - Document label or filename fallback
 *   - Enabled toggle (calls onToggle)
 *   - Remove button (calls onRemove with confirmation)
 *
 * The list is read-only regarding file selection — re-picking a file
 * is done by removing + re-adding.
 *
 * Props are fully controlled — all mutation calls go UP to the parent modal
 * which owns the IPC interaction.
 */

import React from "react";
import type { BridgeAgentProfile } from "../../../electron/bridge.types.ts";
import { resolveProfileLabel } from "../../utils/agentProfileUtils.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProfileListProps {
  profiles: BridgeAgentProfile[];
  /** Called when the user toggles the enabled state of a profile */
  onToggle: (profileId: string, enabled: boolean) => void;
  /** Called when the user confirms removing a profile */
  onRemove: (profileId: string) => void;
}

// ── ProfileRow ─────────────────────────────────────────────────────────────

interface ProfileRowProps {
  profile: BridgeAgentProfile;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}

function ProfileRow({ profile, onToggle, onRemove }: ProfileRowProps) {
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  const displayLabel = resolveProfileLabel(profile);

  function handleRemoveClick() {
    setConfirmingRemove(true);
  }

  function handleConfirmRemove() {
    setConfirmingRemove(false);
    onRemove();
  }

  function handleCancelRemove() {
    setConfirmingRemove(false);
  }

  return (
    <li className="profile-list__row">
      {/* ── Selector badge ────────────────────────────────────────────── */}
      <span
        className="profile-list__selector"
        title={profile.selector}
      >
        {profile.selector}
      </span>

      {/* ── Document label ────────────────────────────────────────────── */}
      <span
        className="profile-list__label"
        title={profile.filePath}
      >
        {displayLabel}
      </span>

      {/* ── Enabled toggle ────────────────────────────────────────────── */}
      <label
        className="profile-list__toggle"
        title={profile.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
        aria-label={`Toggle ${profile.selector} profile`}
      >
        <input
          type="checkbox"
          className="profile-list__toggle-input"
          checked={profile.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="profile-list__toggle-track" aria-hidden="true">
          <span className="profile-list__toggle-thumb" />
        </span>
      </label>

      {/* ── Remove button / confirm inline ───────────────────────────── */}
      {confirmingRemove ? (
        <span className="profile-list__remove-confirm">
          <span className="profile-list__remove-confirm-msg">Remove?</span>
          <button
            type="button"
            className="btn btn--danger-sm profile-list__remove-yes"
            onClick={handleConfirmRemove}
            aria-label="Confirm remove"
          >
            Yes
          </button>
          <button
            type="button"
            className="btn btn--ghost-sm profile-list__remove-no"
            onClick={handleCancelRemove}
            aria-label="Cancel remove"
          >
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="profile-list__remove-btn"
          onClick={handleRemoveClick}
          aria-label="Remove profile"
          title="Remove profile"
        >
          ✕
        </button>
      )}
    </li>
  );
}

// ── ProfileList ────────────────────────────────────────────────────────────

export function ProfileList({ profiles, onToggle, onRemove }: ProfileListProps) {
  if (profiles.length === 0) {
    return (
      <div className="profile-list__empty">
        No profiles linked yet. Add a document to get started.
      </div>
    );
  }

  return (
    <ul className="profile-list" aria-label="Linked profiles">
      {profiles.map((profile) => (
        <ProfileRow
          key={profile.id}
          profile={profile}
          onToggle={(enabled) => onToggle(profile.id, enabled)}
          onRemove={() => onRemove(profile.id)}
        />
      ))}
    </ul>
  );
}
