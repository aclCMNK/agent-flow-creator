/**
 * tests/electron/save-agent-graph-preserves-metadata.test.ts
 *
 * Integration tests: SAVE_AGENT_GRAPH metadata preservation.
 *
 * These tests simulate the full save cycle for a single agent:
 *   1. Write an initial `.adata` file to a temp directory (with metadata fields)
 *   2. Call `buildAdataFromExisting` (the function wired into the IPC handler)
 *   3. Write the result atomically to disk
 *   4. Read back the written file and assert nothing was lost
 *
 * This validates the real contract between the builder and the disk write,
 * covering the scenarios from the spec:
 *   - All metadata fields preserved (permissions, opencode, aspects, skills,
 *     subagents, profile, profilePath, metadata, createdAt)
 *   - permissions: full object survives
 *   - permissions: empty object {} survives (not dropped)
 *   - permissions: absent → not injected
 *   - permissions: nested/complex structure deep-equal
 *   - Full cycle: write → save → reload → identical
 *
 * No Electron IPC dependency — tests the pure builder + atomicWriteJson path.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { buildAdataFromExisting } from "../../src/electron/adata-builder.ts";
import { atomicWriteJson } from "../../src/loader/lock-manager.ts";
import type { AgentGraphNode } from "../../src/electron/bridge.types.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AGENT_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const NOW = "2026-04-15T12:00:00.000Z";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

function makeNode(overrides: Partial<AgentGraphNode> = {}): AgentGraphNode {
  return {
    id: AGENT_ID,
    name: "orchestrator",
    description: "The main orchestrator agent",
    type: "Agent",
    isOrchestrator: true,
    hidden: false,
    x: 100,
    y: 200,
    ...overrides,
  };
}

/** Simulates the handler's read → buildAdataFromExisting → atomicWriteJson cycle */
async function simulateSaveCycle(
  metaDir: string,
  agentId: string,
  node: AgentGraphNode,
  now: string,
): Promise<Record<string, unknown>> {
  const adataPath = join(metaDir, `${agentId}.adata`);

  // Read existing (same as handler)
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(adataPath, "utf-8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet — start fresh
  }

  const adata = buildAdataFromExisting(node, existing, now);
  await atomicWriteJson(adataPath, adata);

  // Read back
  const written = JSON.parse(await readFile(adataPath, "utf-8")) as Record<string, unknown>;
  return written;
}

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let metaDir: string;
let adataPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "agentsflow-save-test-"));
  metaDir = join(tmpDir, "metadata");
  await mkdir(metaDir, { recursive: true });
  adataPath = join(metaDir, `${AGENT_ID}.adata`);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Core: permissions preservation ────────────────────────────────────────────

describe("SAVE_AGENT_GRAPH preserves permissions — full object", () => {
  it("preserves a non-empty permissions object after save cycle", async () => {
    const permissions = {
      read: "allow",
      Bash: { "run-scripts": "allow", "write-files": "deny" },
    };

    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "The main orchestrator agent",
        aspects: [],
        skills: [],
        subagents: [],
        profile: [],
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: { agentType: "Agent", isOrchestrator: "true", hidden: "false" },
        permissions,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    expect(written.permissions).toEqual(permissions);
  });

  it("permissions survive even when other agent fields change", async () => {
    const permissions = { Bash: { execute: "ask" }, Edit: { "write-files": "allow" } };

    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "Old description",
        aspects: [],
        skills: [],
        subagents: [],
        profile: [],
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: { agentType: "Agent", isOrchestrator: "true", hidden: "false" },
        permissions,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    // Simulate user editing description and saving
    const node = makeNode({ description: "Updated description" });
    const written = await simulateSaveCycle(metaDir, AGENT_ID, node, NOW);

    // Description changed but permissions survived
    expect(written.description).toBe("Updated description");
    expect(written.permissions).toEqual(permissions);
  });
});

describe("SAVE_AGENT_GRAPH preserves permissions — empty object {}", () => {
  it("preserves permissions: {} (not dropped, not null)", async () => {
    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "An agent",
        aspects: [],
        skills: [],
        subagents: [],
        profile: [],
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: { agentType: "Agent", isOrchestrator: "true", hidden: "false" },
        permissions: {},
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    // Must be present and equal to {} (not undefined, not null, not absent)
    expect("permissions" in written).toBe(true);
    expect(written.permissions).toEqual({});
  });
});

describe("SAVE_AGENT_GRAPH preserves permissions — absent", () => {
  it("does NOT inject permissions for brand-new agent (no existing file)", async () => {
    // Note: no adataPath pre-written → simulates new agent
    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    // permissions must be absent (not {} or null)
    expect(written.permissions).toBeUndefined();
  });

  it("does NOT inject permissions when existing .adata has no permissions key", async () => {
    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "An agent",
        aspects: [],
        skills: [],
        subagents: [],
        profile: [],
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: { agentType: "Agent", isOrchestrator: "true", hidden: "false" },
        // No permissions key
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    expect(written.permissions).toBeUndefined();
  });
});

describe("SAVE_AGENT_GRAPH preserves permissions — nested/complex", () => {
  it("preserves a complex nested permissions structure deep-equal", async () => {
    const complexPermissions = {
      read: "allow",
      execute: "ask",
      Bash: {
        "run-scripts": "allow",
        "write-files": "deny",
        "read-files": "ask",
      },
      Edit: {
        "create-files": "allow",
        "delete-files": "deny",
      },
      WebSearch: { search: "allow" },
    };

    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "An agent",
        aspects: [],
        skills: [],
        subagents: [],
        profile: [],
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: { agentType: "Agent", isOrchestrator: "true", hidden: "false" },
        permissions: complexPermissions,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    expect(written.permissions).toEqual(complexPermissions);
  });
});

// ── All fields survive cycle ───────────────────────────────────────────────────

describe("SAVE_AGENT_GRAPH preserves all metadata fields alongside permissions", () => {
  it("aspects, skills, subagents, profile, metadata, permissions, opencode all survive", async () => {
    const aspects = [{ id: "asp-1", name: "Core", filePath: "behaviors/orchestrator/core.md", order: 0, enabled: true, metadata: {} }];
    const skills = [{ id: "sk-1", name: "kb-search", filePath: "skills/kb-search.md", enabled: true }];
    const subagents = [{ id: "99999999-9999-9999-9999-999999999999", name: "helper", description: "sub", aspects: [], skills: [], metadata: {} }];
    const profile = [{ id: "prof-1", selector: "System Prompt", filePath: "behaviors/orchestrator/system.md", order: 0, enabled: true }];
    const permissions = { read: "allow", Bash: { execute: "ask" } };
    const opencode = { provider: "GitHub-Copilot", model: "claude-sonnet-4.6", temperature: 0.05, hidden: false, steps: 7, color: "#ffffff" };
    const customMeta = { agentType: "Agent", isOrchestrator: "true", hidden: "false", customKey: "customValue" };

    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "An agent",
        aspects,
        skills,
        subagents,
        profile,
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: customMeta,
        permissions,
        opencode,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    expect(written.aspects).toEqual(aspects);
    expect(written.skills).toEqual(skills);
    expect(written.subagents).toEqual(subagents);
    expect(written.profile).toEqual(profile);
    expect(written.permissions).toEqual(permissions);
    expect(written.opencode).toEqual(opencode);
    // Custom metadata key must survive
    expect((written.metadata as Record<string, string>).customKey).toBe("customValue");
    // profilePath preserved
    expect(written.profilePath).toBe("behaviors/orchestrator/profile.md");
    // createdAt preserved
    expect(written.createdAt).toBe(CREATED_AT);
  });
});

// ── opencode preservation ─────────────────────────────────────────────────────

describe("SAVE_AGENT_GRAPH preserves opencode config", () => {
  it("preserves opencode config after save cycle", async () => {
    const opencode = { provider: "GitHub-Copilot", model: "gpt-4o", temperature: 0.1, hidden: false, steps: 10, color: "#aabbcc" };

    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "An agent",
        aspects: [],
        skills: [],
        subagents: [],
        profile: [],
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: { agentType: "Agent", isOrchestrator: "true", hidden: "false" },
        opencode,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    expect(written.opencode).toEqual(opencode);
  });

  it("does NOT inject opencode for brand-new agent", async () => {
    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);
    expect(written.opencode).toBeUndefined();
  });
});

// ── updatedAt / createdAt ─────────────────────────────────────────────────────

describe("SAVE_AGENT_GRAPH timestamp behavior", () => {
  it("updatedAt is always set to now argument value", async () => {
    await writeFile(
      adataPath,
      JSON.stringify({
        version: 1,
        agentId: AGENT_ID,
        agentName: "orchestrator",
        description: "An agent",
        aspects: [],
        skills: [],
        subagents: [],
        profile: [],
        profilePath: "behaviors/orchestrator/profile.md",
        metadata: { agentType: "Agent", isOrchestrator: "true", hidden: "false" },
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
      "utf-8",
    );

    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);

    expect(written.updatedAt).toBe(NOW);
    expect(written.createdAt).toBe(CREATED_AT);
  });

  it("createdAt is set to now for brand-new agent (no existing file)", async () => {
    const written = await simulateSaveCycle(metaDir, AGENT_ID, makeNode(), NOW);
    expect(written.createdAt).toBe(NOW);
  });
});
