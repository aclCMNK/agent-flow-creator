/**
 * tests/storage/migrate-profiles.test.ts
 *
 * Unit tests for src/storage/migrate-profiles.ts
 *
 * Covers:
 *   - migrateProjectProfiles: full scan, idempotency, partial errors
 *   - migrateAdataFile: single file, already-migrated, missing key
 */

import { describe, it, expect } from "bun:test";
import {
  migrateProjectProfiles,
  migrateAdataFile,
} from "../../src/storage/migrate-profiles.ts";
import type { FileAdapter } from "../../src/storage/adata.ts";

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
const METADATA_DIR = `${PROJECT_DIR}/metadata`;

function makeAgentId(n: number): string {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
}

function makeAdataJson(agentId: string, withProfile = false): string {
  const base: Record<string, unknown> = {
    version: 1,
    agentId,
    agentName: "Agent",
    description: "",
    aspects: [],
    skills: [],
    subagents: [],
    profilePath: `behaviors/${agentId}/profile.md`,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  if (withProfile) {
    base.profile = [];
  }

  return JSON.stringify(base, null, 2);
}

// ── migrateProjectProfiles ────────────────────────────────────────────────

describe("migrateProjectProfiles", () => {
  it("returns empty report when metadata directory does not exist", async () => {
    const fs = makeMemFs();
    const listDir = async (_dir: string): Promise<string[]> => {
      throw new Error("ENOENT: no such file or directory");
    };

    const report = await migrateProjectProfiles(fs, PROJECT_DIR, listDir);

    expect(report.scanned).toBe(0);
    expect(report.migrated).toBe(0);
    expect(report.errors).toBe(0);
  });

  it("migrates legacy .adata files without profile key", async () => {
    const agentId1 = makeAgentId(1);
    const agentId2 = makeAgentId(2);

    const fs = makeMemFs({
      [`${METADATA_DIR}/${agentId1}.adata`]: makeAdataJson(agentId1, false),
      [`${METADATA_DIR}/${agentId2}.adata`]: makeAdataJson(agentId2, false),
    });

    const listDir = async (_dir: string): Promise<string[]> => [
      `${agentId1}.adata`,
      `${agentId2}.adata`,
    ];

    const report = await migrateProjectProfiles(fs, PROJECT_DIR, listDir);

    expect(report.scanned).toBe(2);
    expect(report.migrated).toBe(2);
    expect(report.skipped).toBe(0);
    expect(report.errors).toBe(0);

    // Verify the files now have profile: []
    const p1 = JSON.parse(fs.store[`${METADATA_DIR}/${agentId1}.adata`]!);
    expect(p1.profile).toEqual([]);
  });

  it("skips files that already have a profile key (idempotent)", async () => {
    const agentId = makeAgentId(1);

    const fs = makeMemFs({
      [`${METADATA_DIR}/${agentId}.adata`]: makeAdataJson(agentId, true),
    });

    const listDir = async (_dir: string): Promise<string[]> => [`${agentId}.adata`];

    const report = await migrateProjectProfiles(fs, PROJECT_DIR, listDir);

    expect(report.scanned).toBe(1);
    expect(report.migrated).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it("handles mixed: some already migrated, some not", async () => {
    const id1 = makeAgentId(1);
    const id2 = makeAgentId(2);

    const fs = makeMemFs({
      [`${METADATA_DIR}/${id1}.adata`]: makeAdataJson(id1, false), // needs migration
      [`${METADATA_DIR}/${id2}.adata`]: makeAdataJson(id2, true),  // already migrated
    });

    const listDir = async (_dir: string): Promise<string[]> => [
      `${id1}.adata`,
      `${id2}.adata`,
    ];

    const report = await migrateProjectProfiles(fs, PROJECT_DIR, listDir);

    expect(report.scanned).toBe(2);
    expect(report.migrated).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.errors).toBe(0);
  });

  it("reports error for malformed JSON without crashing", async () => {
    const agentId = makeAgentId(1);

    const fs = makeMemFs({
      [`${METADATA_DIR}/${agentId}.adata`]: "{ invalid json !!!",
    });

    const listDir = async (_dir: string): Promise<string[]> => [`${agentId}.adata`];

    const report = await migrateProjectProfiles(fs, PROJECT_DIR, listDir);

    expect(report.scanned).toBe(1);
    expect(report.migrated).toBe(0);
    expect(report.errors).toBe(1);
    expect(report.files[0]?.error).toBeDefined();
  });

  it("ignores non-.adata files in the directory listing", async () => {
    const fs = makeMemFs();
    const listDir = async (_dir: string): Promise<string[]> => [
      "README.md",
      "some-file.json",
      ".DS_Store",
    ];

    const report = await migrateProjectProfiles(fs, PROJECT_DIR, listDir);

    expect(report.scanned).toBe(0);
    expect(report.migrated).toBe(0);
  });

  it("report contains correct projectDir and ranAt", async () => {
    const fs = makeMemFs();
    const listDir = async (): Promise<string[]> => [];

    const before = Date.now();
    const report = await migrateProjectProfiles(fs, PROJECT_DIR, listDir);
    const after = Date.now();

    expect(report.projectDir).toBe(PROJECT_DIR);
    const ranAtMs = new Date(report.ranAt).getTime();
    expect(ranAtMs).toBeGreaterThanOrEqual(before);
    expect(ranAtMs).toBeLessThanOrEqual(after);
  });

  it("refreshes updatedAt on migrated files", async () => {
    const agentId = makeAgentId(1);
    const oldUpdatedAt = "2020-01-01T00:00:00.000Z";

    const fs = makeMemFs({
      [`${METADATA_DIR}/${agentId}.adata`]: JSON.stringify({
        version: 1,
        agentId,
        agentName: "Agent",
        updatedAt: oldUpdatedAt,
      }),
    });

    const listDir = async (): Promise<string[]> => [`${agentId}.adata`];

    const before = Date.now();
    await migrateProjectProfiles(fs, PROJECT_DIR, listDir);
    const after = Date.now();

    const written = JSON.parse(fs.store[`${METADATA_DIR}/${agentId}.adata`]!);
    const newUpdatedAt = new Date(written.updatedAt).getTime();
    expect(newUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(newUpdatedAt).toBeLessThanOrEqual(after);
  });
});

// ── migrateAdataFile ──────────────────────────────────────────────────────

describe("migrateAdataFile", () => {
  it("returns true and patches file when profile key is absent", async () => {
    const filePath = `${METADATA_DIR}/agent1.adata`;
    const fs = makeMemFs({
      [filePath]: JSON.stringify({ agentId: "a1", version: 1 }),
    });

    const patched = await migrateAdataFile(fs, filePath);

    expect(patched).toBe(true);
    const written = JSON.parse(fs.store[filePath]!);
    expect(written.profile).toEqual([]);
  });

  it("returns false when profile key already present", async () => {
    const filePath = `${METADATA_DIR}/agent1.adata`;
    const fs = makeMemFs({
      [filePath]: JSON.stringify({ agentId: "a1", version: 1, profile: [] }),
    });

    const patched = await migrateAdataFile(fs, filePath);
    expect(patched).toBe(false);
  });

  it("returns false when profile has content (does not touch it)", async () => {
    const filePath = `${METADATA_DIR}/agent1.adata`;
    const existing = {
      agentId: "a1",
      version: 1,
      profile: [
        { id: "p1", selector: "Memory", filePath: "behaviors/a1/mem.md", order: 0, enabled: true },
      ],
    };
    const fs = makeMemFs({ [filePath]: JSON.stringify(existing) });

    const patched = await migrateAdataFile(fs, filePath);
    expect(patched).toBe(false);

    // Content unchanged
    const written = JSON.parse(fs.store[filePath]!);
    expect(written.profile).toHaveLength(1);
  });

  it("throws on malformed JSON", async () => {
    const filePath = `${METADATA_DIR}/agent1.adata`;
    const fs = makeMemFs({ [filePath]: "not json" });

    await expect(migrateAdataFile(fs, filePath)).rejects.toThrow();
  });

  it("preserves all other keys when patching", async () => {
    const filePath = `${METADATA_DIR}/agent1.adata`;
    const fs = makeMemFs({
      [filePath]: JSON.stringify({
        agentId: "a1",
        version: 1,
        description: "Keep me",
        metadata: { adapter: "opencode" },
      }),
    });

    await migrateAdataFile(fs, filePath);

    const written = JSON.parse(fs.store[filePath]!);
    expect(written.description).toBe("Keep me");
    expect(written.metadata.adapter).toBe("opencode");
    expect(written.agentId).toBe("a1");
  });
});
