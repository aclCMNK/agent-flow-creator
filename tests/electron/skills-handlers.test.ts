/**
 * tests/electron/skills-handlers.test.ts
 *
 * Unit tests for src/electron/skills-handlers.ts
 *
 * Covers:
 *   - listSkillsFromDir: returns correctly formatted skill names
 *   - listSkillsFromDir: returns [] when skills dir does not exist
 *   - listSkillsFromDir: recursive search under skills/
 *   - matchSkillPattern: exact match, wildcard prefix, non-match
 *   - handleListSkills: integration with a temp dir
 *
 * All tests use bun:test (Strict TDD pattern).
 */

import { describe, it, expect } from "bun:test";
import {
  listSkillsFromDir,
  matchSkillPattern,
} from "../../src/electron/skills-handlers.ts";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

// ── listSkillsFromDir ────────────────────────────────────────────────────────

describe("listSkillsFromDir — missing directory", () => {
  it("returns [] when skills dir does not exist", async () => {
    const result = await listSkillsFromDir("/nonexistent/path/skills");
    expect(result).toEqual([]);
  });
});

describe("listSkillsFromDir — empty directory", () => {
  it("returns [] for an empty skills dir", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "af-skills-"));
    try {
      const skillsDir = join(tmpDir, "skills");
      await mkdir(skillsDir);
      const result = await listSkillsFromDir(skillsDir);
      expect(result).toEqual([]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("listSkillsFromDir — flat structure", () => {
  it("returns skill names for direct subdirectory SKILL.md files", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "af-skills-"));
    try {
      const skillsDir = join(tmpDir, "skills");
      await mkdir(join(skillsDir, "kb-search"), { recursive: true });
      await writeFile(join(skillsDir, "kb-search", "SKILL.md"), "# KB Search");

      const result = await listSkillsFromDir(skillsDir);
      expect(result).toContain("kb-search");
      expect(result.length).toBe(1);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns multiple skill names sorted alphabetically", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "af-skills-"));
    try {
      const skillsDir = join(tmpDir, "skills");
      await mkdir(join(skillsDir, "web-search"), { recursive: true });
      await mkdir(join(skillsDir, "kb-search"), { recursive: true });
      await mkdir(join(skillsDir, "code-review"), { recursive: true });
      await writeFile(join(skillsDir, "web-search", "SKILL.md"), "# Web Search");
      await writeFile(join(skillsDir, "kb-search", "SKILL.md"), "# KB Search");
      await writeFile(join(skillsDir, "code-review", "SKILL.md"), "# Code Review");

      const result = await listSkillsFromDir(skillsDir);
      expect(result).toEqual(["code-review", "kb-search", "web-search"]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores directories that do not contain a SKILL.md", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "af-skills-"));
    try {
      const skillsDir = join(tmpDir, "skills");
      await mkdir(join(skillsDir, "kb-search"), { recursive: true });
      await mkdir(join(skillsDir, "no-skill-here"), { recursive: true });
      await writeFile(join(skillsDir, "kb-search", "SKILL.md"), "# KB Search");
      await writeFile(join(skillsDir, "no-skill-here", "README.md"), "# Not a skill");

      const result = await listSkillsFromDir(skillsDir);
      expect(result).toContain("kb-search");
      expect(result).not.toContain("no-skill-here");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("listSkillsFromDir — nested (recursive) structure", () => {
  it("finds SKILL.md in subdirectories and formats path with dashes", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "af-skills-"));
    try {
      const skillsDir = join(tmpDir, "skills");
      await mkdir(join(skillsDir, "agents", "summarizer"), { recursive: true });
      await writeFile(join(skillsDir, "agents", "summarizer", "SKILL.md"), "# Summarizer");

      const result = await listSkillsFromDir(skillsDir);
      expect(result).toContain("agents-summarizer");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles deep nesting with dash-joined path", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "af-skills-"));
    try {
      const skillsDir = join(tmpDir, "skills");
      await mkdir(join(skillsDir, "a", "b", "c"), { recursive: true });
      await writeFile(join(skillsDir, "a", "b", "c", "SKILL.md"), "# Deep");

      const result = await listSkillsFromDir(skillsDir);
      expect(result).toContain("a-b-c");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("triangulate: flat + nested skills together", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "af-skills-"));
    try {
      const skillsDir = join(tmpDir, "skills");
      await mkdir(join(skillsDir, "flat-skill"), { recursive: true });
      await mkdir(join(skillsDir, "category", "nested-skill"), { recursive: true });
      await writeFile(join(skillsDir, "flat-skill", "SKILL.md"), "# Flat");
      await writeFile(join(skillsDir, "category", "nested-skill", "SKILL.md"), "# Nested");

      const result = await listSkillsFromDir(skillsDir);
      expect(result).toContain("flat-skill");
      expect(result).toContain("category-nested-skill");
      expect(result.length).toBe(2);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── matchSkillPattern ────────────────────────────────────────────────────────

describe("matchSkillPattern — exact match", () => {
  it("returns true for exact skill match", () => {
    expect(matchSkillPattern("kb-search", ["kb-search", "web-search"])).toBe(true);
  });

  it("returns false when skill is not in list", () => {
    expect(matchSkillPattern("unknown-skill", ["kb-search", "web-search"])).toBe(false);
  });

  it("returns false for empty skill list", () => {
    expect(matchSkillPattern("kb-search", [])).toBe(false);
  });
});

describe("matchSkillPattern — wildcard suffix (*)", () => {
  it("matches any skill that starts with the prefix", () => {
    expect(matchSkillPattern("kb*", ["kb-search", "kb-lookup", "web-search"])).toBe(true);
  });

  it("matches a prefix that is a full skill name prefix", () => {
    expect(matchSkillPattern("web*", ["kb-search", "web-search", "web-crawler"])).toBe(true);
  });

  it("returns false when no skill matches the prefix", () => {
    expect(matchSkillPattern("xyz*", ["kb-search", "web-search"])).toBe(false);
  });

  it("returns false for wildcard with empty skill list", () => {
    expect(matchSkillPattern("any*", [])).toBe(false);
  });

  it("triangulate: wildcard matches case-insensitively", () => {
    expect(matchSkillPattern("KB*", ["kb-search", "kb-lookup"])).toBe(true);
  });

  it("triangulate: star-only wildcard (*) matches all skills when list is non-empty", () => {
    expect(matchSkillPattern("*", ["kb-search"])).toBe(true);
  });

  it("triangulate: star-only wildcard (*) returns false for empty list", () => {
    expect(matchSkillPattern("*", [])).toBe(false);
  });
});

describe("matchSkillPattern — exact match case-insensitive", () => {
  it("matches regardless of case", () => {
    expect(matchSkillPattern("KB-Search", ["kb-search"])).toBe(true);
  });

  it("does NOT match partial name without wildcard", () => {
    expect(matchSkillPattern("kb", ["kb-search", "kb-lookup"])).toBe(false);
  });
});

// ── getMatchingSkills ─────────────────────────────────────────────────────────

describe("getMatchingSkills — filtering skills by input", () => {
  it("returns all skills matching a prefix without wildcard", async () => {
    // Re-import using the exported function
    const { getMatchingSkills } = await import("../../src/electron/skills-handlers.ts");
    const skills = ["kb-search", "kb-lookup", "web-search"];
    expect(getMatchingSkills("kb", skills)).toEqual(["kb-search", "kb-lookup"]);
  });

  it("returns all skills for star-only input", async () => {
    const { getMatchingSkills } = await import("../../src/electron/skills-handlers.ts");
    const skills = ["kb-search", "web-search"];
    expect(getMatchingSkills("*", skills)).toEqual(["kb-search", "web-search"]);
  });

  it("returns exact match only", async () => {
    const { getMatchingSkills } = await import("../../src/electron/skills-handlers.ts");
    const skills = ["kb-search", "kb-lookup", "web-search"];
    expect(getMatchingSkills("kb-search", skills)).toEqual(["kb-search"]);
  });

  it("returns [] when nothing matches", async () => {
    const { getMatchingSkills } = await import("../../src/electron/skills-handlers.ts");
    expect(getMatchingSkills("xyz", ["kb-search", "web-search"])).toEqual([]);
  });

  it("is case-insensitive for filtering", async () => {
    const { getMatchingSkills } = await import("../../src/electron/skills-handlers.ts");
    expect(getMatchingSkills("KB", ["kb-search", "kb-lookup"])).toEqual(["kb-search", "kb-lookup"]);
  });

  it("returns [] for empty input", async () => {
    const { getMatchingSkills } = await import("../../src/electron/skills-handlers.ts");
    expect(getMatchingSkills("", ["kb-search"])).toEqual([]);
  });
});
