/**
 * src/ui/components/ExportModal/McpAdminTab.tsx
 *
 * Administrador de MCPs para la pestaña "MCPs" del ExportModal.
 * Layout: lista a la izquierda + formulario a la derecha.
 * CRUD completo: agregar, editar, eliminar, habilitar/deshabilitar.
 */

import React, { useState, useCallback, useEffect } from "react";
import type { McpEntry } from "./export-logic.ts";
import { validateMcpEntry } from "./export-logic.ts";
import type { McpValidationResult } from "./export-logic.ts";
import { McpList } from "./McpList.tsx";
import { McpForm } from "./McpForm.tsx";

// ── Counter for stable localIds ────────────────────────────────────────────
let _mcpIdCounter = 0;
function makeMcpLocalId(): string {
  return `mcp-${Date.now()}-${++_mcpIdCounter}`;
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface McpAdminTabProps {
  mcps: McpEntry[];
  onAdd: (entry: McpEntry) => void;
  onUpdate: (localId: string, updated: McpEntry) => void;
  onDelete: (localId: string) => void;
  onToggle: (localId: string) => void;
}

// ── Form mode ──────────────────────────────────────────────────────────────

type FormMode = "idle" | "new" | "edit";

// ── Component ──────────────────────────────────────────────────────────────

export function McpAdminTab({
  mcps,
  onAdd,
  onUpdate,
  onDelete,
  onToggle,
}: McpAdminTabProps) {
  const [formMode, setFormMode] = useState<FormMode>("idle");
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [deleteConfirmLocalId, setDeleteConfirmLocalId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<McpEntry>>({});
  const [validation, setValidation] = useState<McpValidationResult | null>(null);

  // Re-validate whenever draft changes
  useEffect(() => {
    if (formMode === "idle") {
      setValidation(null);
      return;
    }
    const currentName = formMode === "edit"
      ? mcps.find((m) => m.localId === editingLocalId)?.name
      : undefined;
    const result = validateMcpEntry(draft, mcps, currentName);
    setValidation(result);
  }, [draft, formMode, mcps, editingLocalId]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleAddClick = useCallback(() => {
    setFormMode("new");
    setEditingLocalId(null);
    setDeleteConfirmLocalId(null);
    setDraft({
      type: "local",
      name: "",
      enabled: true,
      command: [""],
      environment: {},
    });
  }, []);

  const handleSelectMcp = useCallback((localId: string) => {
    const mcp = mcps.find((m) => m.localId === localId);
    if (!mcp) return;
    setFormMode("edit");
    setEditingLocalId(localId);
    setDeleteConfirmLocalId(null);
    setDraft({ ...mcp });
  }, [mcps]);

  const handleDraftChange = useCallback((updated: Partial<McpEntry>) => {
    setDraft(updated);
  }, []);

  const handleSave = useCallback(() => {
    if (!validation?.isValid) return;

    if (formMode === "new") {
      const newEntry: McpEntry = {
        ...draft,
        localId: makeMcpLocalId(),
        enabled: draft.enabled ?? true,
      } as McpEntry;
      onAdd(newEntry);
      setFormMode("idle");
      setDraft({});
    } else if (formMode === "edit" && editingLocalId) {
      const updated: McpEntry = {
        ...draft,
        localId: editingLocalId,
      } as McpEntry;
      onUpdate(editingLocalId, updated);
      setFormMode("idle");
      setEditingLocalId(null);
      setDraft({});
    }
  }, [validation, formMode, draft, editingLocalId, onAdd, onUpdate]);

  const handleCancel = useCallback(() => {
    setFormMode("idle");
    setEditingLocalId(null);
    setDraft({});
  }, []);

  const handleDeleteRequest = useCallback((localId: string) => {
    setDeleteConfirmLocalId(localId);
  }, []);

  const handleDeleteConfirm = useCallback((localId: string) => {
    onDelete(localId);
    setDeleteConfirmLocalId(null);
    // If we were editing this MCP, close the form
    if (editingLocalId === localId) {
      setFormMode("idle");
      setEditingLocalId(null);
      setDraft({});
    }
  }, [onDelete, editingLocalId]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmLocalId(null);
  }, []);

  const existingNames = mcps.map((m) => m.name);

  return (
    <div className="export-modal__mcp-layout">

      {/* ── Left panel: list ──────────────────────────────────────────── */}
      <div className="export-modal__mcp-list-panel">
        <div className="export-modal__mcp-list-header">
          <span className="export-modal__label">MCPs</span>
          <button
            className="export-modal__add-plugin-btn"
            onClick={handleAddClick}
            title="Add a new MCP"
          >
            + Add MCP
          </button>
        </div>

        <McpList
          mcps={mcps}
          selectedLocalId={editingLocalId}
          deleteConfirmLocalId={deleteConfirmLocalId}
          onSelect={handleSelectMcp}
          onToggle={onToggle}
          onDeleteRequest={handleDeleteRequest}
          onDeleteConfirm={handleDeleteConfirm}
          onDeleteCancel={handleDeleteCancel}
        />
      </div>

      {/* ── Right panel: form or empty state ──────────────────────────── */}
      <div className="export-modal__mcp-form-area">
        {formMode === "idle" ? (
          <div className="export-modal__mcp-form-empty">
            {mcps.length === 0
              ? "No MCPs configured. Click '+ Add MCP' to add one."
              : "Select an MCP to edit, or click '+ Add MCP' to create a new one."}
          </div>
        ) : (
          <McpForm
            draft={draft}
            mode={formMode === "new" ? "new" : "edit"}
            existingNames={existingNames}
            onChange={handleDraftChange}
            onSave={handleSave}
            onCancel={handleCancel}
            validation={validation}
          />
        )}
      </div>

    </div>
  );
}
