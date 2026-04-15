/**
 * tests/electron/adata-builder.test.ts
 *
 * Unit tests for src/electron/adata-builder.ts — buildAdataFromExisting()
 *
 * Covers:
 *   - New agent (empty existing): optional fields are absent or defaults
 *   - Existing agent with all fields: all fields forwarded unchanged
 *   - Existing agent with permissions: permissions forwarded as-is
 *   - Existing agent without permissions: permissions key absent
 *   - Permissions empty object: forwarded as {} (not dropped)
 *   - Existing agent with opencode: opencode forwarded as-is
 *   - Existing agent without opencode: opencode key absent
 *   - metadata deep-merge: existing metadata keys survive, graph keys overwrite
 *   - profilePath preservation: existing path wins over slug default
 *   - profilePath default: uses slug when not set
 *   - Unknown/future fields forwarded (future-compat)
 *   - Immutability: builder does NOT mutate existing object
 *   - updatedAt comes from `now` argument
 *   - createdAt preserved from existing, defaults to `now` for new agents
 */

import { describe, it, expect } from "bun:test";
import { buildAdataFromExisting } from "../../src/electron/adata-builder.ts";
import type { AgentGraphNode } from "../../src/electron/bridge.types.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-04-15T12:00:00.000Z";
const CREATED_AT = "2026-01-01T00:00:00.000Z";
const AGENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeNode(overrides: Partial<AgentGraphNode> = {}): AgentGraphNode {
  return {
    id: AGENT_ID,
    name: "test-agent",
    description: "A test agent",
    type: "Agent",
    isOrchestrator: false,
    hidden: false,
    x: 100,
    y: 200,
    ...overrides,
  };
}

function makeFullExisting(): Record<string, unknown> {
  return {
    version: 1,
    agentId: AGENT_ID,
    agentName: "test-agent",
    description: "Old description",
    aspects: [{ id: "asp-1", name: "Core", filePath: "behaviors/test-agent/core.md", order: 0, enabled: true, metadata: {} }],
    skills: [{ id: "sk-1", name: "kb-search", filePath: "skills/kb-search.md", enabled: true }],
    subagents: [{ id: "sub-1111-1111-1111-111111111111", name: "helper", description: "sub", aspects: [], skills: [], metadata: {} }],
    profilePath: "behaviors/test-agent/profile.md",
    profile: [{ id: "prof-1", selector: "System Prompt", filePath: "behaviors/test-agent/system.md", order: 0, enabled: true }],
    metadata: {
      agentType: "Agent",
      isOrchestrator: "false",
      hidden: "false",
      customKey: "customValue",
    },
    permissions: {
      read: "allow",
      Bash: { "run-scripts": "allow" },
    },
    opencode: {
      provider: "GitHub-Copilot",
      model: "claude-sonnet-4.6",
      temperature: 0.05,
      hidden: false,
      steps: 7,
      color: "#ffffff",
    },
    createdAt: CREATED_AT,
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
}

// ── Tests: new agent (empty existing) ────────────────────────────────────────

describe("buildAdataFromExisting — new agent (empty existing)", () => {
  it("uses node fields for id, name, description", () => {
    const node = makeNode();
    const result = buildAdataFromExisting(node, {}, NOW);
    expect(result.agentId).toBe(AGENT_ID);
    expect(result.agentName).toBe("test-agent");
    expect(result.description).toBe("A test agent");
  });

  it("sets version to 1", () => {
    const result = buildAdataFromExisting(makeNode(), {}, NOW);
    expect(result.version).toBe(1);
  });

  it("defaults aspects, skills, subagents, profile to empty arrays", () => {
    const result = buildAdataFromExisting(makeNode(), {}, NOW);
    expect(result.aspects).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.subagents).toEqual([]);
    expect(result.profile).toEqual([]);
  });

  it("sets profilePath to slug-based default when not in existing", () => {
    const result = buildAdataFromExisting(makeNode({ name: "my-agent" }), {}, NOW);
    expect(result.profilePath).toBe("behaviors/my-agent/profile.md");
  });

  it("does NOT include permissions key for new agent", () => {
    const result = buildAdataFromExisting(makeNode(), {}, NOW);
    expect("permissions" in result && result.permissions !== undefined).toBe(false);
  });

  it("does NOT include opencode key for new agent", () => {
    const result = buildAdataFromExisting(makeNode(), {}, NOW);
    expect("opencode" in result && result.opencode !== undefined).toBe(false);
  });

  it("sets updatedAt to now", () => {
    const result = buildAdataFromExisting(makeNode(), {}, NOW);
    expect(result.updatedAt).toBe(NOW);
  });

  it("defaults createdAt to now for new agents", () => {
    const result = buildAdataFromExisting(makeNode(), {}, NOW);
    expect(result.createdAt).toBe(NOW);
  });

  it("builds correct metadata for Agent type", () => {
    const node = makeNode({ type: "Agent", isOrchestrator: true });
    const result = buildAdataFromExisting(node, {}, NOW);
    expect(result.metadata.agentType).toBe("Agent");
    expect(result.metadata.isOrchestrator).toBe("true");
    expect(result.metadata.hidden).toBe("false");
  });

  it("builds correct metadata for Sub-Agent type with hidden=true", () => {
    const node = makeNode({ type: "Sub-Agent", hidden: true });
    const result = buildAdataFromExisting(node, {}, NOW);
    expect(result.metadata.agentType).toBe("Sub-Agent");
    expect(result.metadata.hidden).toBe("true");
  });

  it("forces hidden=false for Agent type regardless of node.hidden", () => {
    // hidden field is only meaningful for Sub-Agent; always false for Agent
    const node = makeNode({ type: "Agent", hidden: true });
    const result = buildAdataFromExisting(node, {}, NOW);
    expect(result.metadata.hidden).toBe("false");
  });
});

// ── Tests: existing agent — all fields preserved ─────────────────────────────

describe("buildAdataFromExisting — existing agent with all fields", () => {
  it("preserves aspects from existing", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.aspects).toEqual(existing.aspects as unknown[]);
  });

  it("preserves skills from existing", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.skills).toEqual(existing.skills as unknown[]);
  });

  it("preserves subagents from existing", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.subagents).toEqual(existing.subagents as unknown[]);
  });

  it("preserves profile entries from existing", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.profile).toEqual(existing.profile as unknown[]);
  });

  it("preserves profilePath from existing", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.profilePath).toBe("behaviors/test-agent/profile.md");
  });

  it("preserves createdAt from existing", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.createdAt).toBe(CREATED_AT);
  });

  it("overwrites updatedAt with now", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.updatedAt).toBe(NOW);
    expect(result.updatedAt).not.toBe(existing.updatedAt);
  });

  it("overwrites agentName from node (not existing)", () => {
    const existing = makeFullExisting();
    const node = makeNode({ name: "renamed-agent" });
    const result = buildAdataFromExisting(node, existing, NOW);
    expect(result.agentName).toBe("renamed-agent");
  });

  it("overwrites description from node", () => {
    const existing = makeFullExisting();
    const node = makeNode({ description: "New description" });
    const result = buildAdataFromExisting(node, existing, NOW);
    expect(result.description).toBe("New description");
  });
});

// ── Tests: permissions preservation ─────────────────────────────────────────

describe("buildAdataFromExisting — permissions handling", () => {
  it("preserves permissions when existing has permissions", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.permissions).toEqual({
      read: "allow",
      Bash: { "run-scripts": "allow" },
    });
  });

  it("preserves permissions when existing has empty object {}", () => {
    const existing = { ...makeFullExisting(), permissions: {} };
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.permissions).toEqual({});
    expect("permissions" in result).toBe(true);
  });

  it("does NOT include permissions key when existing has no permissions", () => {
    const existing = makeFullExisting();
    delete existing.permissions;
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    // key must be absent (not set to null or undefined)
    expect(result.permissions).toBeUndefined();
  });

  it("preserves nested / complex permissions structure", () => {
    const complexPerms = {
      roles: { owner: "allow", viewer: "deny" },
      tools: "ask",
      Bash: {
        "run-scripts": "allow",
        "write-files": "deny",
        "read-files": "ask",
      },
    };
    const existing = { ...makeFullExisting(), permissions: complexPerms };
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.permissions).toEqual(complexPerms);
  });
});

// ── Tests: opencode preservation ─────────────────────────────────────────────

describe("buildAdataFromExisting — opencode handling", () => {
  it("preserves opencode config when existing has opencode", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.opencode).toEqual(existing.opencode);
  });

  it("does NOT include opencode key when existing has no opencode", () => {
    const existing = makeFullExisting();
    delete existing.opencode;
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.opencode).toBeUndefined();
  });
});

// ── Tests: metadata deep-merge ────────────────────────────────────────────────

describe("buildAdataFromExisting — metadata deep-merge", () => {
  it("existing custom metadata keys survive the merge", () => {
    const existing = makeFullExisting();
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect(result.metadata.customKey).toBe("customValue");
  });

  it("agentType is overwritten by node type", () => {
    const existing = { ...makeFullExisting(), metadata: { agentType: "Sub-Agent", customKey: "v" } };
    const node = makeNode({ type: "Agent" });
    const result = buildAdataFromExisting(node, existing, NOW);
    expect(result.metadata.agentType).toBe("Agent");
    expect(result.metadata.customKey).toBe("v");
  });

  it("isOrchestrator is overwritten by node value", () => {
    const existing = { ...makeFullExisting(), metadata: { isOrchestrator: "false" } };
    const node = makeNode({ isOrchestrator: true });
    const result = buildAdataFromExisting(node, existing, NOW);
    expect(result.metadata.isOrchestrator).toBe("true");
  });

  it("builds metadata from scratch when existing has no metadata", () => {
    const existing = makeFullExisting();
    delete existing.metadata;
    const node = makeNode({ type: "Sub-Agent", isOrchestrator: false, hidden: true });
    const result = buildAdataFromExisting(node, existing, NOW);
    expect(result.metadata.agentType).toBe("Sub-Agent");
    expect(result.metadata.isOrchestrator).toBe("false");
    expect(result.metadata.hidden).toBe("true");
  });
});

// ── Tests: unknown fields (future-compat) ─────────────────────────────────────

describe("buildAdataFromExisting — forward compatibility", () => {
  it("forwards unknown fields from existing to result", () => {
    const existing = {
      ...makeFullExisting(),
      futureField: "future-value",
      anotherNewField: { nested: true },
    };
    const result = buildAdataFromExisting(makeNode(), existing, NOW);
    expect((result as Record<string, unknown>).futureField).toBe("future-value");
    expect((result as Record<string, unknown>).anotherNewField).toEqual({ nested: true });
  });
});

// ── Tests: immutability ───────────────────────────────────────────────────────

describe("buildAdataFromExisting — immutability", () => {
  it("does NOT mutate the existing object", () => {
    const existing = makeFullExisting();
    const originalStr = JSON.stringify(existing);
    buildAdataFromExisting(makeNode(), existing, NOW);
    expect(JSON.stringify(existing)).toBe(originalStr);
  });

  it("does NOT mutate existing metadata", () => {
    const existing = makeFullExisting();
    const originalMeta = { ...(existing.metadata as Record<string, string>) };
    const node = makeNode({ type: "Sub-Agent", isOrchestrator: false, hidden: true });
    buildAdataFromExisting(node, existing, NOW);
    expect(existing.metadata).toEqual(originalMeta);
  });
});

// ── Tests: profilePath edge cases ─────────────────────────────────────────────

describe("buildAdataFromExisting — profilePath", () => {
  it("uses existing profilePath even if node.name differs (rename case)", () => {
    const existing = { ...makeFullExisting(), profilePath: "behaviors/old-name/profile.md" };
    const node = makeNode({ name: "new-name" });
    const result = buildAdataFromExisting(node, existing, NOW);
    // profilePath preserved from existing (RENAME_AGENT_FOLDER manages path updates)
    expect(result.profilePath).toBe("behaviors/old-name/profile.md");
  });

  it("uses slug-based default when existing profilePath is empty string", () => {
    const existing = { ...makeFullExisting(), profilePath: "" };
    const node = makeNode({ name: "my-agent" });
    const result = buildAdataFromExisting(node, existing, NOW);
    expect(result.profilePath).toBe("behaviors/my-agent/profile.md");
  });

  it("uses slug-based default when existing profilePath is missing", () => {
    const existing = makeFullExisting();
    delete existing.profilePath;
    const node = makeNode({ name: "my-agent" });
    const result = buildAdataFromExisting(node, existing, NOW);
    expect(result.profilePath).toBe("behaviors/my-agent/profile.md");
  });
});
