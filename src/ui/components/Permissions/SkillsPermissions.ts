/**
 * src/ui/components/Permissions/SkillsPermissions.ts
 *
 * Pure logic helpers for the Skills permissions section in PermissionsModal.
 *
 * # What are "Skills permissions"?
 *
 *   A special group in the permissions object with key "skills" that maps
 *   skill names (or wildcard patterns) to permission values:
 *
 *   ```json
 *   "skills": {
 *     "kb-search": "allow",
 *     "agents-summarizer": "allow",
 *     "web*": "deny"
 *   }
 *   ```
 *
 * # Skill name format
 *
 *   - Exact match:  "kb-search"  → matches only the kb-search skill
 *   - Wildcard:     "web*"       → matches any skill starting with "web"
 *   - Star-only:    "*"          → matches all skills
 *
 * # Validation rules
 *
 *   - Name must be non-empty
 *   - Name must match at least one real skill (from the skills/ directory)
 *     OR have a wildcard prefix that matches at least one skill
 *
 * These are pure functions with no React/DOM dependencies — they can be
 * tested in isolation with bun:test.
 */

import type { PermissionValue } from "../../../electron/bridge.types.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

/** One entry in the skills permissions section */
export interface LocalSkillEntry {
  localId: string;
  /** The skill name or pattern (e.g. "kb-search", "web*", "*") */
  name: string;
  value: PermissionValue;
  /** Validation error for this entry */
  error?: string;
}

/** Validation result for the entire skills section */
export interface ValidateSkillsSectionResult {
  entries: LocalSkillEntry[];
  hasErrors: boolean;
}

// ── Autocomplete ───────────────────────────────────────────────────────────────

/**
 * Returns the subset of `availableSkills` that should appear in the
 * autocomplete dropdown for the given `input`.
 *
 * Rules:
 *   - Empty / whitespace-only → []
 *   - `*` alone               → all skills
 *   - `prefix*`               → skills starting with `prefix`
 *   - `prefix` (no wildcard)  → skills starting with `prefix` (live autocomplete)
 *
 * The returned list preserves the order of `availableSkills`.
 * Matching is always case-insensitive.
 */
export function filterSkillsForAutocomplete(
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

  // Prefix match for live autocomplete as user types
  return availableSkills.filter((s) => s.toLowerCase().startsWith(lower));
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates a single skill entry name against the list of available skills.
 *
 * Returns an error string if invalid, or `undefined` if valid.
 *
 * Validation rules:
 *   1. Name must be non-empty (after trimming)
 *   2. For exact names (no `*`): must match a real skill (case-insensitive)
 *   3. For wildcard patterns (`prefix*` or `*`):
 *      the prefix must match at least one real skill
 */
export function validateSkillEntry(
  name: string,
  availableSkills: string[],
): string | undefined {
  const trimmed = name.trim();

  if (!trimmed) {
    return "Skill name is required.";
  }

  const lower = trimmed.toLowerCase();

  if (lower === "*") {
    if (availableSkills.length === 0) {
      return "No skill matches this pattern. No skills found in this project.";
    }
    return undefined;
  }

  if (lower.endsWith("*")) {
    const prefix = lower.slice(0, -1);
    const matches = availableSkills.filter((s) =>
      s.toLowerCase().startsWith(prefix)
    );
    if (matches.length === 0) {
      return `No skill matches this pattern. Try a different prefix.`;
    }
    return undefined;
  }

  // Exact match
  const match = availableSkills.some((s) => s.toLowerCase() === lower);
  if (!match) {
    return `No skill named "${trimmed}" found. Check the spelling or use a wildcard (e.g. "${trimmed}*").`;
  }

  return undefined;
}

/**
 * Validates all skill entries in the skills section.
 *
 * Returns a new entries array with error fields filled in, plus a
 * `hasErrors` flag.
 *
 * Does NOT mutate the input array.
 */
export function validateSkillsSection(
  entries: LocalSkillEntry[],
  availableSkills: string[],
): ValidateSkillsSectionResult {
  let hasErrors = false;

  const validated = entries.map((entry) => {
    const error = validateSkillEntry(entry.name, availableSkills);
    if (error) hasErrors = true;
    return { ...entry, error };
  });

  return { entries: validated, hasErrors };
}
