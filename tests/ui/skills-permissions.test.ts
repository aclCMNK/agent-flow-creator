/**
 * tests/ui/skills-permissions.test.ts
 *
 * Unit tests for the Skills permissions feature in PermissionsModal:
 *
 *   - validateSkillEntry: validates a skill name/pattern against known skills
 *   - skillNameToPattern: converts raw input to a matchable pattern
 *   - filterSkillsForAutocomplete: given input string, returns matching skills
 *   - validateSkillsSection: validates all skill entries in the Skills group
 *
 * These tests are pure logic tests — no DOM, no React rendering.
 */

import { describe, it, expect } from "bun:test";
import {
  validateSkillEntry,
  filterSkillsForAutocomplete,
  validateSkillsSection,
} from "../../src/ui/components/Permissions/SkillsPermissions.ts";
import type { LocalSkillEntry } from "../../src/ui/components/Permissions/SkillsPermissions.ts";

// ── filterSkillsForAutocomplete ──────────────────────────────────────────────

describe("filterSkillsForAutocomplete — empty input", () => {
  it("returns [] for empty string", () => {
    expect(filterSkillsForAutocomplete("", ["kb-search", "web-search"])).toEqual([]);
  });

  it("returns [] for whitespace-only input", () => {
    expect(filterSkillsForAutocomplete("   ", ["kb-search", "web-search"])).toEqual([]);
  });
});

describe("filterSkillsForAutocomplete — prefix matching", () => {
  it("returns all skills starting with the prefix", () => {
    const result = filterSkillsForAutocomplete("kb", ["kb-search", "kb-lookup", "web-search"]);
    expect(result).toContain("kb-search");
    expect(result).toContain("kb-lookup");
    expect(result).not.toContain("web-search");
  });

  it("returns exact match for full skill name", () => {
    const result = filterSkillsForAutocomplete("kb-search", ["kb-search", "kb-lookup"]);
    expect(result).toEqual(["kb-search"]);
  });

  it("is case-insensitive", () => {
    const result = filterSkillsForAutocomplete("KB", ["kb-search", "KB-LOOKUP", "web-search"]);
    expect(result).toContain("kb-search");
    expect(result).toContain("KB-LOOKUP");
  });

  it("returns [] when nothing matches", () => {
    expect(filterSkillsForAutocomplete("xyz", ["kb-search"])).toEqual([]);
  });
});

describe("filterSkillsForAutocomplete — wildcard (*)", () => {
  it("returns all skills for input ending with *", () => {
    const result = filterSkillsForAutocomplete("kb*", ["kb-search", "kb-lookup", "web-search"]);
    expect(result).toContain("kb-search");
    expect(result).toContain("kb-lookup");
    expect(result).not.toContain("web-search");
  });

  it("returns all skills for * alone", () => {
    const skills = ["kb-search", "web-search"];
    expect(filterSkillsForAutocomplete("*", skills)).toEqual(skills);
  });

  it("returns [] when prefix before * matches nothing", () => {
    expect(filterSkillsForAutocomplete("xyz*", ["kb-search"])).toEqual([]);
  });
});

describe("filterSkillsForAutocomplete — empty skill list", () => {
  it("always returns [] for empty skills list", () => {
    expect(filterSkillsForAutocomplete("kb", [])).toEqual([]);
    expect(filterSkillsForAutocomplete("kb*", [])).toEqual([]);
    expect(filterSkillsForAutocomplete("*", [])).toEqual([]);
  });
});

// ── validateSkillEntry ────────────────────────────────────────────────────────

describe("validateSkillEntry — valid entries", () => {
  const skills = ["kb-search", "web-search", "code-review"];

  it("returns no error for an exact match", () => {
    const error = validateSkillEntry("kb-search", skills);
    expect(error).toBeUndefined();
  });

  it("returns no error for a wildcard that matches at least one skill", () => {
    const error = validateSkillEntry("kb*", skills);
    expect(error).toBeUndefined();
  });

  it("returns no error for star-only wildcard when list is non-empty", () => {
    const error = validateSkillEntry("*", skills);
    expect(error).toBeUndefined();
  });
});

describe("validateSkillEntry — invalid entries", () => {
  const skills = ["kb-search", "web-search"];

  it("returns an error for empty input", () => {
    const error = validateSkillEntry("", skills);
    expect(error).toBeTruthy();
    expect(error).toMatch(/required/i);
  });

  it("returns an error for whitespace-only input", () => {
    const error = validateSkillEntry("   ", skills);
    expect(error).toBeTruthy();
  });

  it("returns an error when skill does not match any real skill (no wildcard)", () => {
    const error = validateSkillEntry("unknown-skill", skills);
    expect(error).toBeTruthy();
    expect(error).toMatch(/no skill/i);
  });

  it("returns an error when wildcard prefix matches nothing", () => {
    const error = validateSkillEntry("xyz*", skills);
    expect(error).toBeTruthy();
    expect(error).toMatch(/no skill/i);
  });

  it("returns an error for star-only wildcard when skills list is empty", () => {
    const error = validateSkillEntry("*", []);
    expect(error).toBeTruthy();
    expect(error).toMatch(/no skill/i);
  });
});

// ── validateSkillsSection ─────────────────────────────────────────────────────

describe("validateSkillsSection — valid entries", () => {
  const skills = ["kb-search", "web-search", "code-review"];

  it("returns hasErrors=false for empty entries", () => {
    const { hasErrors } = validateSkillsSection([], skills);
    expect(hasErrors).toBe(false);
  });

  it("returns hasErrors=false for all valid exact-match entries", () => {
    const entries: LocalSkillEntry[] = [
      { localId: "s1", name: "kb-search", value: "allow" },
      { localId: "s2", name: "web-search", value: "deny" },
    ];
    const { hasErrors } = validateSkillsSection(entries, skills);
    expect(hasErrors).toBe(false);
  });

  it("returns hasErrors=false for valid wildcard entries", () => {
    const entries: LocalSkillEntry[] = [
      { localId: "s1", name: "kb*", value: "allow" },
    ];
    const { hasErrors } = validateSkillsSection(entries, skills);
    expect(hasErrors).toBe(false);
  });
});

describe("validateSkillsSection — invalid entries", () => {
  const skills = ["kb-search", "web-search"];

  it("sets error and hasErrors=true for empty skill name", () => {
    const entries: LocalSkillEntry[] = [
      { localId: "s1", name: "", value: "allow" },
    ];
    const { hasErrors, entries: validated } = validateSkillsSection(entries, skills);
    expect(hasErrors).toBe(true);
    expect(validated[0]?.error).toBeTruthy();
  });

  it("sets error and hasErrors=true for skill that does not match any real skill", () => {
    const entries: LocalSkillEntry[] = [
      { localId: "s1", name: "unknown-skill", value: "allow" },
    ];
    const { hasErrors, entries: validated } = validateSkillsSection(entries, skills);
    expect(hasErrors).toBe(true);
    expect(validated[0]?.error).toMatch(/no skill/i);
  });

  it("validates all entries and collects all errors", () => {
    const entries: LocalSkillEntry[] = [
      { localId: "s1", name: "kb-search", value: "allow" },
      { localId: "s2", name: "", value: "deny" },
      { localId: "s3", name: "nonexistent", value: "ask" },
    ];
    const { hasErrors, entries: validated } = validateSkillsSection(entries, skills);
    expect(hasErrors).toBe(true);
    expect(validated[0]?.error).toBeUndefined();
    expect(validated[1]?.error).toBeTruthy();
    expect(validated[2]?.error).toBeTruthy();
  });
});

describe("validateSkillsSection — does not mutate original", () => {
  it("returns a new array reference", () => {
    const entries: LocalSkillEntry[] = [
      { localId: "s1", name: "kb-search", value: "allow" },
    ];
    const { entries: validated } = validateSkillsSection(entries, ["kb-search"]);
    expect(validated).not.toBe(entries);
  });
});
