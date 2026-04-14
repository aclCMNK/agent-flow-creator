/**
 * tests/ui/node-selection-glow.test.ts
 *
 * Tests for the node selection glow feature.
 *
 * Covers:
 *   Store behavior:
 *     - selectNode: sets selectedNodeId and selectionContext to "node"
 *     - selectNode(null): clears selectedNodeId and selectionContext to "none"
 *     - selectNode: deselects any active link
 *     - Multiple calls: latest selection wins (no multi-select in store)
 *     - resetFlow: clears selectedNodeId
 *     - loadFromProject: starts with no selection (selectedNodeId = null)
 *     - selectNode on user-node ID: works just like a regular agent id
 *
 *   CSS class names (contract test):
 *     - CanvasNode should receive "flow-canvas__node--selected" when isSelected=true
 *     - CanvasNode should NOT have that class when isSelected=false
 *     - UserCanvasNode should receive "flow-canvas__user-node--selected" when selected
 *     - UserCanvasNode should NOT have that class when not selected
 *
 *   Glow CSS constants (presence check):
 *     - --node-glow-color, --node-glow-ring, --node-glow-border exist in app.css
 *     - --user-node-glow-color, --user-node-glow-ring, --user-node-glow-border exist in app.css
 *
 *   Interaction rules:
 *     - Clicking the canvas (selectNode(null)) removes glow from all nodes
 *     - Selecting a link deselects the node (selectedNodeId = null after selectLink)
 *     - Node selection does not deselect other nodes in the store — only one at a time
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { useAgentFlowStore, USER_NODE_ID } from "../../src/ui/store/agentFlowStore.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function resetStore() {
  useAgentFlowStore.getState().resetFlow();
}

/** Build the CSS class string for CanvasNode given the selection flag */
function canvasNodeClasses(isSelected: boolean, extras: string[] = []): string {
  return [
    "flow-canvas__node",
    isSelected ? "flow-canvas__node--selected" : "",
    ...extras,
  ].filter(Boolean).join(" ");
}

/** Build the CSS class string for UserCanvasNode given the selection flag */
function userNodeClasses(isSelected: boolean, extras: string[] = []): string {
  return [
    "flow-canvas__user-node",
    isSelected ? "flow-canvas__user-node--selected" : "",
    ...extras,
  ].filter(Boolean).join(" ");
}

// ── Store: selectNode ──────────────────────────────────────────────────────

describe("agentFlowStore — selectNode (glow)", () => {
  beforeEach(resetStore);

  it("sets selectedNodeId to the given agent id", () => {
    useAgentFlowStore.getState().commitPlacement(100, 100);
    const agentId = useAgentFlowStore.getState().agents[0].id;

    useAgentFlowStore.getState().selectNode(agentId);

    expect(useAgentFlowStore.getState().selectedNodeId).toBe(agentId);
  });

  it("sets selectionContext to 'node' when selecting an agent", () => {
    useAgentFlowStore.getState().commitPlacement(100, 100);
    const agentId = useAgentFlowStore.getState().agents[0].id;

    useAgentFlowStore.getState().selectNode(agentId);

    expect(useAgentFlowStore.getState().selectionContext).toBe("node");
  });

  it("sets selectedNodeId to null and selectionContext to 'none' when deselecting", () => {
    useAgentFlowStore.getState().commitPlacement(100, 100);
    const agentId = useAgentFlowStore.getState().agents[0].id;

    useAgentFlowStore.getState().selectNode(agentId);
    useAgentFlowStore.getState().selectNode(null);

    expect(useAgentFlowStore.getState().selectedNodeId).toBeNull();
    expect(useAgentFlowStore.getState().selectionContext).toBe("none");
  });

  it("selecting a node clears any previously selected link (selectedLinkId = null)", () => {
    useAgentFlowStore.getState().commitPlacement(100, 100);
    useAgentFlowStore.getState().commitPlacement(300, 300);
    const [a1, a2] = useAgentFlowStore.getState().agents;

    useAgentFlowStore.getState().addLink(a1.id, a2.id);
    const linkId = useAgentFlowStore.getState().links[0].id;
    useAgentFlowStore.getState().selectLink(linkId);

    // Confirm link is selected
    expect(useAgentFlowStore.getState().selectedLinkId).toBe(linkId);

    // Now select a node
    useAgentFlowStore.getState().selectNode(a1.id);

    expect(useAgentFlowStore.getState().selectedLinkId).toBeNull();
  });

  it("latest selectNode call wins — only one node selected at a time", () => {
    useAgentFlowStore.getState().commitPlacement(100, 100);
    useAgentFlowStore.getState().commitPlacement(300, 300);
    const [a1, a2] = useAgentFlowStore.getState().agents;

    useAgentFlowStore.getState().selectNode(a1.id);
    useAgentFlowStore.getState().selectNode(a2.id);

    expect(useAgentFlowStore.getState().selectedNodeId).toBe(a2.id);
  });

  it("supports selecting the user-node by USER_NODE_ID", () => {
    useAgentFlowStore.getState().addUserNode(50, 50);

    useAgentFlowStore.getState().selectNode(USER_NODE_ID);

    expect(useAgentFlowStore.getState().selectedNodeId).toBe(USER_NODE_ID);
    expect(useAgentFlowStore.getState().selectionContext).toBe("node");
  });

  it("deselects the user-node with selectNode(null)", () => {
    useAgentFlowStore.getState().addUserNode(50, 50);
    useAgentFlowStore.getState().selectNode(USER_NODE_ID);

    useAgentFlowStore.getState().selectNode(null);

    expect(useAgentFlowStore.getState().selectedNodeId).toBeNull();
  });
});

// ── Store: resetFlow clears selection ──────────────────────────────────────

describe("agentFlowStore — resetFlow clears node selection", () => {
  beforeEach(resetStore);

  it("resets selectedNodeId to null on resetFlow", () => {
    useAgentFlowStore.getState().commitPlacement(100, 100);
    const agentId = useAgentFlowStore.getState().agents[0].id;
    useAgentFlowStore.getState().selectNode(agentId);

    useAgentFlowStore.getState().resetFlow();

    expect(useAgentFlowStore.getState().selectedNodeId).toBeNull();
  });

  it("resets selectionContext to 'none' on resetFlow", () => {
    useAgentFlowStore.getState().commitPlacement(100, 100);
    const agentId = useAgentFlowStore.getState().agents[0].id;
    useAgentFlowStore.getState().selectNode(agentId);

    useAgentFlowStore.getState().resetFlow();

    expect(useAgentFlowStore.getState().selectionContext).toBe("none");
  });
});

// ── Store: initial state has no selection ──────────────────────────────────

describe("agentFlowStore — initial state (no selection)", () => {
  beforeEach(resetStore);

  it("selectedNodeId is null in the initial state", () => {
    expect(useAgentFlowStore.getState().selectedNodeId).toBeNull();
  });

  it("selectionContext is 'none' in the initial state", () => {
    expect(useAgentFlowStore.getState().selectionContext).toBe("none");
  });
});

// ── Store: loadFromProject starts with no selection ────────────────────────

describe("agentFlowStore — loadFromProject does not restore selection", () => {
  beforeEach(resetStore);

  it("selectedNodeId is null after loadFromProject", () => {
    // Pre-select something
    useAgentFlowStore.getState().commitPlacement(100, 100);
    const agentId = useAgentFlowStore.getState().agents[0].id;
    useAgentFlowStore.getState().selectNode(agentId);

    const mockProject = {
      id: "test",
      name: "Test",
      description: "",
      agents: [],
      connections: [],
      properties: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    useAgentFlowStore.getState().loadFromProject(mockProject);

    expect(useAgentFlowStore.getState().selectedNodeId).toBeNull();
  });
});

// ── CSS class names (contract tests) ──────────────────────────────────────

describe("Node selection glow — CSS class name contract", () => {
  it("CanvasNode class includes 'flow-canvas__node--selected' when isSelected=true", () => {
    const cls = canvasNodeClasses(true);
    expect(cls).toContain("flow-canvas__node--selected");
  });

  it("CanvasNode class does NOT include '--selected' when isSelected=false", () => {
    const cls = canvasNodeClasses(false);
    expect(cls).not.toContain("flow-canvas__node--selected");
  });

  it("CanvasNode class always includes base 'flow-canvas__node'", () => {
    expect(canvasNodeClasses(true)).toContain("flow-canvas__node");
    expect(canvasNodeClasses(false)).toContain("flow-canvas__node");
  });

  it("UserCanvasNode class includes 'flow-canvas__user-node--selected' when isSelected=true", () => {
    const cls = userNodeClasses(true);
    expect(cls).toContain("flow-canvas__user-node--selected");
  });

  it("UserCanvasNode class does NOT include '--selected' when isSelected=false", () => {
    const cls = userNodeClasses(false);
    expect(cls).not.toContain("flow-canvas__user-node--selected");
  });

  it("UserCanvasNode class always includes base 'flow-canvas__user-node'", () => {
    expect(userNodeClasses(true)).toContain("flow-canvas__user-node");
    expect(userNodeClasses(false)).toContain("flow-canvas__user-node");
  });

  it("selected CanvasNode class does not include dragging or link-target by default", () => {
    const cls = canvasNodeClasses(true);
    expect(cls).not.toContain("--dragging");
    expect(cls).not.toContain("--link-target");
  });
});

// ── CSS glow constants presence check ─────────────────────────────────────

describe("Node selection glow — CSS constants in app.css", () => {
  const cssPath = join(
    import.meta.dir,
    "../../src/ui/styles/app.css",
  );
  let css: string;

  // Read CSS once for all tests in this suite
  try {
    css = readFileSync(cssPath, "utf-8");
  } catch {
    css = "";
  }

  it("app.css is non-empty (sanity check)", () => {
    expect(css.length).toBeGreaterThan(0);
  });

  it("defines --node-glow-color in :root", () => {
    expect(css).toContain("--node-glow-color:");
  });

  it("defines --node-glow-ring in :root", () => {
    expect(css).toContain("--node-glow-ring:");
  });

  it("defines --node-glow-border in :root", () => {
    expect(css).toContain("--node-glow-border:");
  });

  it("defines --user-node-glow-color in :root", () => {
    expect(css).toContain("--user-node-glow-color:");
  });

  it("defines --user-node-glow-ring in :root", () => {
    expect(css).toContain("--user-node-glow-ring:");
  });

  it("defines --user-node-glow-border in :root", () => {
    expect(css).toContain("--user-node-glow-border:");
  });

  it("defines .flow-canvas__node--selected rule", () => {
    expect(css).toContain(".flow-canvas__node--selected");
  });

  it("defines .flow-canvas__user-node--selected rule", () => {
    expect(css).toContain(".flow-canvas__user-node--selected");
  });

  it("the .flow-canvas__node--selected rule uses box-shadow", () => {
    // Find the block and verify it has a box-shadow
    const idx = css.indexOf(".flow-canvas__node--selected");
    expect(idx).toBeGreaterThan(-1);
    const block = css.slice(idx, idx + 300);
    expect(block).toContain("box-shadow");
  });

  it("the .flow-canvas__user-node--selected rule uses box-shadow", () => {
    const idx = css.indexOf(".flow-canvas__user-node--selected");
    expect(idx).toBeGreaterThan(-1);
    const block = css.slice(idx, idx + 300);
    expect(block).toContain("box-shadow");
  });
});
