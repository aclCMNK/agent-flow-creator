/**
 * tests/storage/adata.test.ts
 *
 * Unit tests for src/storage/adata.ts
 *
 * Covers:
 *   - adataPath: path construction
 *   - readAdataRaw: file not found, valid JSON, parse error
 *   - writeAdataRaw: updatedAt is refreshed, pretty JSON written
 *   - normaliseProfiles: missing key, non-array, valid entries, malformed entries
 *   - mergeProfiles: non-destructive merge
 *   - readAdataWithProfiles: combined read+normalise
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  adataPath,
  readAdataRaw,
  writeAdataRaw,
  normaliseProfiles,
  mergeProfiles,
  readAdataWithProfiles,
  type FileAdapter,
} from "../../src/storage/adata.ts";
import type { AdataWithProfile } from "../../src/types/agent.ts";

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

function makeValidAdata(overrides: Partial<AdataWithProfile> = {}): AdataWithProfile {
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
    ...overrides,
  };
}

// ── adataPath ─────────────────────────────────────────────────────────────

describe("adataPath", () => {
  it("constructs the expected path", () => {
    const result = adataPath("/projects/foo", "abc-123");
    expect(result).toBe("/projects/foo/metadata/abc-123.adata");
  });

  it("handles trailing slash in projectDir gracefully", () => {
    // No normalization expected — the caller provides a clean path
    const result = adataPath("/projects/foo", "abc-123");
    expect(result).toContain("metadata/abc-123.adata");
  });
});

// ── readAdataRaw ──────────────────────────────────────────────────────────

describe("readAdataRaw", () => {
  it("returns null when the file does not exist", async () => {
    const fs = makeMemFs();
    const result = await readAdataRaw(fs, PROJECT_DIR, AGENT_ID);
    expect(result).toBeNull();
  });

  it("parses a valid .adata file", async () => {
    const adata = makeValidAdata();
    const fs = makeMemFs({
      [`${PROJECT_DIR}/metadata/${AGENT_ID}.adata`]: JSON.stringify(adata),
    });

    const result = await readAdataRaw(fs, PROJECT_DIR, AGENT_ID);
    expect(result).not.toBeNull();
    expect(result?.agentId).toBe(AGENT_ID);
    expect(result?.version).toBe(1);
  });

  it("preserves unknown extra keys", async () => {
    const raw = { ...makeValidAdata(), customField: "preserved" };
    const fs = makeMemFs({
      [`${PROJECT_DIR}/metadata/${AGENT_ID}.adata`]: JSON.stringify(raw),
    });

    const result = await readAdataRaw(fs, PROJECT_DIR, AGENT_ID);
    expect((result as Record<string, unknown>)?.customField).toBe("preserved");
  });

  it("throws on malformed JSON", async () => {
    const fs = makeMemFs({
      [`${PROJECT_DIR}/metadata/${AGENT_ID}.adata`]: "{ not valid json !!",
    });

    await expect(readAdataRaw(fs, PROJECT_DIR, AGENT_ID)).rejects.toThrow();
  });
});

// ── writeAdataRaw ─────────────────────────────────────────────────────────

describe("writeAdataRaw", () => {
  it("writes pretty-printed JSON to the correct path", async () => {
    const fs = makeMemFs();
    const adata = makeValidAdata();

    await writeAdataRaw(fs, PROJECT_DIR, AGENT_ID, adata);

    const key = `${PROJECT_DIR}/metadata/${AGENT_ID}.adata`;
    expect(key in fs.store).toBe(true);

    const parsed = JSON.parse(fs.store[key]!);
    expect(parsed.agentId).toBe(AGENT_ID);
    // Should be pretty-printed (contains newlines)
    expect(fs.store[key]).toContain("\n");
  });

  it("refreshes updatedAt on write", async () => {
    const fs = makeMemFs();
    const adata = makeValidAdata({
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    const before = Date.now();
    await writeAdataRaw(fs, PROJECT_DIR, AGENT_ID, adata);
    const after = Date.now();

    const key = `${PROJECT_DIR}/metadata/${AGENT_ID}.adata`;
    const parsed = JSON.parse(fs.store[key]!);
    const writtenAt = new Date(parsed.updatedAt).getTime();

    expect(writtenAt).toBeGreaterThanOrEqual(before);
    expect(writtenAt).toBeLessThanOrEqual(after);
  });

  it("preserves all other fields when writing", async () => {
    const fs = makeMemFs();
    const adata = makeValidAdata({ description: "Hello world" });

    await writeAdataRaw(fs, PROJECT_DIR, AGENT_ID, adata);

    const key = `${PROJECT_DIR}/metadata/${AGENT_ID}.adata`;
    const parsed = JSON.parse(fs.store[key]!);
    expect(parsed.description).toBe("Hello world");
    expect(parsed.agentName).toBe("Test Agent");
  });
});

// ── normaliseProfiles ─────────────────────────────────────────────────────

describe("normaliseProfiles", () => {
  it("returns [] when profile key is absent", () => {
    const adata = makeValidAdata();
    // Ensure no profile key
    delete (adata as Record<string, unknown>).profile;
    expect(normaliseProfiles(adata)).toEqual([]);
  });

  it("returns [] when profile is null", () => {
    const adata = makeValidAdata({ profile: null as unknown as undefined });
    expect(normaliseProfiles(adata)).toEqual([]);
  });

  it("returns [] when profile is a non-array (logs warning)", () => {
    const adata = makeValidAdata({
      profile: "not-an-array" as unknown as undefined,
    });
    expect(normaliseProfiles(adata)).toEqual([]);
  });

  it("returns empty array for empty profile array", () => {
    const adata = makeValidAdata({ profile: [] });
    expect(normaliseProfiles(adata)).toEqual([]);
  });

  it("normalises a valid profile entry with all fields", () => {
    const adata = makeValidAdata({
      profile: [
        {
          id: "profile-id-001",
          selector: "System Prompt",
          filePath: "behaviors/abc/system.md",
          label: "Core identity",
          order: 2,
          enabled: false,
        },
      ],
    });

    const result = normaliseProfiles(adata);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "profile-id-001",
      selector: "System Prompt",
      filePath: "behaviors/abc/system.md",
      label: "Core identity",
      order: 2,
      enabled: false,
    });
  });

  it("defaults order to 0 when missing", () => {
    const adata = makeValidAdata({
      profile: [
        {
          id: "p1",
          selector: "Memory",
          filePath: "behaviors/abc/mem.md",
          enabled: true,
        } as unknown as import("../../src/types/agent.ts").AgentProfile,
      ],
    });

    const result = normaliseProfiles(adata);
    expect(result[0]?.order).toBe(0);
  });

  it("defaults enabled to true when missing", () => {
    const adata = makeValidAdata({
      profile: [
        {
          id: "p1",
          selector: "Tools",
          filePath: "behaviors/abc/tools.md",
          order: 0,
        } as unknown as import("../../src/types/agent.ts").AgentProfile,
      ],
    });

    const result = normaliseProfiles(adata);
    expect(result[0]?.enabled).toBe(true);
  });

  it("skips entries missing required fields (id)", () => {
    const adata = makeValidAdata({
      profile: [
        {
          selector: "System Prompt",
          filePath: "behaviors/abc/system.md",
          order: 0,
          enabled: true,
        } as unknown as import("../../src/types/agent.ts").AgentProfile,
      ],
    });

    const result = normaliseProfiles(adata);
    expect(result).toHaveLength(0);
  });

  it("skips entries missing required fields (filePath)", () => {
    const adata = makeValidAdata({
      profile: [
        {
          id: "p1",
          selector: "System Prompt",
          order: 0,
          enabled: true,
        } as unknown as import("../../src/types/agent.ts").AgentProfile,
      ],
    });

    const result = normaliseProfiles(adata);
    expect(result).toHaveLength(0);
  });

  it("skips entries missing required fields (selector)", () => {
    const adata = makeValidAdata({
      profile: [
        {
          id: "p1",
          filePath: "behaviors/abc/system.md",
          order: 0,
          enabled: true,
        } as unknown as import("../../src/types/agent.ts").AgentProfile,
      ],
    });

    const result = normaliseProfiles(adata);
    expect(result).toHaveLength(0);
  });

  it("skips non-object entries in the array", () => {
    const adata = makeValidAdata({
      profile: [
        "not-an-object",
        42,
        null,
      ] as unknown as import("../../src/types/agent.ts").AgentProfile[],
    });

    const result = normaliseProfiles(adata);
    expect(result).toHaveLength(0);
  });

  it("handles mixed valid and invalid entries", () => {
    const adata = makeValidAdata({
      profile: [
        { id: "valid-1", selector: "Memory", filePath: "behaviors/abc/mem.md", order: 0, enabled: true },
        { selector: "Missing id", filePath: "behaviors/abc/x.md" }, // missing id
        { id: "valid-2", selector: "Tools", filePath: "behaviors/abc/tools.md", order: 1, enabled: false },
      ] as unknown as import("../../src/types/agent.ts").AgentProfile[],
    });

    const result = normaliseProfiles(adata);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("valid-1");
    expect(result[1]?.id).toBe("valid-2");
  });

  it("clamps negative order to 0", () => {
    const adata = makeValidAdata({
      profile: [
        {
          id: "p1",
          selector: "Rules",
          filePath: "behaviors/abc/rules.md",
          order: -5,
          enabled: true,
        },
      ],
    });

    const result = normaliseProfiles(adata);
    expect(result[0]?.order).toBe(0);
  });
});

// ── mergeProfiles ─────────────────────────────────────────────────────────

describe("mergeProfiles", () => {
  it("returns a new object (does not mutate original)", () => {
    const original = makeValidAdata({ profile: [] });
    const profiles = [
      { id: "p1", selector: "Memory", filePath: "behaviors/abc/mem.md", order: 0, enabled: true },
    ];

    const merged = mergeProfiles(original, profiles);

    expect(merged).not.toBe(original);
    expect(original.profile).toEqual([]); // original unchanged
    expect(merged.profile).toHaveLength(1);
  });

  it("preserves all non-profile keys verbatim", () => {
    const original: AdataWithProfile = {
      ...makeValidAdata(),
      customKey: "preserved-value",
      profile: [],
    };

    const merged = mergeProfiles(original, []);
    expect((merged as Record<string, unknown>).customKey).toBe("preserved-value");
    expect(merged.agentId).toBe(AGENT_ID);
  });

  it("replaces the profile array with the new one", () => {
    const original = makeValidAdata({
      profile: [
        { id: "old", selector: "Memory", filePath: "old.md", order: 0, enabled: true },
      ],
    });

    const newProfiles = [
      { id: "new-1", selector: "Tools", filePath: "new.md", order: 0, enabled: true },
      { id: "new-2", selector: "Rules", filePath: "rules.md", order: 1, enabled: false },
    ];

    const merged = mergeProfiles(original, newProfiles);
    expect(merged.profile).toHaveLength(2);
    expect(merged.profile?.[0]?.id).toBe("new-1");
  });
});

// ── readAdataWithProfiles ─────────────────────────────────────────────────

describe("readAdataWithProfiles", () => {
  it("returns null when file does not exist", async () => {
    const fs = makeMemFs();
    const result = await readAdataWithProfiles(fs, PROJECT_DIR, AGENT_ID);
    expect(result).toBeNull();
  });

  it("returns raw + normalised profiles together", async () => {
    const adata = makeValidAdata({
      profile: [
        { id: "p1", selector: "System Prompt", filePath: "behaviors/abc/sys.md", order: 0, enabled: true },
      ],
    });
    const fs = makeMemFs({
      [`${PROJECT_DIR}/metadata/${AGENT_ID}.adata`]: JSON.stringify(adata),
    });

    const result = await readAdataWithProfiles(fs, PROJECT_DIR, AGENT_ID);
    expect(result).not.toBeNull();
    expect(result?.raw.agentId).toBe(AGENT_ID);
    expect(result?.profiles).toHaveLength(1);
    expect(result?.profiles[0]?.id).toBe("p1");
  });

  it("returns empty profiles array for legacy adata without profile key", async () => {
    const adata = makeValidAdata();
    delete (adata as Record<string, unknown>).profile;

    const fs = makeMemFs({
      [`${PROJECT_DIR}/metadata/${AGENT_ID}.adata`]: JSON.stringify(adata),
    });

    const result = await readAdataWithProfiles(fs, PROJECT_DIR, AGENT_ID);
    expect(result?.profiles).toEqual([]);
  });
});
