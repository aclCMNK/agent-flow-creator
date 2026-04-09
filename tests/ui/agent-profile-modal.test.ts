/**
 * tests/ui/agent-profile-modal.test.ts
 *
 * Unit tests for the pure utility functions used by AgentProfileModal.
 *
 * These functions are extracted from the UI components to keep them
 * testable without any DOM / React rendering infrastructure.
 *
 * All tests use bun:test (TDD — RED first, then GREEN).
 */

import { describe, it, expect } from "bun:test";
import {
  getFileNameFromPath,
  resolveProfileLabel,
  buildAddProfileRequest,
  sortAndIndexProfiles,
  filterOnlyMdPaths,
} from "../../src/ui/utils/agentProfileUtils.ts";
import type { BridgeAgentProfile } from "../../src/electron/bridge.types.ts";

// ── getFileNameFromPath ───────────────────────────────────────────────────

describe("getFileNameFromPath", () => {
  it("extracts the filename from a relative path", () => {
    expect(getFileNameFromPath("behaviors/abc/system.md")).toBe("system.md");
  });

  it("extracts the filename from a path with multiple segments", () => {
    expect(getFileNameFromPath("foo/bar/baz/deep.md")).toBe("deep.md");
  });

  it("returns the value as-is when there is no slash", () => {
    expect(getFileNameFromPath("readme.md")).toBe("readme.md");
  });

  it("returns empty string for an empty path", () => {
    expect(getFileNameFromPath("")).toBe("");
  });
});

// ── resolveProfileLabel ───────────────────────────────────────────────────

describe("resolveProfileLabel", () => {
  it("returns the label when it is set", () => {
    const profile: BridgeAgentProfile = {
      id: "p1",
      selector: "System Prompt",
      filePath: "behaviors/abc/system.md",
      label: "Core identity",
      order: 0,
      enabled: true,
    };
    expect(resolveProfileLabel(profile)).toBe("Core identity");
  });

  it("falls back to filename when label is absent", () => {
    const profile: BridgeAgentProfile = {
      id: "p2",
      selector: "Memory",
      filePath: "behaviors/abc/memory.md",
      order: 0,
      enabled: true,
    };
    expect(resolveProfileLabel(profile)).toBe("memory.md");
  });

  it("falls back to filename when label is empty string", () => {
    const profile: BridgeAgentProfile = {
      id: "p3",
      selector: "Tools",
      filePath: "behaviors/abc/tools.md",
      label: "",
      order: 0,
      enabled: true,
    };
    expect(resolveProfileLabel(profile)).toBe("tools.md");
  });
});

// ── buildAddProfileRequest ────────────────────────────────────────────────

describe("buildAddProfileRequest", () => {
  it("builds a request with selector and filePath", () => {
    const req = buildAddProfileRequest({
      projectDir: "/proj",
      agentId: "agent-1",
      selector: "System Prompt",
      filePath: "behaviors/abc/system.md",
    });
    expect(req.projectDir).toBe("/proj");
    expect(req.agentId).toBe("agent-1");
    expect(req.selector).toBe("System Prompt");
    expect(req.filePath).toBe("behaviors/abc/system.md");
  });

  it("includes optional label when provided", () => {
    const req = buildAddProfileRequest({
      projectDir: "/proj",
      agentId: "agent-1",
      selector: "Memory",
      filePath: "behaviors/abc/mem.md",
      label: "Context memory",
    });
    expect(req.label).toBe("Context memory");
  });

  it("sets enabled to true by default", () => {
    const req = buildAddProfileRequest({
      projectDir: "/proj",
      agentId: "agent-1",
      selector: "Tools",
      filePath: "behaviors/abc/tools.md",
    });
    expect(req.enabled).toBe(true);
  });
});

// ── sortAndIndexProfiles ──────────────────────────────────────────────────

describe("sortAndIndexProfiles", () => {
  it("returns profiles sorted by order ascending", () => {
    const profiles: BridgeAgentProfile[] = [
      { id: "p3", selector: "C", filePath: "c.md", order: 2, enabled: true },
      { id: "p1", selector: "A", filePath: "a.md", order: 0, enabled: true },
      { id: "p2", selector: "B", filePath: "b.md", order: 1, enabled: true },
    ];
    const result = sortAndIndexProfiles(profiles);
    expect(result[0].id).toBe("p1");
    expect(result[1].id).toBe("p2");
    expect(result[2].id).toBe("p3");
  });

  it("does not mutate the original array", () => {
    const profiles: BridgeAgentProfile[] = [
      { id: "p2", selector: "B", filePath: "b.md", order: 1, enabled: true },
      { id: "p1", selector: "A", filePath: "a.md", order: 0, enabled: true },
    ];
    sortAndIndexProfiles(profiles);
    // Original order preserved
    expect(profiles[0].id).toBe("p2");
    expect(profiles[1].id).toBe("p1");
  });

  it("returns empty array when given empty input", () => {
    const result = sortAndIndexProfiles([]);
    expect(result).toHaveLength(0);
  });
});

// ── filterOnlyMdPaths ─────────────────────────────────────────────────────

describe("filterOnlyMdPaths", () => {
  it("returns only .md paths", () => {
    const paths = ["a.md", "b.txt", "c.md", "d.json"];
    const result = filterOnlyMdPaths(paths);
    expect(result).toEqual(["a.md", "c.md"]);
  });

  it("is case-insensitive for the extension", () => {
    const paths = ["A.MD", "b.Md", "c.txt"];
    const result = filterOnlyMdPaths(paths);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("A.MD");
    expect(result[1]).toBe("b.Md");
  });

  it("returns empty array when no .md files are present", () => {
    const result = filterOnlyMdPaths(["a.txt", "b.json"]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(filterOnlyMdPaths([])).toHaveLength(0);
  });
});

// ── TRIANGULATE edge cases ─────────────────────────────────────────────────

describe("getFileNameFromPath — edge cases", () => {
  it("handles Windows-style backslash paths gracefully (no backslash in path → unchanged)", () => {
    // On Unix paths there are no backslashes; the function should return the
    // full string when no forward-slash is present.
    expect(getFileNameFromPath("noSlashHere.md")).toBe("noSlashHere.md");
  });

  it("handles path with trailing slash by returning empty string", () => {
    // "behaviors/abc/" → split → ["behaviors", "abc", ""] → last = ""
    expect(getFileNameFromPath("behaviors/abc/")).toBe("");
  });
});

describe("resolveProfileLabel — edge cases", () => {
  it("falls back to full filePath when path has no slash", () => {
    const profile: BridgeAgentProfile = {
      id: "p99",
      selector: "Rules",
      filePath: "noslashtoolate",
      order: 0,
      enabled: false,
    };
    // getFileNameFromPath("noslashtoolate") === "noslashtoolate"
    expect(resolveProfileLabel(profile)).toBe("noslashtoolate");
  });

  it("handles label with only whitespace — falls back to filename", () => {
    const profile: BridgeAgentProfile = {
      id: "p100",
      selector: "Persona",
      filePath: "behaviors/abc/persona.md",
      label: "   ",
      order: 0,
      enabled: true,
    };
    expect(resolveProfileLabel(profile)).toBe("persona.md");
  });
});

describe("buildAddProfileRequest — edge cases", () => {
  it("omits label key when not provided", () => {
    const req = buildAddProfileRequest({
      projectDir: "/proj",
      agentId: "a1",
      selector: "Context",
      filePath: "behaviors/ctx.md",
    });
    expect("label" in req).toBe(false);
  });

  it("includes enabled: false when explicitly passed", () => {
    const req = buildAddProfileRequest({
      projectDir: "/proj",
      agentId: "a1",
      selector: "Examples",
      filePath: "behaviors/ex.md",
      enabled: false,
    });
    expect(req.enabled).toBe(false);
  });
});

describe("sortAndIndexProfiles — edge cases", () => {
  it("handles profiles with the same order value (stable-ish, no crash)", () => {
    const profiles: BridgeAgentProfile[] = [
      { id: "p1", selector: "A", filePath: "a.md", order: 0, enabled: true },
      { id: "p2", selector: "B", filePath: "b.md", order: 0, enabled: true },
    ];
    const result = sortAndIndexProfiles(profiles);
    expect(result).toHaveLength(2);
    // Both present — no crash
    const ids = result.map((p) => p.id);
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
  });

  it("handles a single profile", () => {
    const profiles: BridgeAgentProfile[] = [
      { id: "solo", selector: "System Prompt", filePath: "sys.md", order: 0, enabled: true },
    ];
    const result = sortAndIndexProfiles(profiles);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("solo");
  });
});
