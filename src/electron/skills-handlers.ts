/**
 * src/electron/skills-handlers.ts
 *
 * Pure handler functions for the Skills IPC channel.
 *
 * Responsibilities:
 *   - Scan a `skills/` directory recursively for SKILL.md files
 *   - Return skill names as dash-joined relative paths from the skills root
 *     (e.g., skills/kb-search/SKILL.md → "kb-search")
 *     (e.g., skills/agents/summarizer/SKILL.md → "agents-summarizer")
 *   - Provide pattern matching helpers: exact match and wildcard prefix (*)
 *   - Handle the IPC request for listing skills
 *
 * Separation principle: these functions are separated from ipc-handlers.ts
 * so they can be tested in isolation without Electron IPC dependency.
 */

import { join, relative, sep } from "node:path";
import { readdir, stat } from "node:fs/promises";
import type {
  AdataListSkillsRequest,
  AdataListSkillsResult,
} from "./bridge.types.ts";

// ── Core scanner ─────────────────────────────────────────────────────────────

/**
 * Recursively scans `skillsDir` for SKILL.md files.
 * Returns a sorted array of skill names derived from the relative path.
 *
 * Path → name conversion:
 *   `{skillsDir}/kb-search/SKILL.md`             → "kb-search"
 *   `{skillsDir}/agents/summarizer/SKILL.md`      → "agents-summarizer"
 *   `{skillsDir}/a/b/c/SKILL.md`                  → "a-b-c"
 *
 * Returns [] if `skillsDir` does not exist or is not a directory.
 */
export async function listSkillsFromDir(skillsDir: string): Promise<string[]> {
  const names: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        // Check if this dir contains a SKILL.md directly
        const skillMdPath = join(fullPath, "SKILL.md");
        let hasSkillMd = false;
        try {
          const skillStat = await stat(skillMdPath);
          hasSkillMd = skillStat.isFile();
        } catch {
          hasSkillMd = false;
        }

        if (hasSkillMd) {
          // Convert relative path to dash-joined name
          const rel = relative(skillsDir, fullPath);
          const skillName = rel.split(sep).join("-");
          names.push(skillName);
        }

        // Always recurse deeper for nested skills
        await walk(fullPath);
      }
    }
  }

  // Check that skillsDir exists first
  try {
    const dirStat = await stat(skillsDir);
    if (!dirStat.isDirectory()) return [];
  } catch {
    return [];
  }

  await walk(skillsDir);
  return names.sort();
}

// ── Pattern matching ──────────────────────────────────────────────────────────

/**
 * Returns true if `pattern` matches at least one skill in `availableSkills`.
 *
 * Matching rules:
 *   - If `pattern` ends with `*`, the prefix before `*` is compared
 *     case-insensitively as a prefix against each available skill.
 *   - If `pattern` is `*` alone, matches any skill in the list.
 *   - Otherwise, exact case-insensitive comparison.
 *
 * Examples:
 *   matchSkillPattern("kb-search", ["kb-search"])  → true
 *   matchSkillPattern("kb*",       ["kb-search"])  → true
 *   matchSkillPattern("*",         ["kb-search"])  → true
 *   matchSkillPattern("unknown",   ["kb-search"])  → false
 *   matchSkillPattern("xyz*",      ["kb-search"])  → false
 */
export function matchSkillPattern(
  pattern: string,
  availableSkills: string[],
): boolean {
  if (availableSkills.length === 0) return false;

  const lower = pattern.toLowerCase();

  if (lower.endsWith("*")) {
    const prefix = lower.slice(0, -1); // everything before *
    // star-only: matches any skill
    if (prefix === "") return availableSkills.length > 0;
    return availableSkills.some((s) => s.toLowerCase().startsWith(prefix));
  }

  return availableSkills.some((s) => s.toLowerCase() === lower);
}

/**
 * Returns the subset of `availableSkills` that match the given `input`.
 *
 * Matching:
 *   - Empty / whitespace-only input → []
 *   - Input ending with `*` → prefix match on the part before `*`
 *   - `*` alone → all skills
 *   - Otherwise → prefix match (live autocomplete while typing)
 *
 * This function drives the autocomplete dropdown as the user types.
 */
export function getMatchingSkills(
  input: string,
  availableSkills: string[],
): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();

  if (lower === "*") return [...availableSkills];

  if (lower.endsWith("*")) {
    const prefix = lower.slice(0, -1);
    return availableSkills.filter((s) => s.toLowerCase().startsWith(prefix));
  }

  // Prefix match for live autocomplete
  return availableSkills.filter((s) => s.toLowerCase().startsWith(lower));
}

// ── IPC handler ───────────────────────────────────────────────────────────────

/**
 * Lists all skill names found under `{projectDir}/skills/` recursively.
 * Returns a sorted array of skill names (subdir path with dash separator).
 */
export async function handleListSkills(
  req: AdataListSkillsRequest,
): Promise<AdataListSkillsResult> {
  try {
    const skillsDir = join(req.projectDir, "skills");
    const skills = await listSkillsFromDir(skillsDir);
    return { success: true, skills };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, skills: [], error: message };
  }
}
