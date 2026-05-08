/**
 * src/ui/components/ExportModal/McpForm.tsx
 *
 * Formulario de creación/edición de un MCP con campos dinámicos según type.
 * Validación en tiempo real. Botones Save / Cancel.
 */

import React from "react";
import type { McpEntry, McpLocalEntry, McpRemoteEntry, McpValidationResult } from "./export-logic.ts";

export interface McpFormProps {
  draft: Partial<McpEntry>;
  mode: "new" | "edit";
  existingNames: string[];
  onChange: (updated: Partial<McpEntry>) => void;
  onSave: () => void;
  onCancel: () => void;
  validation: McpValidationResult | null;
}

// ── Key-value pair editor ──────────────────────────────────────────────────

interface KvEditorProps {
  pairs: Record<string, string>;
  addLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  onChange: (pairs: Record<string, string>) => void;
  idPrefix: string;
}

function KvEditor({ pairs, addLabel, keyPlaceholder = "key", valuePlaceholder = "value", onChange, idPrefix }: KvEditorProps) {
  const entries = Object.entries(pairs);

  const handleKeyChange = (idx: number, newKey: string) => {
    const next: Record<string, string> = {};
    entries.forEach(([k, v], i) => {
      next[i === idx ? newKey : k] = v;
    });
    onChange(next);
  };

  const handleValueChange = (idx: number, newVal: string) => {
    const next: Record<string, string> = {};
    entries.forEach(([k, v], i) => {
      next[k] = i === idx ? newVal : v;
    });
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    const next: Record<string, string> = {};
    entries.forEach(([k, v], i) => {
      if (i !== idx) next[k] = v;
    });
    onChange(next);
  };

  const handleAdd = () => {
    onChange({ ...pairs, "": "" });
  };

  return (
    <div className="export-modal__mcp-kv-editor">
      {entries.map(([k, v], idx) => (
        <div key={idx} className="export-modal__mcp-kv-row">
          <input
            id={`${idPrefix}-key-${idx}`}
            className="export-modal__mcp-kv-input"
            type="text"
            value={k}
            placeholder={keyPlaceholder}
            onChange={(e) => handleKeyChange(idx, e.target.value)}
            aria-label={`${keyPlaceholder} ${idx + 1}`}
          />
          <input
            id={`${idPrefix}-val-${idx}`}
            className="export-modal__mcp-kv-input"
            type="text"
            value={v}
            placeholder={valuePlaceholder}
            onChange={(e) => handleValueChange(idx, e.target.value)}
            aria-label={`${valuePlaceholder} ${idx + 1}`}
          />
          <button
            className="export-modal__mcp-icon-btn export-modal__mcp-icon-btn--danger"
            onClick={() => handleRemove(idx)}
            aria-label={`Remove ${keyPlaceholder} ${idx + 1}`}
            title="Remove"
            type="button"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="export-modal__mcp-add-kv-btn"
        onClick={handleAdd}
        type="button"
      >
        + {addLabel}
      </button>
    </div>
  );
}

// ── Array editor (for command) ─────────────────────────────────────────────

interface ArrayEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
}

function ArrayEditor({ items, onChange }: ArrayEditorProps) {
  const handleChange = (idx: number, val: string) => {
    const next = items.map((v, i) => (i === idx ? val : v));
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    onChange([...items, ""]);
  };

  return (
    <div className="export-modal__mcp-array-editor">
      {items.map((item, idx) => (
        <div key={idx} className="export-modal__mcp-array-row">
          <input
            id={`mcp-cmd-${idx}`}
            className="export-modal__mcp-kv-input"
            type="text"
            value={item}
            placeholder={idx === 0 ? "executable (e.g. npx)" : "argument"}
            onChange={(e) => handleChange(idx, e.target.value)}
            aria-label={idx === 0 ? "Command executable" : `Command argument ${idx}`}
          />
          <button
            className="export-modal__mcp-icon-btn export-modal__mcp-icon-btn--danger"
            onClick={() => handleRemove(idx)}
            aria-label={`Remove argument ${idx}`}
            title="Remove"
            type="button"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="export-modal__mcp-add-kv-btn"
        onClick={handleAdd}
        type="button"
      >
        + Add arg
      </button>
    </div>
  );
}

// ── McpForm ────────────────────────────────────────────────────────────────

export function McpForm({
  draft,
  mode,
  onChange,
  onSave,
  onCancel,
  validation,
}: McpFormProps) {
  const currentType = draft.type ?? "local";

  const handleTypeChange = (newType: "local" | "remote") => {
    if (newType === currentType) return;
    // Clear type-specific fields when switching
    if (newType === "local") {
      const { url: _url, headers: _headers, ...rest } = draft as Partial<McpRemoteEntry>;
      void _url; void _headers;
      onChange({ ...rest, type: "local", command: [], environment: {} });
    } else {
      const { command: _cmd, environment: _env, ...rest } = draft as Partial<McpLocalEntry>;
      void _cmd; void _env;
      onChange({ ...rest, type: "remote", url: "", headers: {} });
    }
  };

  const handleCommandChange = (items: string[]) => {
    onChange({ ...draft, command: items } as Partial<McpLocalEntry>);
  };

  const handleEnvironmentChange = (pairs: Record<string, string>) => {
    onChange({ ...draft, environment: pairs } as Partial<McpLocalEntry>);
  };

  const handleUrlChange = (url: string) => {
    onChange({ ...draft, url } as Partial<McpRemoteEntry>);
  };

  const handleHeadersChange = (pairs: Record<string, string>) => {
    onChange({ ...draft, headers: pairs } as Partial<McpRemoteEntry>);
  };

  const handleTimeoutChange = (val: string) => {
    const num = parseInt(val, 10);
    onChange({ ...draft, timeout: isNaN(num) ? undefined : num });
  };

  const handleEnabledToggle = () => {
    onChange({ ...draft, enabled: !(draft.enabled ?? true) });
  };

  const localDraft = draft as Partial<McpLocalEntry>;
  const remoteDraft = draft as Partial<McpRemoteEntry>;
  const isEnabled = draft.enabled ?? true;
  const timeoutDefault = currentType === "local" ? "30000" : "10000";

  return (
    <div className="export-modal__mcp-form-panel">
      <div className="export-modal__panel-label">
        {mode === "new" ? "New MCP" : `Edit: ${draft.name || "…"}`}
      </div>

      {/* ── Name ──────────────────────────────────────────────────────── */}
      <div className="export-modal__field-row">
        <label className="export-modal__label" htmlFor="mcp-form-name">
          Name
        </label>
        <input
          id="mcp-form-name"
          className={`export-modal__text-input${validation?.nameError ? " export-modal__text-input--error" : ""}`}
          type="text"
          value={draft.name ?? ""}
          placeholder="my-mcp-server"
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          aria-describedby={validation?.nameError ? "mcp-name-error" : undefined}
        />
        {validation?.nameError && (
          <span id="mcp-name-error" className="export-modal__mcp-field-error">{validation.nameError}</span>
        )}
      </div>

      {/* ── Type toggle ───────────────────────────────────────────────── */}
      <div className="export-modal__field-row">
        <label className="export-modal__label">Type</label>
        <div className="export-modal__mcp-type-toggle">
          <button
            type="button"
            className={`export-modal__mcp-type-btn${currentType === "local" ? " export-modal__mcp-type-btn--active" : ""}`}
            onClick={() => handleTypeChange("local")}
            aria-pressed={currentType === "local"}
          >
            local
          </button>
          <button
            type="button"
            className={`export-modal__mcp-type-btn${currentType === "remote" ? " export-modal__mcp-type-btn--active" : ""}`}
            onClick={() => handleTypeChange("remote")}
            aria-pressed={currentType === "remote"}
          >
            remote
          </button>
        </div>
      </div>

      {/* ── Enabled toggle ────────────────────────────────────────────── */}
      <div className="export-modal__field-row">
        <label className="export-modal__label">Enabled</label>
        <div className="export-modal__switch-row">
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            className={`export-modal__switch${isEnabled ? " export-modal__switch--on" : ""}`}
            onClick={handleEnabledToggle}
            title="Toggle enabled"
          >
            {isEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* ── Local fields ──────────────────────────────────────────────── */}
      {currentType === "local" && (
        <>
          <div className="export-modal__field-row">
            <label className="export-modal__label" htmlFor="mcp-cmd-0">
              Command
            </label>
            <ArrayEditor
              items={localDraft.command ?? [""]}
              onChange={handleCommandChange}
            />
            {validation?.commandError && (
              <span className="export-modal__mcp-field-error">{validation.commandError}</span>
            )}
            {validation?.commandWarning && (
              <span className="export-modal__mcp-field-warning">⚠ {validation.commandWarning}</span>
            )}
          </div>

          <div className="export-modal__field-row">
            <label className="export-modal__label">Environment</label>
            <KvEditor
              pairs={localDraft.environment ?? {}}
              addLabel="Add var"
              keyPlaceholder="VAR_NAME"
              valuePlaceholder="value"
              onChange={handleEnvironmentChange}
              idPrefix="mcp-env"
            />
            {validation?.envError && (
              <span className="export-modal__mcp-field-error">{validation.envError}</span>
            )}
          </div>
        </>
      )}

      {/* ── Remote fields ─────────────────────────────────────────────── */}
      {currentType === "remote" && (
        <>
          <div className="export-modal__field-row">
            <label className="export-modal__label" htmlFor="mcp-form-url">
              URL
            </label>
            <input
              id="mcp-form-url"
              className={`export-modal__text-input${validation?.urlError ? " export-modal__text-input--error" : ""}`}
              type="text"
              value={remoteDraft.url ?? ""}
              placeholder="https://mcp.example.com/sse"
              onChange={(e) => handleUrlChange(e.target.value)}
              aria-describedby={validation?.urlError ? "mcp-url-error" : undefined}
            />
            {validation?.urlError && (
              <span id="mcp-url-error" className="export-modal__mcp-field-error">{validation.urlError}</span>
            )}
            {validation?.urlWarning && (
              <span className="export-modal__mcp-field-warning">⚠ {validation.urlWarning}</span>
            )}
          </div>

          <div className="export-modal__field-row">
            <label className="export-modal__label">Headers</label>
            <KvEditor
              pairs={remoteDraft.headers ?? {}}
              addLabel="Add header"
              keyPlaceholder="Header-Name"
              valuePlaceholder="value"
              onChange={handleHeadersChange}
              idPrefix="mcp-hdr"
            />
            {validation?.headersError && (
              <span className="export-modal__mcp-field-error">{validation.headersError}</span>
            )}
            {validation?.headersWarning && (
              <span className="export-modal__mcp-field-warning">{validation.headersWarning}</span>
            )}
          </div>
        </>
      )}

      {/* ── Timeout ───────────────────────────────────────────────────── */}
      <div className="export-modal__field-row">
        <label className="export-modal__label" htmlFor="mcp-form-timeout">
          Timeout (ms)
        </label>
        <input
          id="mcp-form-timeout"
          className="export-modal__text-input"
          type="number"
          min={0}
          value={draft.timeout ?? ""}
          placeholder={`${timeoutDefault} (recommended${currentType === "local" ? " for npx" : ""})`}
          onChange={(e) => handleTimeoutChange(e.target.value)}
          aria-label="Timeout in milliseconds"
        />
      </div>

      {/* ── Form actions ──────────────────────────────────────────────── */}
      <div className="export-modal__mcp-form-actions">
        <button
          type="button"
          className="export-modal__mcp-save-btn"
          disabled={!validation?.isValid}
          onClick={onSave}
          title={validation?.isValid ? "Save MCP" : "Fix validation errors first"}
        >
          {mode === "new" ? "Add MCP" : "Save MCP"}
        </button>
        <button
          type="button"
          className="export-modal__mcp-cancel-btn"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
