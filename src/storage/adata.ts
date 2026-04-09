/**
 * src/storage/adata.ts
 *
 * Low-level persistence helpers for reading and writing `.adata` files.
 *
 * # Responsibilities
 *
 * This module provides a **thin, typed wrapper** around raw `.adata` JSON I/O.
 * It does NOT validate the full schema (that is the loader's job).  It only
 * ensures that:
 *
 *   1. Files are read and written atomically (temp-file + rename pattern,
 *      delegated to the caller in the Electron context via ipc-handlers).
 *   2. Unknown top-level keys in `.adata` are preserved verbatim on write
 *      (non-destructive merge semantics).
 *   3. The `profile` array is normalised to a valid shape on read (missing
 *      fields are defaulted; invalid entries are skipped with a warning).
 *
 * # Usage context
 *
 * These helpers are called from:
 *
 *   - `src/storage/profiles.ts`   — profile CRUD operations
 *   - `src/electron/ipc-handlers.ts` — IPC profile handlers (Phase 2)
 *
 * They do NOT call any Electron APIs themselves.  The file-system `read` /
 * `write` functions are injected as parameters so the same helpers can be
 * unit-tested without an Electron environment.
 *
 * # File location
 *
 * `.adata` files live at:  `<projectDir>/metadata/<agentId>.adata`
 */

import type { AgentProfile, AdataWithProfile } from "../types/agent.ts";

// ── I/O adapter interface ─────────────────────────────────────────────────

/**
 * File-system adapter injected into helpers that need to read / write files.
 *
 * In production this is implemented by Node `fs/promises`; in tests it can
 * be a simple in-memory stub.
 */
export interface FileAdapter {
  /** Read `path` as a UTF-8 string.  Throws if the file does not exist. */
  readText(path: string): Promise<string>;
  /**
   * Write `content` to `path` atomically (temp-file + rename).
   * Creates parent directories as needed.
   */
  writeText(path: string, content: string): Promise<void>;
  /** Returns true if `path` exists (file or directory). */
  exists(path: string): Promise<boolean>;
}

// ── Path helpers ─────────────────────────────────────────────────────────

/**
 * Returns the absolute path to an agent's `.adata` file.
 *
 * @param projectDir  - Absolute path to the project root directory.
 * @param agentId     - UUID of the agent.
 */
export function adataPath(projectDir: string, agentId: string): string {
  // path.join would require a Node import; use string concat to keep this
  // module free of Node-only imports (usable in renderer tests too).
  return `${projectDir}/metadata/${agentId}.adata`;
}

// ── Raw read / write ──────────────────────────────────────────────────────

/**
 * Read and parse a `.adata` file.
 *
 * @returns The parsed object, or `null` if the file does not exist.
 * @throws  On JSON parse errors or unexpected I/O errors.
 *
 * @example
 * ```ts
 * const raw = await readAdataRaw(fs, projectDir, agentId);
 * if (!raw) throw new Error("Agent not found");
 * ```
 */
export async function readAdataRaw(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
): Promise<AdataWithProfile | null> {
  const filePath = adataPath(projectDir, agentId);

  const exists = await fs.exists(filePath);
  if (!exists) return null;

  const raw = await fs.readText(filePath);

  // Intentional non-strict parse: unknown extra keys are preserved.
  const parsed = JSON.parse(raw) as AdataWithProfile;
  return parsed;
}

/**
 * Write an `.adata` object back to disk as pretty-printed JSON.
 *
 * The `updatedAt` timestamp is always refreshed to `new Date().toISOString()`.
 * All other fields are written as-is — the caller is responsible for the
 * shape of the object.
 *
 * @param fs          - File adapter (injected).
 * @param projectDir  - Absolute path to the project root.
 * @param agentId     - UUID of the agent (used to build the file path).
 * @param data        - Full `.adata` object to persist.
 */
export async function writeAdataRaw(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
  data: AdataWithProfile,
): Promise<void> {
  const filePath = adataPath(projectDir, agentId);

  const withTimestamp: AdataWithProfile = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeText(filePath, JSON.stringify(withTimestamp, null, 2));
}

// ── Profile array normalisation ───────────────────────────────────────────

/**
 * Normalise the `profile` array from a raw `.adata` object.
 *
 * Rules:
 *  - Missing `profile` key → returns `[]`.
 *  - Non-array value → returns `[]` (logs a warning).
 *  - Each element is validated: entries missing `id`, `selector`, or
 *    `filePath` are skipped (malformed entries from old migrations).
 *  - Missing optional fields (`label`, `order`, `enabled`) are defaulted.
 *
 * @param raw - The raw parsed `.adata` object.
 * @returns A normalised, mutable copy of the profile array.
 */
export function normaliseProfiles(raw: AdataWithProfile): AgentProfile[] {
  const rawProfile = raw.profile;

  if (rawProfile === undefined || rawProfile === null) {
    return [];
  }

  if (!Array.isArray(rawProfile)) {
    console.warn(
      `[adata] normaliseProfiles: expected array for 'profile', got ${typeof rawProfile} (agentId=${raw.agentId}). Returning empty array.`,
    );
    return [];
  }

  const normalised: AgentProfile[] = [];

  for (const entry of rawProfile) {
    // Skip non-object entries
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      console.warn(
        `[adata] normaliseProfiles: skipping non-object profile entry (agentId=${raw.agentId})`,
        entry,
      );
      continue;
    }

    const e = entry as unknown as Record<string, unknown>;

    // Validate required string fields
    if (
      typeof e.id !== "string" ||
      !e.id ||
      typeof e.selector !== "string" ||
      !e.selector ||
      typeof e.filePath !== "string" ||
      !e.filePath
    ) {
      console.warn(
        `[adata] normaliseProfiles: skipping invalid profile entry (agentId=${raw.agentId}) — missing id, selector, or filePath`,
        e,
      );
      continue;
    }

    normalised.push({
      id: e.id,
      selector: e.selector,
      filePath: e.filePath,
      // Optional fields — apply defaults when absent or wrong type
      label: typeof e.label === "string" ? e.label : undefined,
      order: typeof e.order === "number" && Number.isFinite(e.order) ? Math.max(0, Math.floor(e.order)) : 0,
      enabled: typeof e.enabled === "boolean" ? e.enabled : true,
    });
  }

  return normalised;
}

/**
 * Merge a new profiles array into a raw `.adata` object.
 *
 * Returns a NEW object — the original `raw` is not mutated.
 * All non-profile fields are preserved verbatim.
 *
 * @param raw      - Existing `.adata` object.
 * @param profiles - The new profiles array to set.
 */
export function mergeProfiles(
  raw: AdataWithProfile,
  profiles: AgentProfile[],
): AdataWithProfile {
  return {
    ...raw,
    profile: profiles,
  };
}

// ── Convenience typed read ─────────────────────────────────────────────────

/**
 * Read an `.adata` file and return both the raw object and the normalised
 * profiles in one call.
 *
 * @returns `{ raw, profiles }` or `null` if the file does not exist.
 */
export async function readAdataWithProfiles(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
): Promise<{ raw: AdataWithProfile; profiles: AgentProfile[] } | null> {
  const raw = await readAdataRaw(fs, projectDir, agentId);
  if (!raw) return null;

  const profiles = normaliseProfiles(raw);
  return { raw, profiles };
}
