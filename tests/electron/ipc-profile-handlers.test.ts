/**
 * tests/electron/ipc-profile-handlers.test.ts
 *
 * Unit tests for the profile IPC handler logic (Phase 2).
 *
 * These tests verify the handler functions extracted from ipc-handlers.ts:
 *   - handleListProfiles
 *   - handleAddProfile
 *   - handleUpdateProfile
 *   - handleRemoveProfile
 *   - handleReorderProfiles
 *
 * The handlers are tested in isolation with:
 *   - An in-memory FileAdapter stub (no real filesystem I/O)
 *   - No Electron IPC dependency (we import the pure handler functions)
 *
 * Error mapping tests verify that ProfileError codes are correctly surfaced
 * as typed errorCode values in each result type.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  handleListProfiles,
  handleAddProfile,
  handleUpdateProfile,
  handleRemoveProfile,
  handleReorderProfiles,
} from "../../src/electron/profile-handlers.ts";
import type { FileAdapter } from "../../src/storage/adata.ts";
import type { AdataWithProfile, AgentProfile } from "../../src/types/agent.ts";

// ── In-memory FileAdapter ─────────────────────────────────────────────────

function makeMemFs(
  initial: Record<string, string> = {},
): FileAdapter & { store: Record<string, string> } {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    async readText(path: string): Promise<string> {
      if (!(path in store)) throw new Error(`ENOENT: ${path}`);
      return store[path];
    },
    async writeText(path: string, content: string): Promise<void> {
      store[path] = content;
    },
    async exists(path: string): Promise<boolean> {
      return path in store;
    },
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────

const PROJECT_DIR = "/projects/test-proj";
const AGENT_ID = "00000000-0000-0000-0000-000000000001";
const ADATA_PATH = `${PROJECT_DIR}/metadata/${AGENT_ID}.adata`;

function makeBaseAdata(profiles: AgentProfile[] = []): AdataWithProfile {
  return {
    version: 1,
    agentId: AGENT_ID,
    agentName: "Test Agent",
    description: "",
    aspects: [],
    skills: [],
    subagents: [],
    profilePath: `behaviors/${AGENT_ID}/profile.md`,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    profile: profiles,
  };
}

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "profile-id-001",
    selector: "System Prompt",
    filePath: "behaviors/abc/system.md",
    label: "Core identity",
    order: 0,
    enabled: true,
    ...overrides,
  };
}

let memFs: ReturnType<typeof makeMemFs>;

beforeEach(() => {
  memFs = makeMemFs({
    [ADATA_PATH]: JSON.stringify(makeBaseAdata()),
  });
});

// ─────────────────────────────────────────────────────────────────────────
// handleListProfiles
// ─────────────────────────────────────────────────────────────────────────

describe("handleListProfiles", () => {
  it("returns empty profiles array when agent has no profiles", async () => {
    const result = await handleListProfiles(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.profiles).toEqual([]);
    expect(result.errorCode).toBeUndefined();
  });

  it("returns sorted profiles when agent has profiles", async () => {
    const profiles: AgentProfile[] = [
      makeProfile({ id: "p1", order: 1 }),
      makeProfile({ id: "p2", order: 0, selector: "Memory", filePath: "behaviors/abc/mem.md" }),
    ];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    const result = await handleListProfiles(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.profiles).toHaveLength(2);
    // Sorted by order — p2 (order=0) comes first
    expect(result.profiles[0]?.id).toBe("p2");
    expect(result.profiles[1]?.id).toBe("p1");
  });

  it("returns AGENT_NOT_FOUND when .adata file is missing", async () => {
    const result = await handleListProfiles(makeMemFs(), {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AGENT_NOT_FOUND");
    expect(result.profiles).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// handleAddProfile
// ─────────────────────────────────────────────────────────────────────────

describe("handleAddProfile", () => {
  it("adds a new profile and returns the updated list", async () => {
    const result = await handleAddProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      selector: "System Prompt",
      filePath: "behaviors/abc/system.md",
    });

    expect(result.success).toBe(true);
    expect(result.profile).toBeDefined();
    expect(result.profile?.selector).toBe("System Prompt");
    expect(result.profile?.filePath).toBe("behaviors/abc/system.md");
    expect(result.profile?.id).toBeDefined();
    expect(result.profiles).toHaveLength(1);
  });

  it("appends after existing profiles with auto-incremented order", async () => {
    const existing: AgentProfile[] = [makeProfile({ id: "p1", order: 0 })];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(existing));

    const result = await handleAddProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      selector: "Memory",
      filePath: "behaviors/abc/mem.md",
    });

    expect(result.success).toBe(true);
    expect(result.profiles).toHaveLength(2);
    // New profile should have order=1 (max+1)
    const newProfile = result.profiles?.find((p) => p.selector === "Memory");
    expect(newProfile?.order).toBe(1);
  });

  it("returns AGENT_NOT_FOUND when .adata file is missing", async () => {
    const result = await handleAddProfile(makeMemFs(), {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      selector: "Memory",
      filePath: "behaviors/abc/mem.md",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AGENT_NOT_FOUND");
  });

  it("returns INVALID_INPUT when filePath is empty", async () => {
    const result = await handleAddProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      selector: "Memory",
      filePath: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
  });

  it("returns INVALID_INPUT when selector is empty", async () => {
    const result = await handleAddProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      selector: "",
      filePath: "behaviors/abc/mem.md",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// handleUpdateProfile
// ─────────────────────────────────────────────────────────────────────────

describe("handleUpdateProfile", () => {
  it("updates the label of an existing profile", async () => {
    const profiles: AgentProfile[] = [makeProfile({ id: "p1" })];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    const result = await handleUpdateProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "p1",
      patch: { label: "Updated label" },
    });

    expect(result.success).toBe(true);
    const updated = result.profiles?.find((p) => p.id === "p1");
    expect(updated?.label).toBe("Updated label");
    // Other fields preserved
    expect(updated?.selector).toBe("System Prompt");
    expect(updated?.filePath).toBe("behaviors/abc/system.md");
  });

  it("updates the enabled flag without touching other fields", async () => {
    const profiles: AgentProfile[] = [makeProfile({ id: "p1", enabled: true })];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    const result = await handleUpdateProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "p1",
      patch: { enabled: false },
    });

    expect(result.success).toBe(true);
    const updated = result.profiles?.find((p) => p.id === "p1");
    expect(updated?.enabled).toBe(false);
    expect(updated?.id).toBe("p1"); // id immutable
  });

  it("returns AGENT_NOT_FOUND when .adata file is missing", async () => {
    const result = await handleUpdateProfile(makeMemFs(), {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "p1",
      patch: { label: "new" },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AGENT_NOT_FOUND");
  });

  it("returns PROFILE_NOT_FOUND when profileId does not exist", async () => {
    const result = await handleUpdateProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "non-existent",
      patch: { label: "new" },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PROFILE_NOT_FOUND");
  });

  it("returns INVALID_INPUT when patching filePath to empty string", async () => {
    const profiles: AgentProfile[] = [makeProfile({ id: "p1" })];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    const result = await handleUpdateProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "p1",
      patch: { filePath: "" },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// handleRemoveProfile
// ─────────────────────────────────────────────────────────────────────────

describe("handleRemoveProfile", () => {
  it("removes a profile and returns the remaining list", async () => {
    const profiles: AgentProfile[] = [
      makeProfile({ id: "p1", order: 0 }),
      makeProfile({ id: "p2", order: 1, selector: "Memory", filePath: "behaviors/abc/mem.md" }),
    ];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    const result = await handleRemoveProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "p1",
    });

    expect(result.success).toBe(true);
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles?.[0]?.id).toBe("p2");
  });

  it("returns an empty list when last profile is removed", async () => {
    const profiles: AgentProfile[] = [makeProfile({ id: "p1" })];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    const result = await handleRemoveProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "p1",
    });

    expect(result.success).toBe(true);
    expect(result.profiles).toHaveLength(0);
  });

  it("returns AGENT_NOT_FOUND when .adata file is missing", async () => {
    const result = await handleRemoveProfile(makeMemFs(), {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "p1",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AGENT_NOT_FOUND");
  });

  it("returns PROFILE_NOT_FOUND when profileId does not exist", async () => {
    const result = await handleRemoveProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      profileId: "non-existent",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PROFILE_NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// handleReorderProfiles
// ─────────────────────────────────────────────────────────────────────────

describe("handleReorderProfiles", () => {
  it("reorders profiles by supplying IDs in the new order", async () => {
    const profiles: AgentProfile[] = [
      makeProfile({ id: "p1", order: 0 }),
      makeProfile({ id: "p2", order: 1, selector: "Memory", filePath: "behaviors/abc/mem.md" }),
      makeProfile({ id: "p3", order: 2, selector: "Tools", filePath: "behaviors/abc/tools.md" }),
    ];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    const result = await handleReorderProfiles(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      orderedIds: ["p3", "p1", "p2"],
    });

    expect(result.success).toBe(true);
    expect(result.profiles).toHaveLength(3);
    // p3 should be first (order=0), p1 second (order=1), p2 third (order=2)
    expect(result.profiles?.[0]?.id).toBe("p3");
    expect(result.profiles?.[0]?.order).toBe(0);
    expect(result.profiles?.[1]?.id).toBe("p1");
    expect(result.profiles?.[1]?.order).toBe(1);
    expect(result.profiles?.[2]?.id).toBe("p2");
    expect(result.profiles?.[2]?.order).toBe(2);
  });

  it("appends unmentioned profiles after the ordered ones", async () => {
    const profiles: AgentProfile[] = [
      makeProfile({ id: "p1", order: 0 }),
      makeProfile({ id: "p2", order: 1, selector: "Memory", filePath: "behaviors/abc/mem.md" }),
    ];
    memFs.store[ADATA_PATH] = JSON.stringify(makeBaseAdata(profiles));

    // Only mention p2 — p1 should be appended after
    const result = await handleReorderProfiles(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      orderedIds: ["p2"],
    });

    expect(result.success).toBe(true);
    expect(result.profiles).toHaveLength(2);
    expect(result.profiles?.[0]?.id).toBe("p2");
    expect(result.profiles?.[1]?.id).toBe("p1");
  });

  it("returns AGENT_NOT_FOUND when .adata file is missing", async () => {
    const result = await handleReorderProfiles(makeMemFs(), {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      orderedIds: ["p1", "p2"],
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AGENT_NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Error code mapping — generic catch path
// ─────────────────────────────────────────────────────────────────────────

describe("error code mapping", () => {
  it("maps ProfileError INVALID_INPUT correctly from handleAddProfile", async () => {
    // Both filePath and selector empty triggers INVALID_INPUT
    const result = await handleAddProfile(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
      selector: "",
      filePath: "",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
    expect(typeof result.error).toBe("string");
  });

  it("maps UNKNOWN for unexpected errors (corrupt JSON)", async () => {
    // Put corrupt JSON in the store to trigger a parse error in the storage layer
    memFs.store[ADATA_PATH] = "{ not valid json }";

    const result = await handleListProfiles(memFs, {
      projectDir: PROJECT_DIR,
      agentId: AGENT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("UNKNOWN");
  });
});
