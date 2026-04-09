/**
 * src/ui/components/AgentProfiling/AgentProfileModal.tsx
 *
 * Modal for managing agent profiles (linked .md documents).
 *
 * # Layout
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Agent Profiles                                          [✕] │
 *   │  Profiles for {agentName}                                    │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Linked profiles                                             │
 *   │  [System Prompt] system.md              [✓ enabled] [✕]     │
 *   │  [Memory]        memory.md              [✓ enabled] [✕]     │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Add profile document                                        │
 *   │  Selector: [System Prompt ▾]                                │
 *   │  ┌──────────────┬──────────────────────────────────────┐    │
 *   │  │ Dir tree     │  .md file list                        │    │
 *   │  └──────────────┴──────────────────────────────────────┘    │
 *   │  Selected: system-prompt.md          [Add profile]          │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * # IPC flow
 *
 *   1. On open → ADATA_LIST_PROFILES → populate list
 *   2. User picks selector + file → click "Add profile"
 *      → ADATA_ADD_PROFILE → refresh list
 *   3. User toggles enabled → ADATA_UPDATE_PROFILE
 *   4. User removes → ADATA_REMOVE_PROFILE → refresh list
 *
 * # UX constraints (from spec)
 *
 *   - Multiple profiles allowed per agent (no uniqueness constraint)
 *   - Each profile needs selector + filePath to add
 *   - Only files inside behaviors/ are browsable
 *   - All text in English
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { PROFILE_SELECTORS } from "../../../types/agent.ts";
import { buildAddProfileRequest } from "../../utils/agentProfileUtils.ts";
import { ProfileList } from "./ProfileList.tsx";
import { AgentProfileFileExplorer } from "./AgentProfileFileExplorer.tsx";
import type { BridgeAgentProfile } from "../../../electron/bridge.types.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentProfileModalProps {
  /** The agent's UUID */
  agentId: string;
  /** Human-readable agent name (shown in subtitle) */
  agentName: string;
  /** Absolute path to the project root */
  projectDir: string;
  /** Called when the user closes the modal */
  onClose: () => void;
}

// ── AgentProfileModal ──────────────────────────────────────────────────────

export function AgentProfileModal({
  agentId,
  agentName,
  projectDir,
  onClose,
}: AgentProfileModalProps) {
  // ── State ─────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<BridgeAgentProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add-form state
  const [selectedSelector, setSelectedSelector] = useState<string>("");
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; kind: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load profiles on mount / agentId change ────────────────────────
  const loadProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    setLoadError(null);
    try {
      const result = await window.agentsFlow.adataListProfiles({
        projectDir,
        agentId,
      });
      if (result.success) {
        setProfiles(result.profiles);
      } else {
        setLoadError(result.error ?? "Failed to load profiles.");
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load profiles.");
    } finally {
      setIsLoadingProfiles(false);
    }
  }, [agentId, projectDir]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // ── Toast helper ──────────────────────────────────────────────────
  function showToast(msg: string, kind: "success" | "error") {
    setToast({ msg, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // ── Add profile handler ───────────────────────────────────────────
  async function handleAddProfile() {
    if (!selectedSelector) {
      setAddError("Please select a selector.");
      return;
    }
    if (!selectedFilePath) {
      setAddError("Please select a document.");
      return;
    }

    setAddError(null);
    setIsAdding(true);

    try {
      const req = buildAddProfileRequest({
        projectDir,
        agentId,
        selector: selectedSelector,
        filePath: selectedFilePath,
      });
      const result = await window.agentsFlow.adataAddProfile(req);

      if (result.success && result.profiles) {
        setProfiles(result.profiles);
        // Reset form
        setSelectedSelector("");
        setSelectedFilePath("");
        showToast("Profile added.", "success");
      } else {
        const msg = result.error ?? "Failed to add profile.";
        setAddError(msg);
        showToast(`Failed to add profile: ${msg}`, "error");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add profile.";
      setAddError(msg);
      showToast(`Failed to add profile: ${msg}`, "error");
    } finally {
      setIsAdding(false);
    }
  }

  // ── Toggle profile enabled ────────────────────────────────────────
  async function handleToggleProfile(profileId: string, enabled: boolean) {
    try {
      const result = await window.agentsFlow.adataUpdateProfile({
        projectDir,
        agentId,
        profileId,
        patch: { enabled },
      });

      if (result.success && result.profiles) {
        setProfiles(result.profiles);
      } else {
        showToast(result.error ?? "Failed to update profile.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update profile.", "error");
    }
  }

  // ── Remove profile ────────────────────────────────────────────────
  async function handleRemoveProfile(profileId: string) {
    try {
      const result = await window.agentsFlow.adataRemoveProfile({
        projectDir,
        agentId,
        profileId,
      });

      if (result.success && result.profiles) {
        setProfiles(result.profiles);
        showToast("Profile removed.", "success");
      } else {
        showToast(result.error ?? "Failed to remove profile.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove profile.", "error");
    }
  }

  // ── File selection from explorer ──────────────────────────────────
  function handleFileSelect(relativePath: string) {
    setSelectedFilePath(relativePath);
    setAddError(null);
  }

  // ── Close on backdrop click ───────────────────────────────────────
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  // ── Keyboard: Escape to close ─────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className="modal-backdrop agent-profile-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Agent Profiles"
      onClick={handleBackdropClick}
    >
      <div className="modal agent-profile-modal">
        {/* ── Header ────────────────────────────────────────────────── */}
        <header className="modal__header agent-profile-modal__header">
          <div className="agent-profile-modal__header-text">
            <h2 className="modal__title">Agent Profiles</h2>
            <p className="agent-profile-modal__subtitle">
              Profiles for <strong>{agentName}</strong>
            </p>
          </div>
          <button
            className="modal__close-btn"
            onClick={onClose}
            aria-label="Close profiles modal"
            title="Close"
          >
            ✕
          </button>
        </header>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="modal__body agent-profile-modal__body">

          {/* ── Section 1: Existing profiles ────────────────────────── */}
          <section className="agent-profile-modal__section">
            <div className="agent-profile-modal__section-heading">
              Linked profiles
            </div>

            {isLoadingProfiles ? (
              <div className="agent-profile-modal__loading">
                Loading profiles…
              </div>
            ) : loadError ? (
              <div className="agent-profile-modal__error" role="alert">
                {loadError}
              </div>
            ) : (
              <ProfileList
                profiles={profiles}
                onToggle={handleToggleProfile}
                onRemove={handleRemoveProfile}
              />
            )}
          </section>

          {/* ── Divider ───────────────────────────────────────────── */}
          <hr className="agent-profile-modal__divider" />

          {/* ── Section 2: Add new profile ────────────────────────── */}
          <section className="agent-profile-modal__section agent-profile-modal__section--add">
            <div className="agent-profile-modal__section-heading">
              Add profile document
            </div>

            {/* Selector dropdown */}
            <div className="agent-profile-modal__field">
              <label
                className="agent-profile-modal__label"
                htmlFor="profile-selector-select"
              >
                Selector
              </label>
              <select
                id="profile-selector-select"
                className="form-field__select agent-profile-modal__select"
                value={selectedSelector}
                onChange={(e) => {
                  setSelectedSelector(e.target.value);
                  setAddError(null);
                }}
                aria-label="Profile selector"
              >
                <option value="">Select a selector…</option>
                {PROFILE_SELECTORS.map((sel) => (
                  <option key={sel} value={sel}>
                    {sel}
                  </option>
                ))}
              </select>
              {addError && addError.includes("selector") && (
                <span className="agent-profile-modal__field-error" role="alert">
                  {addError}
                </span>
              )}
            </div>

            {/* File explorer */}
            <div className="agent-profile-modal__explorer-wrap">
              <AgentProfileFileExplorer
                projectRoot={projectDir}
                selectedPath={selectedFilePath}
                onSelect={handleFileSelect}
              />
            </div>

            {/* Selected file path display */}
            {selectedFilePath && (
              <div className="agent-profile-modal__selected-path">
                <code>{selectedFilePath}</code>
              </div>
            )}

            {/* Add error (generic) */}
            {addError && !addError.includes("selector") && (
              <span className="agent-profile-modal__field-error" role="alert">
                {addError}
              </span>
            )}

            {/* Add button */}
            <button
              type="button"
              className="btn btn--primary agent-profile-modal__add-btn"
              onClick={handleAddProfile}
              disabled={isAdding || !selectedSelector || !selectedFilePath}
              aria-busy={isAdding}
            >
              {isAdding ? "Adding…" : "Add profile"}
            </button>
          </section>
        </div>
      </div>

      {/* ── Floating toast ────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`agent-graph-toast agent-graph-toast--${toast.kind}`}
          role="status"
          aria-live="polite"
        >
          <span>{toast.msg}</span>
          <button
            className="agent-graph-toast__close"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
