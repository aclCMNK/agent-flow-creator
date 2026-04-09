/**
 * src/electron/profile-handlers.ts
 *
 * Pure handler functions for the Agent Profiling IPC channels.
 *
 * These functions are separated from ipc-handlers.ts so they can be:
 *   1. Tested in isolation (no Electron IPC dependency, no real filesystem)
 *   2. Called directly from ipc-handlers.ts with the Node FileAdapter
 *
 * Each function receives a FileAdapter (injected) and the typed request
 * payload, and returns the corresponding typed result.
 *
 * Error mapping:
 *   - ProfileError → structured errorCode in the result payload
 *   - Unexpected errors → errorCode: "UNKNOWN", error: message
 *
 * The IPC layer (ipc-handlers.ts) wraps these in ipcMain.handle() calls
 * with the Node-based FileAdapter injected.
 */

import type { FileAdapter } from "../storage/adata.ts";
import {
  listProfiles,
  addProfile,
  updateProfile,
  removeProfile,
  reorderProfiles,
  ProfileError,
} from "../storage/profiles.ts";
import type {
  AdataListProfilesRequest,
  AdataListProfilesResult,
  AdataAddProfileRequest,
  AdataAddProfileResult,
  AdataUpdateProfileRequest,
  AdataUpdateProfileResult,
  AdataRemoveProfileRequest,
  AdataRemoveProfileResult,
  AdataReorderProfilesRequest,
  AdataReorderProfilesResult,
  BridgeAgentProfile,
} from "./bridge.types.ts";
import type { AgentProfile } from "../types/agent.ts";

// ── Domain → IPC DTO conversion ───────────────────────────────────────────

/**
 * Convert a domain AgentProfile to its IPC-safe BridgeAgentProfile shape.
 *
 * These are structurally identical; the conversion exists to make the
 * boundary explicit and avoid accidentally exposing internal fields.
 */
function toDto(p: AgentProfile): BridgeAgentProfile {
  return {
    id: p.id,
    selector: p.selector,
    filePath: p.filePath,
    label: p.label,
    order: p.order,
    enabled: p.enabled,
  };
}

// ── Error code extraction ─────────────────────────────────────────────────

/**
 * Map a caught error to a typed error code for the IPC result.
 *
 * ProfileError codes map 1:1 to the bridge errorCode union.
 * All other errors → "UNKNOWN".
 */
function toErrorCode(
  err: unknown,
): "AGENT_NOT_FOUND" | "PROFILE_NOT_FOUND" | "INVALID_INPUT" | "UNKNOWN" {
  if (err instanceof ProfileError) {
    return err.code;
  }
  return "UNKNOWN";
}

// ── Handlers ──────────────────────────────────────────────────────────────

/**
 * Returns the full sorted profile[] list for an agent.
 * Returns an empty array when the agent has no profiles yet.
 */
export async function handleListProfiles(
  fs: FileAdapter,
  req: AdataListProfilesRequest,
): Promise<AdataListProfilesResult> {
  try {
    const profiles = await listProfiles(fs, req.projectDir, req.agentId);
    return {
      success: true,
      profiles: profiles.map(toDto),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      profiles: [],
      error: message,
      errorCode: toErrorCode(err),
    };
  }
}

/**
 * Appends a new profile entry to the agent's profile list.
 * Returns the newly created entry and the updated full list.
 */
export async function handleAddProfile(
  fs: FileAdapter,
  req: AdataAddProfileRequest,
): Promise<AdataAddProfileResult> {
  try {
    const updatedProfiles = await addProfile(fs, req.projectDir, req.agentId, {
      selector: req.selector,
      filePath: req.filePath,
      label: req.label,
      order: req.order,
      enabled: req.enabled ?? true,
    });

    // The newly created profile is the last one (highest order) — or we find
    // it by matching filePath + selector since we just added it.
    // The storage layer assigns a unique UUID, so we find the one that's new
    // by looking at the updated list vs what was there before. Simplest:
    // it was just appended, find by the unique combination or just take the
    // profile with max order if no explicit order was given.
    // Actually: the profile returned from addProfile is the FULL sorted list.
    // To find the new one we need to look at filePath + selector match since
    // we cannot infer the UUID. We take the last added (highest order) among
    // matches.
    const matchingByPath = updatedProfiles.filter(
      (p) => p.filePath === req.filePath && p.selector === req.selector,
    );
    // In case of duplicates, the newest has the highest order
    const newProfile = matchingByPath.reduce<AgentProfile | undefined>((best, p) =>
      best === undefined || p.order > best.order ? p : best,
      undefined,
    );

    return {
      success: true,
      profile: newProfile ? toDto(newProfile) : undefined,
      profiles: updatedProfiles.map(toDto),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      errorCode: toErrorCode(err) as "AGENT_NOT_FOUND" | "INVALID_INPUT" | "UNKNOWN",
    };
  }
}

/**
 * Updates specific fields of an existing profile entry.
 * Returns the complete updated profile list.
 */
export async function handleUpdateProfile(
  fs: FileAdapter,
  req: AdataUpdateProfileRequest,
): Promise<AdataUpdateProfileResult> {
  try {
    const updatedProfiles = await updateProfile(
      fs,
      req.projectDir,
      req.agentId,
      req.profileId,
      req.patch,
    );

    return {
      success: true,
      profiles: updatedProfiles.map(toDto),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      errorCode: toErrorCode(err) as "AGENT_NOT_FOUND" | "PROFILE_NOT_FOUND" | "INVALID_INPUT" | "UNKNOWN",
    };
  }
}

/**
 * Removes a profile entry by id.
 * Does NOT delete the underlying .md file.
 * Returns the complete updated profile list.
 */
export async function handleRemoveProfile(
  fs: FileAdapter,
  req: AdataRemoveProfileRequest,
): Promise<AdataRemoveProfileResult> {
  try {
    const updatedProfiles = await removeProfile(
      fs,
      req.projectDir,
      req.agentId,
      req.profileId,
    );

    return {
      success: true,
      profiles: updatedProfiles.map(toDto),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      errorCode: toErrorCode(err) as "AGENT_NOT_FOUND" | "PROFILE_NOT_FOUND" | "UNKNOWN",
    };
  }
}

/**
 * Reorders the profile list by supplying profile UUIDs in the new desired order.
 * Returns the complete updated profile list.
 */
export async function handleReorderProfiles(
  fs: FileAdapter,
  req: AdataReorderProfilesRequest,
): Promise<AdataReorderProfilesResult> {
  try {
    const updatedProfiles = await reorderProfiles(
      fs,
      req.projectDir,
      req.agentId,
      req.orderedIds,
    );

    return {
      success: true,
      profiles: updatedProfiles.map(toDto),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      errorCode: toErrorCode(err) as "AGENT_NOT_FOUND" | "UNKNOWN",
    };
  }
}
