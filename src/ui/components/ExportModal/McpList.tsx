/**
 * src/ui/components/ExportModal/McpList.tsx
 *
 * Lista de MCPs con toggle enable/disable, selección para editar y
 * confirmación de eliminación inline (sin window.confirm).
 */

import React from "react";
import type { McpEntry } from "./export-logic.ts";

export interface McpListProps {
  mcps: McpEntry[];
  selectedLocalId: string | null;
  deleteConfirmLocalId: string | null;
  onSelect: (localId: string) => void;
  onToggle: (localId: string) => void;
  onDeleteRequest: (localId: string) => void;
  onDeleteConfirm: (localId: string) => void;
  onDeleteCancel: () => void;
}

export function McpList({
  mcps,
  selectedLocalId,
  deleteConfirmLocalId,
  onSelect,
  onToggle,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: McpListProps) {
  if (mcps.length === 0) {
    return (
      <div className="export-modal__mcp-list-empty">
        No MCPs configured yet.
      </div>
    );
  }

  return (
    <div className="export-modal__mcp-list">
      {mcps.map((mcp) => {
        const isSelected = mcp.localId === selectedLocalId;
        const isConfirmingDelete = mcp.localId === deleteConfirmLocalId;

        return (
          <div key={mcp.localId}>
            <button
              className={[
                "export-modal__mcp-item",
                isSelected ? "export-modal__mcp-item--active" : "",
                !mcp.enabled ? "export-modal__mcp-item--disabled" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onSelect(mcp.localId)}
              aria-label={`Select MCP ${mcp.name}`}
              title={mcp.name}
            >
              {/* Status dot */}
              <span
                className={`export-modal__mcp-status-dot ${
                  mcp.enabled
                    ? "export-modal__mcp-status-dot--enabled"
                    : "export-modal__mcp-status-dot--disabled"
                }`}
                aria-hidden="true"
              />

              {/* Name */}
              <span className="export-modal__mcp-item-name">{mcp.name}</span>

              {/* Type badge */}
              <span className="export-modal__mcp-type-badge">{mcp.type}</span>

              {/* Actions */}
              <span className="export-modal__mcp-item-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="export-modal__mcp-icon-btn"
                  onClick={() => onToggle(mcp.localId)}
                  aria-label={mcp.enabled ? `Disable MCP ${mcp.name}` : `Enable MCP ${mcp.name}`}
                  title={mcp.enabled ? "Disable" : "Enable"}
                >
                  {mcp.enabled ? "●" : "○"}
                </button>
                <button
                  className="export-modal__mcp-icon-btn export-modal__mcp-icon-btn--danger"
                  onClick={() => onDeleteRequest(mcp.localId)}
                  aria-label={`Delete MCP ${mcp.name}`}
                  title="Delete"
                >
                  ✕
                </button>
              </span>
            </button>

            {/* Inline delete confirmation */}
            {isConfirmingDelete && (
              <div className="export-modal__mcp-delete-confirm" role="alert">
                <span>Delete &ldquo;{mcp.name}&rdquo;?</span>
                <button
                  className="export-modal__mcp-delete-confirm-btn"
                  onClick={() => onDeleteConfirm(mcp.localId)}
                  aria-label={`Confirm delete MCP ${mcp.name}`}
                >
                  Delete
                </button>
                <button
                  className="export-modal__mcp-cancel-btn"
                  onClick={onDeleteCancel}
                  aria-label="Cancel delete"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
