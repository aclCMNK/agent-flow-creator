/**
 * tests/ui/agent-flow-store-profile-modal.test.ts
 *
 * Unit tests for the profileModalTarget state and openProfileModal /
 * closeProfileModal actions added to agentFlowStore as part of the
 * "AgentProfileModal to global portal" refactor.
 *
 * These tests are pure logic tests on the Zustand store — no DOM, no React.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { useAgentFlowStore } from "../../src/ui/store/agentFlowStore.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Reset the store to a clean state before each test */
function resetStore() {
  useAgentFlowStore.getState().resetFlow();
}

// ── profileModalTarget — initial state ────────────────────────────────────

describe("agentFlowStore — profileModalTarget initial state", () => {
  beforeEach(resetStore);

  it("starts as null", () => {
    expect(useAgentFlowStore.getState().profileModalTarget).toBeNull();
  });
});

// ── openProfileModal ───────────────────────────────────────────────────────

describe("agentFlowStore — openProfileModal", () => {
  beforeEach(resetStore);

  it("sets profileModalTarget with the provided payload", () => {
    const target = {
      agentId: "agent-abc",
      agentName: "My Agent",
      projectDir: "/projects/test",
    };

    useAgentFlowStore.getState().openProfileModal(target);

    const stored = useAgentFlowStore.getState().profileModalTarget;
    expect(stored).not.toBeNull();
    expect(stored?.agentId).toBe("agent-abc");
    expect(stored?.agentName).toBe("My Agent");
    expect(stored?.projectDir).toBe("/projects/test");
  });

  it("overwrites a previous target when called again", () => {
    useAgentFlowStore.getState().openProfileModal({
      agentId: "agent-1",
      agentName: "Agent One",
      projectDir: "/projects/p1",
    });

    useAgentFlowStore.getState().openProfileModal({
      agentId: "agent-2",
      agentName: "Agent Two",
      projectDir: "/projects/p2",
    });

    const stored = useAgentFlowStore.getState().profileModalTarget;
    expect(stored?.agentId).toBe("agent-2");
    expect(stored?.agentName).toBe("Agent Two");
  });
});

// ── closeProfileModal ─────────────────────────────────────────────────────

describe("agentFlowStore — closeProfileModal", () => {
  beforeEach(resetStore);

  it("resets profileModalTarget to null", () => {
    useAgentFlowStore.getState().openProfileModal({
      agentId: "agent-xyz",
      agentName: "XYZ",
      projectDir: "/projects/xyz",
    });

    // Precondition: modal is open
    expect(useAgentFlowStore.getState().profileModalTarget).not.toBeNull();

    useAgentFlowStore.getState().closeProfileModal();

    expect(useAgentFlowStore.getState().profileModalTarget).toBeNull();
  });

  it("is idempotent — calling close when already null does not throw", () => {
    expect(() => {
      useAgentFlowStore.getState().closeProfileModal();
      useAgentFlowStore.getState().closeProfileModal();
    }).not.toThrow();

    expect(useAgentFlowStore.getState().profileModalTarget).toBeNull();
  });
});

// ── resetFlow clears profileModalTarget ───────────────────────────────────

describe("agentFlowStore — resetFlow clears profileModalTarget", () => {
  it("sets profileModalTarget back to null", () => {
    useAgentFlowStore.getState().openProfileModal({
      agentId: "a",
      agentName: "A",
      projectDir: "/p",
    });

    useAgentFlowStore.getState().resetFlow();

    expect(useAgentFlowStore.getState().profileModalTarget).toBeNull();
  });
});
