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
 *   "node"  → placeholder: "Agent properties will appear here."
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

import { useEffect } from "react";
import { useAgentFlowStore } from "../store/agentFlowStore.ts";
import { useProjectStore } from "../store/projectStore.ts";
import type { LinkRuleType, DelegationType } from "../store/agentFlowStore.ts";

// ── Placeholder message map ────────────────────────────────────────────────

const PLACEHOLDER_MESSAGES = {
  none: "Select an agent or connection to edit its properties.",
  node: "Agent properties will appear here.",
} as const;

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
  const showPlaceholder = !showLinkForm;

  // Placeholder text for non-link contexts
  const placeholderText =
    selectionContext === "node"
      ? PLACEHOLDER_MESSAGES.node
      : PLACEHOLDER_MESSAGES.none;

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

        {/* ── Placeholder (no selection or node selected) ─────────────── */}
        {showPlaceholder && (
          <div className="properties-panel__placeholder">
            <span className="properties-panel__placeholder-icon" aria-hidden="true">
              {selectionContext === "node" ? "🤖" : "📋"}
            </span>
            <p className="properties-panel__placeholder-text">
              {placeholderText}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
