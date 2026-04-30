/**
 * src/ui/components/SelectModelModal.tsx
 *
 * Modal triggered by the "Select Model" button in the PropertiesPanel.
 * Renders as a centered overlay at 70vw × 85vh following the editor's
 * visual design system (modal-backdrop, modal classes from app.css).
 *
 * Usage:
 *   <SelectModelModal open={open} onClose={() => setOpen(false)}>
 *     {/* future model-search component goes here *\/}
 *   </SelectModelModal>
 *
 * Closing behaviour:
 *   - Click the ✕ button in the header.
 *   - Click outside the modal (on the backdrop).
 *   - (Future) Escape key can be wired via onKeyDown on the backdrop.
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface SelectModelModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional children — slot for the future model-search component */
  children?: React.ReactNode;
}

export function SelectModelModal({ open, onClose, children }: SelectModelModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onClose();
  }

  return createPortal(
    <div
      className="modal-backdrop select-model-modal__backdrop"
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Select model"
    >
      <div className="modal select-model-modal">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="modal__header">
          <span className="modal__title">Select Model</span>
          <button
            type="button"
            className="modal__close-btn"
            onClick={onClose}
            aria-label="Close select model modal"
          >
            ✕
          </button>
        </header>

        {/* ── Body — slot for future model-search component ─────────── */}
        <div className="modal__body select-model-modal__body">
          {children ?? (
            <p className="select-model-modal__placeholder">
              Model search coming soon...
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
