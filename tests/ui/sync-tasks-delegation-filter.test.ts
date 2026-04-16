/**
 * tests/ui/sync-tasks-delegation-filter.test.ts
 *
 * Verifies the DEFINITIVE logic for syncTaskPermissions:
 *
 * REGLA:
 *   - Un agente recibe permissions.task SÓLO si tiene al menos un link
 *     saliente con metadata.relationType === "Delegation".
 *   - Links Response (u otro tipo) nunca aparecen en task — ni como fuente
 *     ni como destino.
 *   - Todos los agentes del canvas se incluyen en el payload para que los
 *     agentes sin Delegation saliente reciban taskAgentNames:[] y el handler
 *     escriba permissions.task:{} en disco (limpiando valores anteriores).
 *
 * Strategy:
 *   1. Populate the Zustand store with a set of agents and mixed links.
 *   2. Replace window.agentsFlow.syncTasks with a spy that captures the
 *      SyncTasksRequest payload.
 *   3. Call syncTaskPermissions() and assert entries follow the rules.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useAgentFlowStore } from "../../src/ui/store/agentFlowStore.ts";
import type { CanvasAgent, AgentLink } from "../../src/ui/store/agentFlowStore.ts";
import type { SyncTasksRequest, SyncTasksResult } from "../../src/electron/bridge.types.ts";

// ── Store helpers ──────────────────────────────────────────────────────────

function resetStore() {
  useAgentFlowStore.getState().resetFlow();
}

/** Directly injects state bypassing internal guards — test convenience only. */
function injectState(agents: CanvasAgent[], links: AgentLink[]) {
  useAgentFlowStore.setState({ agents, links });
}

// ── window mock ────────────────────────────────────────────────────────────

type CapturedCall = SyncTasksRequest | null;

function installSyncTasksSpy(): { captured: () => CapturedCall } {
  let last: CapturedCall = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = (globalThis as any).window ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.agentsFlow = (globalThis as any).window.agentsFlow ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.agentsFlow.syncTasks = async (req: SyncTasksRequest): Promise<SyncTasksResult> => {
    last = req;
    return { updated: req.entries.length, errors: [] };
  };
  return { captured: () => last };
}

// ── Builders ───────────────────────────────────────────────────────────────

function makeAgent(id: string, name: string): CanvasAgent {
  return { id, name, description: "", type: "Agent", isOrchestrator: false, hidden: false, x: 0, y: 0 };
}

function makeLink(id: string, from: string, to: string, relationType: string): AgentLink {
  // ruleType is derived from relationType; use same mapping as the store loader.
  // For testing purposes we set both consistently so both fields are accurate.
  const ruleType: "Delegation" | "Response" = relationType === "Response" ? "Response" : "Delegation";
  return {
    id,
    fromAgentId: from,
    toAgentId: to,
    ruleType,
    delegationType: "Optional",
    ruleDetails: "",
    metadata: { relationType },
  };
}

/** Helper: get the entry for a given agentId from the request. */
function entryFor(req: SyncTasksRequest, agentId: string) {
  return req.entries.find((e) => e.agentId === agentId);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("syncTaskPermissions — lógica definitiva (todos los agentes en payload)", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("incluye TODOS los agentes en entries — delegadores con targets, no-delegadores con []", async () => {
    const spy = installSyncTasksSpy();

    // alpha → beta (Delegation), alpha → gamma (Response)
    const agents = [makeAgent("agent-alpha", "alpha"), makeAgent("agent-beta", "beta"), makeAgent("agent-gamma", "gamma")];
    const links = [
      makeLink("link-1", "agent-alpha", "agent-beta",  "Delegation"),
      makeLink("link-2", "agent-alpha", "agent-gamma", "Response"),   // debe ignorarse para task
    ];

    injectState(agents, links);
    await useAgentFlowStore.getState().syncTaskPermissions("/fake/project");

    const req = spy.captured();
    expect(req).not.toBeNull();

    // Los 3 agentes deben aparecer en entries
    expect(req!.entries).toHaveLength(3);

    // alpha: solo "beta" (la Response a gamma no aparece)
    const alphaEntry = entryFor(req!, "agent-alpha");
    expect(alphaEntry).toBeDefined();
    expect(alphaEntry!.taskAgentNames).toEqual(["beta"]);
    expect(alphaEntry!.taskAgentNames).not.toContain("gamma");

    // beta y gamma: no tienen Delegation saliente → taskAgentNames vacío
    const betaEntry = entryFor(req!, "agent-beta");
    expect(betaEntry).toBeDefined();
    expect(betaEntry!.taskAgentNames).toHaveLength(0);

    const gammaEntry = entryFor(req!, "agent-gamma");
    expect(gammaEntry).toBeDefined();
    expect(gammaEntry!.taskAgentNames).toHaveLength(0);
  });

  it("cuando TODOS los links son Response → todos los agentes tienen taskAgentNames:[]", async () => {
    const spy = installSyncTasksSpy();

    const agents = [makeAgent("agent-a", "agent-a"), makeAgent("agent-b", "agent-b")];
    const links  = [makeLink("link-r1", "agent-a", "agent-b", "Response")];

    injectState(agents, links);
    await useAgentFlowStore.getState().syncTaskPermissions("/fake/project");

    const req = spy.captured();
    expect(req).not.toBeNull();

    // Ambos agentes en entries, ambos con [] — ninguno tiene Delegation saliente
    expect(req!.entries).toHaveLength(2);
    for (const entry of req!.entries) {
      expect(entry.taskAgentNames).toHaveLength(0);
    }
  });

  it("orquestador con 2 Delegation + 1 Response: solo los Delegation targets aparecen", async () => {
    const spy = installSyncTasksSpy();

    const agents = [
      makeAgent("orch",    "orch"),
      makeAgent("worker1", "worker1"),
      makeAgent("worker2", "worker2"),
      makeAgent("resp1",   "resp1"),
    ];
    const links = [
      makeLink("l1", "orch", "worker1", "Delegation"),
      makeLink("l2", "orch", "resp1",   "Response"),    // ignorar
      makeLink("l3", "orch", "worker2", "Delegation"),
    ];

    injectState(agents, links);
    await useAgentFlowStore.getState().syncTaskPermissions("/fake/project");

    const req = spy.captured();
    expect(req).not.toBeNull();

    // Los 4 agentes están en el payload
    expect(req!.entries).toHaveLength(4);

    const orchEntry = entryFor(req!, "orch");
    expect(orchEntry).toBeDefined();
    expect(orchEntry!.taskAgentNames).toContain("worker1");
    expect(orchEntry!.taskAgentNames).toContain("worker2");
    expect(orchEntry!.taskAgentNames).not.toContain("resp1");
    expect(orchEntry!.taskAgentNames).toHaveLength(2);

    // workers y resp1 no tienen Delegation saliente → vacío
    for (const id of ["worker1", "worker2", "resp1"]) {
      const e = entryFor(req!, id);
      expect(e).toBeDefined();
      expect(e!.taskAgentNames).toHaveLength(0);
    }
  });

  it("excluye links con relationType 'Handoff' incluso si ruleType dice 'Delegation'", async () => {
    // Regresión: el filtro antiguo (ruleType !== "Delegation") incluiría Handoff.
    // El filtro nuevo (metadata.relationType !== "Delegation") lo rechaza.
    const spy = installSyncTasksSpy();

    const agents = [
      makeAgent("agent-orch",      "orch"),
      makeAgent("agent-delegatee", "delegatee"),
      makeAgent("agent-handoff",   "handoff-target"),
    ];
    const links = [
      makeLink("l-delegation", "agent-orch", "agent-delegatee", "Delegation"),
      makeLink("l-handoff",    "agent-orch", "agent-handoff",   "Handoff"),  // excluir
    ];

    injectState(agents, links);
    await useAgentFlowStore.getState().syncTaskPermissions("/fake/project");

    const req = spy.captured();
    expect(req).not.toBeNull();

    // Los 3 agentes en el payload
    expect(req!.entries).toHaveLength(3);

    const orchEntry = entryFor(req!, "agent-orch");
    expect(orchEntry).toBeDefined();
    expect(orchEntry!.taskAgentNames).toContain("delegatee");
    expect(orchEntry!.taskAgentNames).not.toContain("handoff-target");
    expect(orchEntry!.taskAgentNames).toHaveLength(1);

    // delegatee y handoff-target no tienen Delegation saliente
    const delegateeEntry = entryFor(req!, "agent-delegatee");
    expect(delegateeEntry!.taskAgentNames).toHaveLength(0);

    const handoffEntry = entryFor(req!, "agent-handoff");
    expect(handoffEntry!.taskAgentNames).toHaveLength(0);
  });

  it("grafo sin links → todos los agentes tienen taskAgentNames:[]", async () => {
    const spy = installSyncTasksSpy();

    const agents = [makeAgent("solo-a", "A"), makeAgent("solo-b", "B")];
    injectState(agents, []);

    await useAgentFlowStore.getState().syncTaskPermissions("/fake/project");

    const req = spy.captured();
    expect(req).not.toBeNull();
    expect(req!.entries).toHaveLength(2);
    for (const entry of req!.entries) {
      expect(entry.taskAgentNames).toHaveLength(0);
    }
  });
});
