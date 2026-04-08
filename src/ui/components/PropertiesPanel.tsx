/**
 * src/ui/components/PropertiesPanel.tsx
 *
 * Right-side contextual properties panel for AgentsFlow.
 *
 * Behaviour:
 *   - Fixed on the right edge of the editor canvas area.
 *   - Collapsible/expandable via a header button ([>] to collapse, [<] to expand).
 *   - Animated width transition on collapse/expand (CSS transition).
 *   - Panel state (open/closed) lives in agentFlowStore (panelOpen).
 *   - On mount, restores panelOpen from .afproj (ui.panelOpen) via projectStore.
 *
 * Content is context-sensitive based on selectionContext:
 *   "none"  → placeholder: "Select an agent or connection to edit its properties."
 *   "node"  → AgentAdapterForm (adapter section)
 *   "link"  → Link rule editing form (ruleType toggle + delegationType select + ruleDetails textarea)
 *
 * The link rule form reads/writes through agentFlowStore.updateLink(id, fields).
 * Changes are reflected immediately in-memory and synced to .afproj via projectStore.
 *
 * Rule Type toggle:
 *   - The user can freely select either "Delegation" or "Response" for any link.
 *   - There are no graph-based or algorithmic restrictions.
 *
 * The panel uses a flex-row sibling layout inside editor-view__main so it
 * never blocks canvas panning/zooming. pointer-events are managed carefully.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useAgentFlowStore } from "../store/agentFlowStore.ts";
import { useProjectStore } from "../store/projectStore.ts";
import type { LinkRuleType, DelegationType } from "../store/agentFlowStore.ts";

// ── Placeholder message map ────────────────────────────────────────────────

const PLACEHOLDER_MESSAGES = {
  none: "Select an agent or connection to edit its properties.",
} as const;

// ── AgentAdapterForm ──────────────────────────────────────────────────────
// Rendered inside the content area when selectionContext === "node".

interface AgentAdapterFormProps {
  agentId: string;
}

/** Adapter options available to the user */
const ADAPTER_OPTIONS = [
  { value: "", label: "None" },
  { value: "opencode", label: "OpenCode" },
] as const;

type AdapterValue = "" | "opencode";

/** Provider options for the OpenCode adapter */
const OPENCODE_PROVIDERS: string[] = [
  "GitHub-Copilot",
  "OpenAI",
  "OpenRouter",
  "ClaudeCode",
  "Ollama",
  "OpenCode-Zen",
  "OpenCode-Go",
];

function AgentAdapterForm({ agentId }: AgentAdapterFormProps) {
  const project = useProjectStore((s) => s.project);

  // ── Local UI state ─────────────────────────────────────────────────────
  /** The value currently shown in the dropdown */
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterValue>("");
  /** The adapter that has been successfully created (persisted in .adata) */
  const [createdAdapter, setCreatedAdapter] = useState<string | null>(null);
  /** Whether the initial adapter value has been loaded from .adata */
  const [isLoaded, setIsLoaded] = useState(false);
  /** Inline error text below the selector */
  const [inlineError, setInlineError] = useState<string | null>(null);
  /** Whether to show the floating toast */
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  /** Whether "Adapter created!" success text should show */
  const [showSuccess, setShowSuccess] = useState(false);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load existing adapter from .adata on agentId / project change ──────
  useEffect(() => {
    if (!project) return;

    setIsLoaded(false);
    setCreatedAdapter(null);
    setSelectedAdapter("");
    setInlineError(null);
    setShowSuccess(false);

    window.agentsFlow
      .adataGetAdapter({ projectDir: project.projectDir, agentId })
      .then((result) => {
        if (result.success && result.adapter) {
          setCreatedAdapter(result.adapter);
          setSelectedAdapter(result.adapter as AdapterValue);
        }
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, [agentId, project?.projectDir]);

  // ── Toast management ───────────────────────────────────────────────────
  function showErrorToast(msg: string) {
    setToastMessage(msg);
    setShowToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
    }, 4000);
  }

  function dismissToast() {
    setShowToast(false);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }

  // ── Create Adapter button handler ──────────────────────────────────────
  async function handleCreateAdapter() {
    if (!project) return;

    // Clear previous success
    setShowSuccess(false);
    setInlineError(null);

    // Validate: must have a real adapter selected
    if (!selectedAdapter) {
      const msg = "Please select an adapter before creating.";
      setInlineError(msg);
      showErrorToast(msg);
      return;
    }

    // Validate: adapter must not already exist for this agent
    if (createdAdapter !== null) {
      const msg = `Adapter "${createdAdapter}" is already created for this agent.`;
      setInlineError(msg);
      showErrorToast(msg);
      return;
    }

    // Persist to .adata
    try {
      const result = await window.agentsFlow.adataSetAdapter({
        projectDir: project.projectDir,
        agentId,
        adapter: selectedAdapter,
      });

      if (!result.success) {
        const msg = result.error ?? "Failed to create adapter.";
        setInlineError(msg);
        showErrorToast(msg);
        return;
      }

      // Success
      setCreatedAdapter(selectedAdapter);
      setInlineError(null);
      setShowSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create adapter.";
      setInlineError(msg);
      showErrorToast(msg);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="agent-adapter-form">
        <div className="agent-adapter-form__loading">Loading...</div>
      </div>
    );
  }

  // Hide "None" option once an adapter has been created
  const visibleOptions = createdAdapter !== null
    ? ADAPTER_OPTIONS.filter((o) => o.value !== "")
    : ADAPTER_OPTIONS;

  return (
    <div className="agent-adapter-form">
      {/* ── Section heading ──────────────────────────────────────────────── */}
      <div className="agent-adapter-form__section-heading">Adapter</div>

      {/* ── Adapter selector ──────────────────────────────────────────────── */}
      <div className="agent-adapter-form__field">
        <label
          className="agent-adapter-form__label"
          htmlFor="adapter-select"
        >
          Adapter type
        </label>
        <select
          id="adapter-select"
          className="form-field__select agent-adapter-form__select"
          value={selectedAdapter}
          onChange={(e) => {
            setSelectedAdapter(e.target.value as AdapterValue);
            setInlineError(null);
            setShowSuccess(false);
          }}
          aria-label="Select adapter"
          // Lock selector once adapter is created
          disabled={createdAdapter !== null}
        >
          {visibleOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Inline error below selector */}
        {inlineError && (
          <span className="agent-adapter-form__inline-error" role="alert">
            {inlineError}
          </span>
        )}
      </div>

      {/* ── Create Adapter button ──────────────────────────────────────────── */}
      <button
        type="button"
        className="btn btn--primary agent-adapter-form__create-btn"
        onClick={handleCreateAdapter}
        disabled={createdAdapter !== null}
        aria-label="Create adapter"
      >
        Create Adapter
      </button>

      {/* Success message below button */}
      {showSuccess && (
        <span className="agent-adapter-form__success" role="status">
          Adapter created!
        </span>
      )}

      {/* ── OpenCode config fields (only when opencode adapter is active) ─── */}
      {createdAdapter === "opencode" && (
        <OpenCodeConfigForm agentId={agentId} />
      )}

      {/* ── Floating error toast ────────────────────────────────────────────── */}
      {showToast && (
        <div className="agent-graph-toast agent-graph-toast--error" role="alert">
          <span>{toastMessage}</span>
          <button
            className="agent-graph-toast__close"
            onClick={dismissToast}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── OpenCodeConfigForm ─────────────────────────────────────────────────────
// Rendered below the adapter section when adapter === "opencode".
// Shows a Provider dropdown and a Model text input.
// Both values are persisted under the 'opencode' key in .adata.

interface OpenCodeConfigFormProps {
  agentId: string;
}

function OpenCodeConfigForm({ agentId }: OpenCodeConfigFormProps) {
  const project = useProjectStore((s) => s.project);

  const [provider, setProvider] = useState<string>(OPENCODE_PROVIDERS[0] ?? "");
  const [model, setModel] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  // Debounce timer for model field auto-save
  const modelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last persisted values to avoid redundant writes
  const lastPersistedRef = useRef<{ provider: string; model: string } | null>(null);

  // ── Load existing config from .adata ────────────────────────────────────
  useEffect(() => {
    if (!project) return;

    setIsLoaded(false);
    setProvider(OPENCODE_PROVIDERS[0] ?? "");
    setModel("");
    lastPersistedRef.current = null;

    window.agentsFlow
      .adataGetOpenCodeConfig({ projectDir: project.projectDir, agentId })
      .then((result) => {
        if (result.success && result.config) {
          setProvider(result.config.provider || (OPENCODE_PROVIDERS[0] ?? ""));
          setModel(result.config.model || "");
          lastPersistedRef.current = {
            provider: result.config.provider || (OPENCODE_PROVIDERS[0] ?? ""),
            model: result.config.model || "",
          };
        }
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, [agentId, project?.projectDir]);

  // ── Persist helper ───────────────────────────────────────────────────────
  const persist = useCallback(
    (nextProvider: string, nextModel: string) => {
      if (!project) return;
      // Avoid redundant writes
      const last = lastPersistedRef.current;
      if (last && last.provider === nextProvider && last.model === nextModel) return;
      lastPersistedRef.current = { provider: nextProvider, model: nextModel };
      window.agentsFlow
        .adataSetOpenCodeConfig({
          projectDir: project.projectDir,
          agentId,
          config: { provider: nextProvider, model: nextModel },
        })
        .catch(() => {
          // Persist failure is silent — non-blocking
        });
    },
    [agentId, project]
  );

  // ── Provider change handler ──────────────────────────────────────────────
  function handleProviderChange(value: string) {
    setProvider(value);
    persist(value, model);
  }

  // ── Model change handler (debounced auto-save) ───────────────────────────
  function handleModelChange(value: string) {
    setModel(value);
    if (modelSaveTimerRef.current) clearTimeout(modelSaveTimerRef.current);
    modelSaveTimerRef.current = setTimeout(() => {
      persist(provider, value);
    }, 500);
  }

  if (!isLoaded) return null;

  return (
    <div className="opencode-config-form">
      {/* ── Section heading ─────────────────────────────────────────── */}
      <div className="agent-adapter-form__section-heading">OpenCode Settings</div>

      {/* ── Provider dropdown ───────────────────────────────────────── */}
      <div className="agent-adapter-form__field">
        <label
          className="agent-adapter-form__label"
          htmlFor="opencode-provider-select"
        >
          Provider
        </label>
        <select
          id="opencode-provider-select"
          className="form-field__select agent-adapter-form__select"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          aria-label="OpenCode provider"
        >
          {OPENCODE_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* ── Model text input ─────────────────────────────────────────── */}
      <div className="agent-adapter-form__field">
        <label
          className="agent-adapter-form__label"
          htmlFor="opencode-model-input"
        >
          Model
        </label>
        <input
          id="opencode-model-input"
          type="text"
          className="form-field__input opencode-config-form__model-input"
          value={model}
          onChange={(e) => handleModelChange(e.target.value)}
          placeholder="e.g. gpt-4o, claude-sonnet-4-5..."
          aria-label="OpenCode model"
          autoComplete="off"
          spellCheck={false}
        />
        {/* Non-blocking info when model is empty */}
        {!model.trim() && (
          <span className="opencode-config-form__model-info" role="status">
            Please enter a model name.
          </span>
        )}
      </div>
    </div>
  );
}

// ── LinkRuleForm ───────────────────────────────────────────────────────────
// Rendered inside the content area when selectionContext === "link".

interface LinkRuleFormProps {
  linkId: string;
}

function LinkRuleForm({ linkId }: LinkRuleFormProps) {
  const links = useAgentFlowStore((s) => s.links);
  const updateLink = useAgentFlowStore((s) => s.updateLink);
  const saveProject = useProjectStore((s) => s.saveProject);
  const project = useProjectStore((s) => s.project);

  const link = links.find((l) => l.id === linkId);

  if (!link) {
    return (
      <div className="properties-panel__placeholder">
        <span className="properties-panel__placeholder-icon" aria-hidden="true">🔗</span>
        <p className="properties-panel__placeholder-text">
          Connection not found.
        </p>
      </div>
    );
  }

  /** Persist the updated link rules to .afproj */
  function persistLinks(nextLinks: typeof links) {
    if (!project) return;
    const existingProperties = (project.properties ?? {}) as Record<string, unknown>;
    const linksData = nextLinks.map((l) => ({
      id: l.id,
      fromAgentId: l.fromAgentId,
      toAgentId: l.toAgentId,
      ruleType: l.ruleType,
      delegationType: l.delegationType,
      ruleDetails: l.ruleDetails,
    }));
    const merged = { ...existingProperties, "flow.links": linksData };
    saveProject({ properties: merged }).catch(() => {
      // Non-critical — link rule persistence failure is silent
    });
  }

  function handleRuleTypeChange(value: LinkRuleType) {
    updateLink(linkId, { ruleType: value });
    // Persist after state update — get latest links from store
    const nextLinks = useAgentFlowStore.getState().links.map((l) =>
      l.id === linkId ? { ...l, ruleType: value } : l
    );
    persistLinks(nextLinks);
  }

  function handleDelegationTypeChange(value: DelegationType) {
    updateLink(linkId, { delegationType: value });
    const nextLinks = useAgentFlowStore.getState().links.map((l) =>
      l.id === linkId ? { ...l, delegationType: value } : l
    );
    persistLinks(nextLinks);
  }

  function handleRuleDetailsChange(value: string) {
    updateLink(linkId, { ruleDetails: value });
    const nextLinks = useAgentFlowStore.getState().links.map((l) =>
      l.id === linkId ? { ...l, ruleDetails: value } : l
    );
    persistLinks(nextLinks);
  }

  return (
    <div className="link-rule-form">
      {/* ── Connection header ──────────────────────────────────────────── */}
      <div className="link-rule-form__header">
        <span className="link-rule-form__header-icon" aria-hidden="true">🔗</span>
        <span className="link-rule-form__header-title">Connection Rule</span>
      </div>

      {/* ── Rule Type toggle: Delegation / Response ─────────────────────── */}
      <div className="link-rule-form__section">
        <label className="link-rule-form__section-label" id="rule-type-label">
          Rule Type
        </label>
        <div
          className="link-rule-form__toggle-group"
          role="radiogroup"
          aria-labelledby="rule-type-label"
        >
          <button
            type="button"
            className={[
              "link-rule-form__toggle-btn",
              link.ruleType === "Delegation" ? "link-rule-form__toggle-btn--active" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => handleRuleTypeChange("Delegation")}
            aria-pressed={link.ruleType === "Delegation"}
            aria-label="Set rule type to Delegation"
          >
            Delegation
          </button>
          <button
            type="button"
            className={[
              "link-rule-form__toggle-btn",
              link.ruleType === "Response" ? "link-rule-form__toggle-btn--active" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => handleRuleTypeChange("Response")}
            aria-pressed={link.ruleType === "Response"}
            aria-label="Set rule type to Response"
          >
            Response
          </button>
        </div>
      </div>

      {/* ── Delegation Type select (only when Delegation is selected) ────── */}
      {link.ruleType === "Delegation" && (
        <div className="link-rule-form__section">
          <label
            className="link-rule-form__section-label"
            htmlFor="delegation-type-select"
          >
            Delegation Type
          </label>
          <select
            id="delegation-type-select"
            className="form-field__select link-rule-form__select"
            value={link.delegationType}
            onChange={(e) =>
              handleDelegationTypeChange(e.target.value as DelegationType)
            }
            aria-label="Delegation type"
          >
            <option value="Optional">Optional</option>
            <option value="Mandatory">Mandatory</option>
            <option value="Conditional">Conditional</option>
          </select>
        </div>
      )}

      {/* ── Rule Details textarea ──────────────────────────────────────── */}
      <div className="link-rule-form__section link-rule-form__section--grow">
        <label
          className="link-rule-form__section-label"
          htmlFor="rule-details-textarea"
        >
          Rule Details
          <span className="link-rule-form__label-optional"> (optional)</span>
        </label>
        <textarea
          id="rule-details-textarea"
          className="form-field__textarea link-rule-form__textarea"
          value={link.ruleDetails}
          onChange={(e) => handleRuleDetailsChange(e.target.value)}
          placeholder="Describe the rule logic or conditions..."
          rows={5}
          aria-label="Rule details"
        />
      </div>
    </div>
  );
}

// ── PropertiesPanel ────────────────────────────────────────────────────────

export function PropertiesPanel() {
  const panelOpen = useAgentFlowStore((s) => s.panelOpen);
  const selectionContext = useAgentFlowStore((s) => s.selectionContext);
  const selectedLinkId = useAgentFlowStore((s) => s.selectedLinkId);
  const selectedNodeId = useAgentFlowStore((s) => s.selectedNodeId);
  const openPanel = useAgentFlowStore((s) => s.openPanel);
  const closePanel = useAgentFlowStore((s) => s.closePanel);
  const togglePanel = useAgentFlowStore((s) => s.togglePanel);

  const project = useProjectStore((s) => s.project);
  const saveProject = useProjectStore((s) => s.saveProject);

  // ── Restore panelOpen from .afproj on project load ───────────────────────
  useEffect(() => {
    if (!project) return;
    const savedPanelOpen = (project.properties as Record<string, unknown> | undefined)?.["ui.panelOpen"];
    if (typeof savedPanelOpen === "boolean") {
      if (savedPanelOpen) {
        openPanel();
      } else {
        closePanel();
      }
    }
    // Only run on project change, not on every panelOpen toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.projectDir]);

  // ── Persist panelOpen to .afproj when it changes ─────────────────────────
  useEffect(() => {
    if (!project) return;
    // Merge into existing properties
    const existingProperties = (project.properties ?? {}) as Record<string, unknown>;
    const merged = { ...existingProperties, "ui.panelOpen": panelOpen };
    saveProject({ properties: merged }).catch(() => {
      // Non-critical — panel state persistence failure is silent
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  // ── Determine content to show ─────────────────────────────────────────────
  const showLinkForm = selectionContext === "link" && selectedLinkId !== null;
  const showNodeForm = selectionContext === "node" && selectedNodeId !== null;
  const showPlaceholder = !showLinkForm && !showNodeForm;

  return (
    <aside
      className={`properties-panel${panelOpen ? " properties-panel--open" : " properties-panel--closed"}`}
      aria-label="Properties panel"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="properties-panel__header">
        {panelOpen && (
          <span className="properties-panel__title">Properties</span>
        )}
        <button
          className="properties-panel__toggle"
          onClick={togglePanel}
          title={panelOpen ? "Collapse properties panel" : "Expand properties panel"}
          aria-label={panelOpen ? "Collapse properties panel" : "Expand properties panel"}
          aria-expanded={panelOpen}
        >
          {panelOpen ? "[<]" : "[>]"}
        </button>
      </header>

      {/* ── Content area (hidden when collapsed) ────────────────────────── */}
      <div
        className="properties-panel__content"
        aria-hidden={!panelOpen}
      >
        {/* ── Link rule editing form ──────────────────────────────────── */}
        {showLinkForm && selectedLinkId && (
          <LinkRuleForm linkId={selectedLinkId} />
        )}

        {/* ── Agent adapter form ───────────────────────────────────────── */}
        {showNodeForm && selectedNodeId && (
          <AgentAdapterForm agentId={selectedNodeId} />
        )}

        {/* ── Placeholder (no selection) ───────────────────────────────── */}
        {showPlaceholder && (
          <div className="properties-panel__placeholder">
            <span className="properties-panel__placeholder-icon" aria-hidden="true">📋</span>
            <p className="properties-panel__placeholder-text">
              {PLACEHOLDER_MESSAGES.none}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
