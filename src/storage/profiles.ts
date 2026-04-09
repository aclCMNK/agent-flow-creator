/**
 * src/storage/profiles.ts
 *
 * High-level CRUD operations for an agent's `profile[]` list.
 *
 * # Overview
 *
 * This module sits one level above `src/storage/adata.ts`.  It provides
 * named, intention-revealing operations (add / update / remove / reorder /
 * setEnabled) instead of exposing raw JSON manipulation.
 *
 * Every function is **pure** with respect to the in-memory data: it reads
 * the current state, computes the new state, and writes it back atomically.
 * Concurrency is not an issue in the current Electron architecture where
 * all writes go through the main-process IPC handler sequentially.
 *
 * # Error handling
 *
 * Functions throw a `ProfileError` (typed subclass of Error) on:
 *   - Agent file not found (`AGENT_NOT_FOUND`)
 *   - Profile entry not found by ID (`PROFILE_NOT_FOUND`)
 *   - Invalid input (empty filePath, etc.) (`INVALID_INPUT`)
 *
 * The IPC handlers catch `ProfileError` and surface `.code` in the
 * response payload so the renderer can show a localised error message.
 *
 * # Relation to adata.ts
 *
 * ```
 * ipc-handlers.ts
 *       │
 *       └── profiles.ts   ← you are here
 *                │
 *                └── adata.ts  (raw I/O + normalisation)
 *                         │
 *                         └── FileAdapter (injected)
 * ```
 */

import type { AgentProfile, CreateProfileInput } from "../types/agent.ts";
import { makeAgentProfile, sortProfilesByOrder } from "../types/agent.ts";
import {
  type FileAdapter,
  readAdataWithProfiles,
  writeAdataRaw,
  mergeProfiles,
} from "./adata.ts";

// ── Typed error ───────────────────────────────────────────────────────────

/**
 * Error codes for profile operations.
 *
 * The IPC layer maps these codes to renderer-facing error messages via i18n.
 */
export type ProfileErrorCode =
  | "AGENT_NOT_FOUND"   // The agent's .adata file does not exist
  | "PROFILE_NOT_FOUND" // No profile with the given id exists
  | "INVALID_INPUT";    // Caller provided invalid data (empty path, etc.)

/**
 * Structured error thrown by profile operations.
 *
 * @example
 * ```ts
 * try {
 *   await addProfile(fs, projectDir, agentId, input);
 * } catch (err) {
 *   if (err instanceof ProfileError && err.code === "AGENT_NOT_FOUND") {
 *     // handle
 *   }
 * }
 * ```
 */
export class ProfileError extends Error {
  constructor(
    public readonly code: ProfileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

// ── Read ──────────────────────────────────────────────────────────────────

/**
 * Returns the normalised profile list for an agent.
 *
 * @returns An empty array if the agent has no profiles yet (never throws for
 *   a missing `profile` key — that is a valid state for legacy agents).
 * @throws  `ProfileError(AGENT_NOT_FOUND)` if the `.adata` file is absent.
 *
 * @example
 * ```ts
 * const profiles = await listProfiles(fs, projectDir, agentId);
 * // profiles is always AgentProfile[], sorted by order
 * ```
 */
export async function listProfiles(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
): Promise<AgentProfile[]> {
  const result = await readAdataWithProfiles(fs, projectDir, agentId);

  if (!result) {
    throw new ProfileError(
      "AGENT_NOT_FOUND",
      `Agent .adata not found: ${agentId}`,
    );
  }

  return sortProfilesByOrder(result.profiles);
}

// ── Add ───────────────────────────────────────────────────────────────────

/**
 * Appends a new profile entry to the agent's profile list.
 *
 * The new profile is assigned:
 *   - A fresh UUID (`crypto.randomUUID()`)
 *   - An `order` value of `max(existing.order) + 1` (or 0 if the list is empty)
 *     unless `input.order` is explicitly provided.
 *
 * @returns The complete updated profile list (sorted by order).
 * @throws  `ProfileError(AGENT_NOT_FOUND)` if the `.adata` file is absent.
 * @throws  `ProfileError(INVALID_INPUT)` if `input.filePath` is empty.
 *
 * @example
 * ```ts
 * const updated = await addProfile(fs, projectDir, agentId, {
 *   selector: "System Prompt",
 *   filePath: "behaviors/abc/system.md",
 *   enabled: true,
 * });
 * ```
 */
export async function addProfile(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
  input: CreateProfileInput,
): Promise<AgentProfile[]> {
  // Validate input
  if (!input.filePath || !input.filePath.trim()) {
    throw new ProfileError("INVALID_INPUT", "filePath must not be empty");
  }
  if (!input.selector || !input.selector.trim()) {
    throw new ProfileError("INVALID_INPUT", "selector must not be empty");
  }

  const result = await readAdataWithProfiles(fs, projectDir, agentId);

  if (!result) {
    throw new ProfileError(
      "AGENT_NOT_FOUND",
      `Agent .adata not found: ${agentId}`,
    );
  }

  const newProfile = makeAgentProfile(input, result.profiles);
  const updated = [...result.profiles, newProfile];

  await writeAdataRaw(
    fs,
    projectDir,
    agentId,
    mergeProfiles(result.raw, updated),
  );

  return sortProfilesByOrder(updated);
}

// ── Update ────────────────────────────────────────────────────────────────

/**
 * Updates specific fields of an existing profile entry.
 *
 * Only the fields present in `patch` are changed; all other fields retain
 * their current values.  The `id` field is immutable and cannot be patched.
 *
 * @param profileId - UUID of the profile entry to update.
 * @param patch     - Partial AgentProfile (without `id`).
 * @returns The complete updated profile list (sorted by order).
 * @throws  `ProfileError(AGENT_NOT_FOUND)`  if the `.adata` file is absent.
 * @throws  `ProfileError(PROFILE_NOT_FOUND)` if no profile with `profileId` exists.
 * @throws  `ProfileError(INVALID_INPUT)` if patching to an empty filePath/selector.
 *
 * @example
 * ```ts
 * const updated = await updateProfile(fs, projectDir, agentId, profileId, {
 *   label: "Renamed label",
 *   enabled: false,
 * });
 * ```
 */
export async function updateProfile(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
  profileId: string,
  patch: Partial<Omit<AgentProfile, "id">>,
): Promise<AgentProfile[]> {
  // Validate patched fields if present
  if (patch.filePath !== undefined && !patch.filePath.trim()) {
    throw new ProfileError("INVALID_INPUT", "filePath must not be empty");
  }
  if (patch.selector !== undefined && !patch.selector.trim()) {
    throw new ProfileError("INVALID_INPUT", "selector must not be empty");
  }

  const result = await readAdataWithProfiles(fs, projectDir, agentId);

  if (!result) {
    throw new ProfileError(
      "AGENT_NOT_FOUND",
      `Agent .adata not found: ${agentId}`,
    );
  }

  const index = result.profiles.findIndex((p) => p.id === profileId);
  if (index === -1) {
    throw new ProfileError(
      "PROFILE_NOT_FOUND",
      `Profile not found: ${profileId} (agentId=${agentId})`,
    );
  }

  // Immutable update — id cannot be overwritten
  const existingProfile = result.profiles[index];
  if (!existingProfile) {
    throw new ProfileError(
      "PROFILE_NOT_FOUND",
      `Profile not found at index ${index}`,
    );
  }

  const updatedEntry: AgentProfile = {
    ...existingProfile,
    ...patch,
    id: profileId, // Guard: id is always preserved
  };

  const updated = result.profiles.map((p, i) =>
    i === index ? updatedEntry : p,
  );

  await writeAdataRaw(
    fs,
    projectDir,
    agentId,
    mergeProfiles(result.raw, updated),
  );

  return sortProfilesByOrder(updated);
}

// ── Remove ────────────────────────────────────────────────────────────────

/**
 * Removes a profile entry by id.
 *
 * The underlying `.md` file is NOT deleted — only the reference in `.adata`
 * is removed.  Deletion of the file (if desired) is the caller's
 * responsibility.
 *
 * @returns The complete updated profile list (sorted by order).
 * @throws  `ProfileError(AGENT_NOT_FOUND)`   if the `.adata` file is absent.
 * @throws  `ProfileError(PROFILE_NOT_FOUND)` if no profile with `profileId` exists.
 *
 * @example
 * ```ts
 * const updated = await removeProfile(fs, projectDir, agentId, profileId);
 * ```
 */
export async function removeProfile(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
  profileId: string,
): Promise<AgentProfile[]> {
  const result = await readAdataWithProfiles(fs, projectDir, agentId);

  if (!result) {
    throw new ProfileError(
      "AGENT_NOT_FOUND",
      `Agent .adata not found: ${agentId}`,
    );
  }

  const exists = result.profiles.some((p) => p.id === profileId);
  if (!exists) {
    throw new ProfileError(
      "PROFILE_NOT_FOUND",
      `Profile not found: ${profileId} (agentId=${agentId})`,
    );
  }

  const updated = result.profiles.filter((p) => p.id !== profileId);

  await writeAdataRaw(
    fs,
    projectDir,
    agentId,
    mergeProfiles(result.raw, updated),
  );

  return sortProfilesByOrder(updated);
}

// ── Reorder ───────────────────────────────────────────────────────────────

/**
 * Reorders the profile list by replacing each entry's `order` with the
 * position of its id in the provided `orderedIds` array.
 *
 * Profiles NOT referenced in `orderedIds` are appended after the ordered
 * entries (preserving their original relative order) rather than dropped.
 *
 * @param orderedIds - Array of profile UUIDs in the desired order.
 * @returns The complete updated profile list (sorted by new order).
 * @throws  `ProfileError(AGENT_NOT_FOUND)` if the `.adata` file is absent.
 *
 * @example
 * ```ts
 * // Reverse the current order
 * const ids = profiles.map(p => p.id).reverse();
 * const updated = await reorderProfiles(fs, projectDir, agentId, ids);
 * ```
 */
export async function reorderProfiles(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
  orderedIds: string[],
): Promise<AgentProfile[]> {
  const result = await readAdataWithProfiles(fs, projectDir, agentId);

  if (!result) {
    throw new ProfileError(
      "AGENT_NOT_FOUND",
      `Agent .adata not found: ${agentId}`,
    );
  }

  const profileMap = new Map(result.profiles.map((p) => [p.id, p]));

  // Profiles referenced in orderedIds get their order replaced by position
  const reordered: AgentProfile[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (!id) continue;
    const p = profileMap.get(id);
    if (p) {
      reordered.push({ ...p, order: i });
      profileMap.delete(id);
    }
    // Silently skip IDs that no longer exist in the list
  }

  // Profiles not referenced in orderedIds are appended after
  let appendOrder = reordered.length;
  for (const p of profileMap.values()) {
    reordered.push({ ...p, order: appendOrder++ });
  }

  await writeAdataRaw(
    fs,
    projectDir,
    agentId,
    mergeProfiles(result.raw, reordered),
  );

  return sortProfilesByOrder(reordered);
}

// ── Toggle enabled ────────────────────────────────────────────────────────

/**
 * Toggles (or explicitly sets) the `enabled` flag on a profile entry.
 *
 * Convenience wrapper around `updateProfile` for the common UI action.
 *
 * @param profileId - UUID of the profile to toggle.
 * @param enabled   - New enabled state.  When omitted, the current value is
 *   flipped (true → false, false → true).
 * @returns The complete updated profile list.
 * @throws  `ProfileError` — see `updateProfile`.
 *
 * @example
 * ```ts
 * // Disable a profile
 * await setProfileEnabled(fs, projectDir, agentId, profileId, false);
 *
 * // Flip the current state
 * await setProfileEnabled(fs, projectDir, agentId, profileId);
 * ```
 */
export async function setProfileEnabled(
  fs: FileAdapter,
  projectDir: string,
  agentId: string,
  profileId: string,
  enabled?: boolean,
): Promise<AgentProfile[]> {
  if (enabled !== undefined) {
    return updateProfile(fs, projectDir, agentId, profileId, { enabled });
  }

  // Flip: read current value first
  const result = await readAdataWithProfiles(fs, projectDir, agentId);

  if (!result) {
    throw new ProfileError(
      "AGENT_NOT_FOUND",
      `Agent .adata not found: ${agentId}`,
    );
  }

  const profile = result.profiles.find((p) => p.id === profileId);
  if (!profile) {
    throw new ProfileError(
      "PROFILE_NOT_FOUND",
      `Profile not found: ${profileId} (agentId=${agentId})`,
    );
  }

  return updateProfile(fs, projectDir, agentId, profileId, {
    enabled: !profile.enabled,
  });
}
