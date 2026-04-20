/**
 * tests/electron/save-agent-graph-auto-sync.test.ts
 *
 * Integration tests: auto-sync of permissions.task on save.
 *
 * These tests validate that the combination of `buildSyncTaskEntries` +
 * `handleSyncTasks` — wired together in the SAVE_AGENT_GRAPH IPC handler —
 * correctly writes `permissions.task` to .adata files on disk.
 *
 * Both the auto-save path and the manual "Sync Delegations" button path use the
 * same shared logic, so these tests also confirm the DRY contract is met:
 * calling them independently produces the same on-disk state.
 *
 * No Electron IPC dependency — tests the pure functions directly.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { buildSyncTaskEntries } from "../../src/shared/syncTaskEntries.ts";
import { handleSyncTasks } from "../../src/electron/permissions-handlers.ts";
import type { AgentGraphNode, AgentGraphEdge } from "../../src/electron/bridge.types.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, name: string, overrides: Partial<AgentGraphNode> = {}): AgentGraphNode {
  return {
    id,
    name,
    description: `${name} agent`,
    type: "Agent",
    isOrchestrator: false,
    hidden: false,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function makeEdge(
  fromAgentId: string,
  toAgentId: string,
  relationType: "Delegation" | "Response" = "Delegation",
): AgentGraphEdge {
  return {
    id: `${fromAgentId}->${toAgentId}`,
    fromAgentId,
    toAgentId,
    relationType,
    delegationType: "Optional",
    ruleDetails: "",
  };
}

/**
 * Writes a minimal .adata file for an agent into the metadata directory.
 */
async function writeAdata(metaDir: string, agentId: string, data: Record<string, unknown> = {}): Promise<void> {
  const path = join(metaDir, `${agentId}.adata`);
  await writeFile(path, JSON.stringify({ agentName: agentId, ...data }), "utf-8");
}

/**
 * Reads the permissions.task field from an .adata file.
 */
async function readTaskPerms(metaDir: string, agentId: string): Promise<unknown> {
  const raw = JSON.parse(await readFile(join(metaDir, `${agentId}.adata`), "utf-8")) as Record<string, unknown>;
  const perms = raw.permissions as Record<string, unknown> | undefined;
  return perms?.task;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir: string;
let metaDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "auto-sync-test-"));
  metaDir = join(tmpDir, "metadata");
  await mkdir(metaDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Shared helper: invoke the combined pipeline ───────────────────────────────

async function runAutoSync(
  agents: AgentGraphNode[],
  edges: AgentGraphEdge[],
): Promise<{ updated: number; errors: string[] }> {
  const syncAgents = agents.map((n) => ({ id: n.id, name: n.name }));
  const syncEdges = edges.map((e) => ({
    fromAgentId: e.fromAgentId,
    toAgentId: e.toAgentId,
    relationType: e.relationType ?? "",
  }));

  const entries = buildSyncTaskEntries(syncAgents, syncEdges);
  return handleSyncTasks({ projectDir: tmpDir, entries });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("auto-sync pipeline — single orchestrator delegates to one sub-agent", () => {
  it("writes permissions.task={SubAgent: 'allow'} to the orchestrator's .adata", async () => {
    const orchestrator = makeNode("orch-001", "Orchestrator", { isOrchestrator: true });
    const sub = makeNode("sub-001", "SubAgent");
    await writeAdata(metaDir, "orch-001");
    await writeAdata(metaDir, "sub-001");

    const result = await runAutoSync(
      [orchestrator, sub],
      [makeEdge("orch-001", "sub-001")],
    );

    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(0);

    const orchTask = await readTaskPerms(metaDir, "orch-001");
    expect(orchTask).toEqual({ SubAgent: "allow" });

    // Sub-agent has no delegations → task must be {} (cleared)
    const subTask = await readTaskPerms(metaDir, "sub-001");
    expect(subTask).toEqual({});
  });
});

describe("auto-sync pipeline — fan-out (orchestrator delegates to multiple sub-agents)", () => {
  it("writes all delegated agent names to permissions.task", async () => {
    const orch = makeNode("orch", "Boss", { isOrchestrator: true });
    const s1 = makeNode("s1", "Worker1");
    const s2 = makeNode("s2", "Worker2");
    const s3 = makeNode("s3", "Worker3");

    for (const id of ["orch", "s1", "s2", "s3"]) {
      await writeAdata(metaDir, id);
    }

    const result = await runAutoSync(
      [orch, s1, s2, s3],
      [makeEdge("orch", "s1"), makeEdge("orch", "s2"), makeEdge("orch", "s3")],
    );

    expect(result.errors).toHaveLength(0);
    const task = await readTaskPerms(metaDir, "orch") as Record<string, unknown>;
    expect(Object.keys(task).sort()).toEqual(["Worker1", "Worker2", "Worker3"].sort());
    expect(task["Worker1"]).toBe("allow");
    expect(task["Worker2"]).toBe("allow");
    expect(task["Worker3"]).toBe("allow");

    // Non-delegators get empty task
    for (const id of ["s1", "s2", "s3"]) {
      expect(await readTaskPerms(metaDir, id)).toEqual({});
    }
  });
});

describe("auto-sync pipeline — user-node is excluded", () => {
  it("does not create or modify a .adata file for 'user-node'", async () => {
    const orch = makeNode("orch", "Orchestrator", { isOrchestrator: true });
    const sub = makeNode("sub", "Worker");
    const user = makeNode("user-node", "User");

    await writeAdata(metaDir, "orch");
    await writeAdata(metaDir, "sub");
    // user-node intentionally has no .adata file

    const result = await runAutoSync(
      [orch, sub, user],
      [makeEdge("orch", "sub")],
    );

    expect(result.errors).toHaveLength(0);
    // user-node should NOT appear in entries — no .adata touched for it
    // If handleSyncTasks tried to write it, it would fail (no file). 0 errors confirms it was skipped.
  });
});

describe("auto-sync pipeline — stale permissions.task is cleared on non-delegator", () => {
  it("clears permissions.task when a delegation edge is removed", async () => {
    await writeAdata(metaDir, "orch", {
      permissions: { task: { OldSub: "allow" } },
    });
    await writeAdata(metaDir, "newsub");

    // Now orch no longer delegates to anyone
    const orch = makeNode("orch", "Orchestrator", { isOrchestrator: true });
    const newsub = makeNode("newsub", "NewSub");

    const result = await runAutoSync([orch, newsub], []); // no delegation edges

    expect(result.errors).toHaveLength(0);
    const orchTask = await readTaskPerms(metaDir, "orch");
    expect(orchTask).toEqual({});
  });
});

describe("auto-sync pipeline — Response edges are not treated as Delegation", () => {
  it("ignores Response edges and leaves permissions.task empty for both agents", async () => {
    const a1 = makeNode("a1", "Alpha");
    const a2 = makeNode("a2", "Beta");
    await writeAdata(metaDir, "a1");
    await writeAdata(metaDir, "a2");

    const result = await runAutoSync(
      [a1, a2],
      [makeEdge("a2", "a1", "Response")], // only a Response edge — no Delegation
    );

    expect(result.errors).toHaveLength(0);
    expect(await readTaskPerms(metaDir, "a1")).toEqual({});
    expect(await readTaskPerms(metaDir, "a2")).toEqual({});
  });
});

describe("auto-sync pipeline — DRY contract: manual and auto paths produce same result", () => {
  it("calling buildSyncTaskEntries+handleSyncTasks manually yields the same state as the auto path", async () => {
    const orch = makeNode("orch", "Orchestrator", { isOrchestrator: true });
    const sub = makeNode("sub", "SubWorker");
    await writeAdata(metaDir, "orch");
    await writeAdata(metaDir, "sub");

    // Auto path (same as SAVE_AGENT_GRAPH step 7)
    const autoResult = await runAutoSync(
      [orch, sub],
      [makeEdge("orch", "sub")],
    );

    const stateAfterAuto = await readTaskPerms(metaDir, "orch");

    // Reset to initial state
    await writeAdata(metaDir, "orch");
    await writeAdata(metaDir, "sub");

    // Manual path (same as store.syncTaskPermissions via agentFlowStore)
    const entries = buildSyncTaskEntries(
      [{ id: "orch", name: "Orchestrator" }, { id: "sub", name: "SubWorker" }],
      [{ fromAgentId: "orch", toAgentId: "sub", relationType: "Delegation" }],
    );
    const manualResult = await handleSyncTasks({ projectDir: tmpDir, entries });

    const stateAfterManual = await readTaskPerms(metaDir, "orch");

    // Both produce identical on-disk results
    expect(stateAfterAuto).toEqual(stateAfterManual);
    expect(autoResult.updated).toBe(manualResult.updated);
    expect(autoResult.errors).toEqual(manualResult.errors);
  });
});
