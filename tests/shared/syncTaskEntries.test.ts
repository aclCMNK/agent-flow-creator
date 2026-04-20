/**
 * tests/shared/syncTaskEntries.test.ts
 *
 * Unit tests for src/shared/syncTaskEntries.ts
 *
 * Covers:
 *   - Empty agents / empty edges → empty result
 *   - UserNode exclusion from output
 *   - Non-delegator agents get taskAgentNames: []
 *   - Single delegator with one Delegation edge
 *   - Fan-out: one agent delegating to multiple targets
 *   - Fan-in: multiple agents delegating to the same target
 *   - Response edges are ignored
 *   - Mixed Delegation + Response edges
 *   - Deleted agents: edges whose fromAgentId no longer exists in agents[]
 *   - Edges whose toAgentId no longer exists in agents[] (resolved to nothing)
 *   - User-node in edge endpoints is excluded from task names
 *   - All agents included (delegating AND non-delegating)
 */

import { describe, it, expect } from "bun:test";
import { buildSyncTaskEntries } from "../../src/shared/syncTaskEntries.ts";
import type { SyncAgent, SyncEdge } from "../../src/shared/syncTaskEntries.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

function agent(id: string, name: string): SyncAgent {
  return { id, name };
}

function edge(
  fromAgentId: string,
  toAgentId: string,
  relationType: string = "Delegation",
): SyncEdge {
  return { fromAgentId, toAgentId, relationType };
}

function entryFor(entries: ReturnType<typeof buildSyncTaskEntries>, agentId: string) {
  return entries.find((e) => e.agentId === agentId);
}

// ── Empty inputs ─────────────────────────────────────────────────────────────

describe("buildSyncTaskEntries — empty inputs", () => {
  it("returns [] for empty agents and empty edges", () => {
    expect(buildSyncTaskEntries([], [])).toEqual([]);
  });

  it("returns entries with empty taskAgentNames for agents with no edges", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta")];
    const result = buildSyncTaskEntries(agents, []);
    expect(result).toHaveLength(2);
    expect(entryFor(result, "a1")?.taskAgentNames).toEqual([]);
    expect(entryFor(result, "a2")?.taskAgentNames).toEqual([]);
  });
});

// ── UserNode exclusion ────────────────────────────────────────────────────────

describe("buildSyncTaskEntries — UserNode exclusion", () => {
  it("excludes the user-node from the output entries", () => {
    const agents = [agent("user-node", "User"), agent("a1", "Alpha")];
    const result = buildSyncTaskEntries(agents, []);
    expect(result.some((e) => e.agentId === "user-node")).toBe(false);
    expect(result).toHaveLength(1);
  });

  it("excludes user-node from delegation targets (edge from real agent to user-node)", () => {
    const agents = [agent("a1", "Alpha"), agent("user-node", "User")];
    const edges = [edge("a1", "user-node", "Delegation")];
    const result = buildSyncTaskEntries(agents, edges);
    // a1 has an edge to user-node but user-node is not in the idToName map
    // so it resolves to nothing → taskAgentNames should be []
    expect(entryFor(result, "a1")?.taskAgentNames).toEqual([]);
  });

  it("excludes edges FROM user-node (user-node is not a delegator)", () => {
    const agents = [agent("a1", "Alpha"), agent("user-node", "User")];
    const edges = [edge("user-node", "a1", "Delegation")];
    const result = buildSyncTaskEntries(agents, edges);
    // user-node is not in output; a1 has no delegations from itself
    expect(entryFor(result, "a1")?.taskAgentNames).toEqual([]);
  });
});

// ── Single delegator ──────────────────────────────────────────────────────────

describe("buildSyncTaskEntries — single Delegation edge", () => {
  it("returns the target agent name for a simple A→B delegation", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta")];
    const edges = [edge("a1", "a2", "Delegation")];
    const result = buildSyncTaskEntries(agents, edges);

    expect(entryFor(result, "a1")?.taskAgentNames).toEqual(["Beta"]);
    expect(entryFor(result, "a2")?.taskAgentNames).toEqual([]);
  });
});

// ── Fan-out ────────────────────────────────────────────────────────────────────

describe("buildSyncTaskEntries — fan-out (one agent delegates to multiple)", () => {
  it("collects all delegated target names for a single source agent", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta"), agent("a3", "Gamma")];
    const edges = [
      edge("a1", "a2", "Delegation"),
      edge("a1", "a3", "Delegation"),
    ];
    const result = buildSyncTaskEntries(agents, edges);

    const names = entryFor(result, "a1")?.taskAgentNames ?? [];
    expect(names.sort()).toEqual(["Beta", "Gamma"].sort());
    expect(entryFor(result, "a2")?.taskAgentNames).toEqual([]);
    expect(entryFor(result, "a3")?.taskAgentNames).toEqual([]);
  });
});

// ── Fan-in ─────────────────────────────────────────────────────────────────────

describe("buildSyncTaskEntries — fan-in (multiple agents delegate to same target)", () => {
  it("each source independently lists the shared target", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta"), agent("a3", "Gamma")];
    const edges = [
      edge("a1", "a3", "Delegation"),
      edge("a2", "a3", "Delegation"),
    ];
    const result = buildSyncTaskEntries(agents, edges);

    expect(entryFor(result, "a1")?.taskAgentNames).toEqual(["Gamma"]);
    expect(entryFor(result, "a2")?.taskAgentNames).toEqual(["Gamma"]);
    expect(entryFor(result, "a3")?.taskAgentNames).toEqual([]);
  });
});

// ── Response edges ignored ─────────────────────────────────────────────────────

describe("buildSyncTaskEntries — Response edges are ignored", () => {
  it("does not include Response-type edges in taskAgentNames", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta")];
    const edges = [edge("a2", "a1", "Response")]; // a2 responds to a1
    const result = buildSyncTaskEntries(agents, edges);

    expect(entryFor(result, "a1")?.taskAgentNames).toEqual([]);
    expect(entryFor(result, "a2")?.taskAgentNames).toEqual([]);
  });

  it("Delegation and Response between same pair — only Delegation contributes", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta")];
    const edges = [
      edge("a1", "a2", "Delegation"),
      edge("a2", "a1", "Response"),
    ];
    const result = buildSyncTaskEntries(agents, edges);

    expect(entryFor(result, "a1")?.taskAgentNames).toEqual(["Beta"]);
    expect(entryFor(result, "a2")?.taskAgentNames).toEqual([]);
  });
});

// ── Stale edge cleanup ─────────────────────────────────────────────────────────

describe("buildSyncTaskEntries — stale / deleted agent edges", () => {
  it("edges whose toAgentId is no longer in agents[] resolve to empty (agent deleted)", () => {
    const agents = [agent("a1", "Alpha")]; // a2 was deleted
    const edges = [edge("a1", "a2", "Delegation")];
    const result = buildSyncTaskEntries(agents, edges);

    // a2 not in idToName → name resolves to undefined → filtered out
    expect(entryFor(result, "a1")?.taskAgentNames).toEqual([]);
  });

  it("edges whose fromAgentId is no longer in agents[] are silently ignored", () => {
    const agents = [agent("a2", "Beta")]; // a1 was deleted
    const edges = [edge("a1", "a2", "Delegation")]; // from deleted agent
    const result = buildSyncTaskEntries(agents, edges);

    // a1 not in agents → no entry in delegationMap → a2 gets []
    expect(entryFor(result, "a2")?.taskAgentNames).toEqual([]);
    // a1 should not appear in output either
    expect(entryFor(result, "a1")).toBeUndefined();
  });
});

// ── All agents in output ───────────────────────────────────────────────────────

describe("buildSyncTaskEntries — ALL agents included", () => {
  it("includes every non-user-node agent in the output even with no edges", () => {
    const agents = [
      agent("a1", "Alpha"),
      agent("a2", "Beta"),
      agent("a3", "Gamma"),
      agent("user-node", "User"),
    ];
    const result = buildSyncTaskEntries(agents, []);
    const ids = result.map((e) => e.agentId).sort();
    expect(ids).toEqual(["a1", "a2", "a3"].sort());
  });

  it("non-delegating agents always have taskAgentNames: [] (clears stale disk values)", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta"), agent("a3", "Gamma")];
    const edges = [edge("a1", "a2", "Delegation")]; // a3 has no outgoing delegation
    const result = buildSyncTaskEntries(agents, edges);

    expect(entryFor(result, "a3")?.taskAgentNames).toEqual([]);
  });
});

// ── Unknown relationType ───────────────────────────────────────────────────────

describe("buildSyncTaskEntries — unknown relationType", () => {
  it("treats any non-Delegation relationType as ignorable", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta")];
    const edges = [edge("a1", "a2", "Unknown")];
    const result = buildSyncTaskEntries(agents, edges);
    expect(entryFor(result, "a1")?.taskAgentNames).toEqual([]);
  });
});

// ── Duplicate Delegation edges (same pair) ──────────────────────────────────

describe("buildSyncTaskEntries — duplicate edges", () => {
  it("deduplicates when two Delegation edges point to the same target", () => {
    const agents = [agent("a1", "Alpha"), agent("a2", "Beta")];
    // Two edges with the same fromAgentId+toAgentId
    const edges = [
      edge("a1", "a2", "Delegation"),
      edge("a1", "a2", "Delegation"),
    ];
    const result = buildSyncTaskEntries(agents, edges);
    // Set deduplication → "Beta" appears only once
    expect(entryFor(result, "a1")?.taskAgentNames).toEqual(["Beta"]);
  });
});
