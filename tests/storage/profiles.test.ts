/**
 * tests/storage/profiles.test.ts
 *
 * Unit tests for src/storage/profiles.ts
 *
 * Covers all exported functions:
 *   - listProfiles
 *   - addProfile
 *   - updateProfile
 *   - removeProfile
 *   - reorderProfiles
 *   - setProfileEnabled
 *   - ProfileError codes
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  listProfiles,
  addProfile,
  updateProfile,
  removeProfile,
  reorderProfiles,
  setProfileEnabled,
  ProfileError,
} from "../../src/storage/profiles.ts";
import type { FileAdapter } from "../../src/storage/adata.ts";
import type { AgentProfile, AdataWithProfile } from "../../src/types/agent.ts";

// ── In-memory FileAdapter stub ────────────────────────────────────────────

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

// ── Fixtures ──────────────────────────────────────────────────────────────

const PROJECT_DIR = "/projects/test-proj";
const AGENT_ID = "00000000-0000-0000-0000-000000000001";
const ADATA_PATH = `${PROJECT_DIR}/metadata/${AGENT_ID}.adata`;

function makeBaseAdata(
  profiles: AgentProfile[] = [],
): AdataWithProfile {
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

function seedFs(profiles: AgentProfile[] = []): ReturnType<typeof makeMemFs> {
  const adata = makeBaseAdata(profiles);
  return makeMemFs({ [ADATA_PATH]: JSON.stringify(adata) });
}

// ── listProfiles ──────────────────────────────────────────────────────────

describe("listProfiles", () => {
  it("throws AGENT_NOT_FOUND when .adata file is absent", async () => {
    const fs = makeMemFs();

    await expect(listProfiles(fs, PROJECT_DIR, AGENT_ID)).rejects.toThrow(ProfileError);
    try {
      await listProfiles(fs, PROJECT_DIR, AGENT_ID);
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileError);
      expect((err as ProfileError).code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("returns empty array when agent has no profiles", async () => {
    const fs = seedFs([]);
    const result = await listProfiles(fs, PROJECT_DIR, AGENT_ID);
    expect(result).toEqual([]);
  });

  it("returns profiles sorted by order", async () => {
    const profiles = [
      makeProfile({ id: "p3", order: 2, selector: "Tools" }),
      makeProfile({ id: "p1", order: 0, selector: "System Prompt" }),
      makeProfile({ id: "p2", order: 1, selector: "Memory" }),
    ];
    const fs = seedFs(profiles);

    const result = await listProfiles(fs, PROJECT_DIR, AGENT_ID);
    expect(result).toHaveLength(3);
    expect(result[0]?.id).toBe("p1");
    expect(result[1]?.id).toBe("p2");
    expect(result[2]?.id).toBe("p3");
  });
});

// ── addProfile ────────────────────────────────────────────────────────────

describe("addProfile", () => {
  it("throws AGENT_NOT_FOUND when .adata file is absent", async () => {
    const fs = makeMemFs();
    await expect(
      addProfile(fs, PROJECT_DIR, AGENT_ID, {
        selector: "Memory",
        filePath: "behaviors/abc/mem.md",
        enabled: true,
      })
    ).rejects.toThrow(ProfileError);
  });

  it("throws INVALID_INPUT when filePath is empty", async () => {
    const fs = seedFs();
    try {
      await addProfile(fs, PROJECT_DIR, AGENT_ID, {
        selector: "Memory",
        filePath: "",
        enabled: true,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileError);
      expect((err as ProfileError).code).toBe("INVALID_INPUT");
    }
  });

  it("throws INVALID_INPUT when selector is empty", async () => {
    const fs = seedFs();
    try {
      await addProfile(fs, PROJECT_DIR, AGENT_ID, {
        selector: "",
        filePath: "behaviors/abc/mem.md",
        enabled: true,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileError);
      expect((err as ProfileError).code).toBe("INVALID_INPUT");
    }
  });

  it("adds a new profile and returns the updated list", async () => {
    const fs = seedFs();
    const result = await addProfile(fs, PROJECT_DIR, AGENT_ID, {
      selector: "System Prompt",
      filePath: "behaviors/abc/system.md",
      enabled: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.selector).toBe("System Prompt");
    expect(result[0]?.filePath).toBe("behaviors/abc/system.md");
    expect(result[0]?.enabled).toBe(true);
    // id must be a non-empty string (UUID)
    expect(typeof result[0]?.id).toBe("string");
    expect(result[0]?.id).not.toBe("");
  });

  it("assigns order 0 when list is empty", async () => {
    const fs = seedFs();
    const result = await addProfile(fs, PROJECT_DIR, AGENT_ID, {
      selector: "Memory",
      filePath: "behaviors/abc/mem.md",
      enabled: true,
    });
    expect(result[0]?.order).toBe(0);
  });

  it("appends with max+1 order when list is non-empty", async () => {
    const existing = [
      makeProfile({ id: "p1", order: 0 }),
      makeProfile({ id: "p2", order: 3 }),
    ];
    const fs = seedFs(existing);

    const result = await addProfile(fs, PROJECT_DIR, AGENT_ID, {
      selector: "Tools",
      filePath: "behaviors/abc/tools.md",
      enabled: true,
    });

    const newEntry = result.find((p) => p.selector === "Tools");
    expect(newEntry?.order).toBe(4); // max(0,3) + 1
  });

  it("persists the new profile to the .adata file", async () => {
    const fs = seedFs();
    await addProfile(fs, PROJECT_DIR, AGENT_ID, {
      selector: "Context",
      filePath: "behaviors/abc/ctx.md",
      enabled: true,
    });

    const written = JSON.parse(fs.store[ADATA_PATH]!);
    expect(written.profile).toHaveLength(1);
    expect(written.profile[0].selector).toBe("Context");
  });

  it("does not overwrite existing profiles in the file", async () => {
    const existing = [makeProfile({ id: "p1" })];
    const fs = seedFs(existing);

    await addProfile(fs, PROJECT_DIR, AGENT_ID, {
      selector: "Rules",
      filePath: "behaviors/abc/rules.md",
      enabled: false,
    });

    const written = JSON.parse(fs.store[ADATA_PATH]!);
    expect(written.profile).toHaveLength(2);
  });
});

// ── updateProfile ─────────────────────────────────────────────────────────

describe("updateProfile", () => {
  it("throws AGENT_NOT_FOUND when .adata file is absent", async () => {
    const fs = makeMemFs();
    await expect(
      updateProfile(fs, PROJECT_DIR, AGENT_ID, "p1", { label: "New" })
    ).rejects.toThrow(ProfileError);
  });

  it("throws PROFILE_NOT_FOUND when profile id does not exist", async () => {
    const fs = seedFs([makeProfile({ id: "p1" })]);
    try {
      await updateProfile(fs, PROJECT_DIR, AGENT_ID, "non-existent", { label: "x" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileError);
      expect((err as ProfileError).code).toBe("PROFILE_NOT_FOUND");
    }
  });

  it("throws INVALID_INPUT when patching to empty filePath", async () => {
    const fs = seedFs([makeProfile({ id: "p1" })]);
    try {
      await updateProfile(fs, PROJECT_DIR, AGENT_ID, "p1", { filePath: "" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProfileError).code).toBe("INVALID_INPUT");
    }
  });

  it("throws INVALID_INPUT when patching to empty selector", async () => {
    const fs = seedFs([makeProfile({ id: "p1" })]);
    try {
      await updateProfile(fs, PROJECT_DIR, AGENT_ID, "p1", { selector: "  " });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProfileError).code).toBe("INVALID_INPUT");
    }
  });

  it("updates specified fields only", async () => {
    const original = makeProfile({ id: "p1", label: "Old label", enabled: true });
    const fs = seedFs([original]);

    const result = await updateProfile(fs, PROJECT_DIR, AGENT_ID, "p1", {
      label: "New label",
    });

    const updated = result.find((p) => p.id === "p1")!;
    expect(updated.label).toBe("New label");
    // Other fields must be unchanged
    expect(updated.selector).toBe(original.selector);
    expect(updated.filePath).toBe(original.filePath);
    expect(updated.enabled).toBe(true);
  });

  it("preserves the id even if patch tries to overwrite it", async () => {
    const original = makeProfile({ id: "p1" });
    const fs = seedFs([original]);

    const result = await updateProfile(
      fs,
      PROJECT_DIR,
      AGENT_ID,
      "p1",
      { label: "Updated" },
    );

    const updated = result.find((p) => p.id === "p1")!;
    expect(updated.id).toBe("p1");
  });

  it("persists the update to disk", async () => {
    const fs = seedFs([makeProfile({ id: "p1", label: "Before" })]);

    await updateProfile(fs, PROJECT_DIR, AGENT_ID, "p1", { label: "After" });

    const written = JSON.parse(fs.store[ADATA_PATH]!);
    expect(written.profile[0].label).toBe("After");
  });
});

// ── removeProfile ─────────────────────────────────────────────────────────

describe("removeProfile", () => {
  it("throws AGENT_NOT_FOUND when .adata file is absent", async () => {
    const fs = makeMemFs();
    await expect(
      removeProfile(fs, PROJECT_DIR, AGENT_ID, "p1")
    ).rejects.toThrow(ProfileError);
  });

  it("throws PROFILE_NOT_FOUND when profile id does not exist", async () => {
    const fs = seedFs([makeProfile({ id: "p1" })]);
    try {
      await removeProfile(fs, PROJECT_DIR, AGENT_ID, "non-existent");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProfileError).code).toBe("PROFILE_NOT_FOUND");
    }
  });

  it("removes the profile and returns the updated list", async () => {
    const profiles = [
      makeProfile({ id: "p1", selector: "Memory" }),
      makeProfile({ id: "p2", selector: "Tools", order: 1 }),
    ];
    const fs = seedFs(profiles);

    const result = await removeProfile(fs, PROJECT_DIR, AGENT_ID, "p1");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p2");
  });

  it("persists the removal to disk", async () => {
    const fs = seedFs([makeProfile({ id: "p1" })]);

    await removeProfile(fs, PROJECT_DIR, AGENT_ID, "p1");

    const written = JSON.parse(fs.store[ADATA_PATH]!);
    expect(written.profile).toHaveLength(0);
  });

  it("removing the last profile results in empty array on disk", async () => {
    const fs = seedFs([makeProfile({ id: "only" })]);

    await removeProfile(fs, PROJECT_DIR, AGENT_ID, "only");

    const written = JSON.parse(fs.store[ADATA_PATH]!);
    expect(written.profile).toEqual([]);
  });
});

// ── reorderProfiles ───────────────────────────────────────────────────────

describe("reorderProfiles", () => {
  it("throws AGENT_NOT_FOUND when .adata file is absent", async () => {
    const fs = makeMemFs();
    await expect(
      reorderProfiles(fs, PROJECT_DIR, AGENT_ID, ["p1"])
    ).rejects.toThrow(ProfileError);
  });

  it("assigns order based on position in orderedIds", async () => {
    const profiles = [
      makeProfile({ id: "p1", order: 0 }),
      makeProfile({ id: "p2", order: 1 }),
      makeProfile({ id: "p3", order: 2 }),
    ];
    const fs = seedFs(profiles);

    // Reverse the order
    const result = await reorderProfiles(fs, PROJECT_DIR, AGENT_ID, ["p3", "p1", "p2"]);

    const p3 = result.find((p) => p.id === "p3")!;
    const p1 = result.find((p) => p.id === "p1")!;
    const p2 = result.find((p) => p.id === "p2")!;

    expect(p3.order).toBe(0);
    expect(p1.order).toBe(1);
    expect(p2.order).toBe(2);
  });

  it("appends profiles not in orderedIds after the ordered ones", async () => {
    const profiles = [
      makeProfile({ id: "p1", order: 0 }),
      makeProfile({ id: "p2", order: 1 }),
      makeProfile({ id: "extra", order: 2 }),
    ];
    const fs = seedFs(profiles);

    // Only specify p2 and p1 — 'extra' should be appended
    const result = await reorderProfiles(fs, PROJECT_DIR, AGENT_ID, ["p2", "p1"]);

    const extra = result.find((p) => p.id === "extra")!;
    expect(extra.order).toBeGreaterThan(1); // appended after p2(0) and p1(1)
  });

  it("silently ignores IDs not in the current profile list", async () => {
    const profiles = [makeProfile({ id: "p1" })];
    const fs = seedFs(profiles);

    const result = await reorderProfiles(fs, PROJECT_DIR, AGENT_ID, [
      "ghost-id",
      "p1",
    ]);

    expect(result).toHaveLength(1);
    const p1 = result.find((p) => p.id === "p1")!;
    expect(p1.order).toBe(1); // "ghost-id" skipped, p1 at index 1
  });

  it("persists the new order to disk", async () => {
    const profiles = [
      makeProfile({ id: "p1", order: 0 }),
      makeProfile({ id: "p2", order: 1 }),
    ];
    const fs = seedFs(profiles);

    await reorderProfiles(fs, PROJECT_DIR, AGENT_ID, ["p2", "p1"]);

    const written = JSON.parse(fs.store[ADATA_PATH]!);
    const writtenP2 = written.profile.find((p: AgentProfile) => p.id === "p2");
    expect(writtenP2?.order).toBe(0);
  });
});

// ── setProfileEnabled ─────────────────────────────────────────────────────

describe("setProfileEnabled", () => {
  it("sets enabled to the explicit value", async () => {
    const fs = seedFs([makeProfile({ id: "p1", enabled: true })]);

    const result = await setProfileEnabled(
      fs,
      PROJECT_DIR,
      AGENT_ID,
      "p1",
      false,
    );

    const p1 = result.find((p) => p.id === "p1")!;
    expect(p1.enabled).toBe(false);
  });

  it("flips enabled when no value is provided (true → false)", async () => {
    const fs = seedFs([makeProfile({ id: "p1", enabled: true })]);

    const result = await setProfileEnabled(fs, PROJECT_DIR, AGENT_ID, "p1");

    const p1 = result.find((p) => p.id === "p1")!;
    expect(p1.enabled).toBe(false);
  });

  it("flips enabled when no value is provided (false → true)", async () => {
    const fs = seedFs([makeProfile({ id: "p1", enabled: false })]);

    const result = await setProfileEnabled(fs, PROJECT_DIR, AGENT_ID, "p1");

    const p1 = result.find((p) => p.id === "p1")!;
    expect(p1.enabled).toBe(true);
  });

  it("throws PROFILE_NOT_FOUND for unknown id", async () => {
    const fs = seedFs([makeProfile({ id: "p1" })]);

    try {
      await setProfileEnabled(fs, PROJECT_DIR, AGENT_ID, "ghost");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProfileError).code).toBe("PROFILE_NOT_FOUND");
    }
  });
});

// ── ProfileError ──────────────────────────────────────────────────────────

describe("ProfileError", () => {
  it("is an instance of Error", () => {
    const err = new ProfileError("AGENT_NOT_FOUND", "test");
    expect(err).toBeInstanceOf(Error);
  });

  it("has the expected code and message", () => {
    const err = new ProfileError("INVALID_INPUT", "bad input");
    expect(err.code).toBe("INVALID_INPUT");
    expect(err.message).toBe("bad input");
    expect(err.name).toBe("ProfileError");
  });
});
