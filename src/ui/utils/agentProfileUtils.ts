/**
 * src/ui/utils/agentProfileUtils.ts
 *
 * Pure utility functions for the Agent Profiling UI layer.
 *
 * All functions are pure (no side effects, no I/O) to keep them
 * trivially testable with bun:test.
 *
 * Consumed by:
 *   - AgentProfileModal.tsx
 *   - ProfileList.tsx
 *   - AgentProfileFileExplorer.tsx
 */

import type {
  BridgeAgentProfile,
  AdataAddProfileRequest,
} from "../../electron/bridge.types.ts";

// ── File path helpers ─────────────────────────────────────────────────────

/**
 * Extracts the filename (last path segment) from a relative or absolute path.
 *
 * @example
 * getFileNameFromPath("behaviors/abc/system.md")  // → "system.md"
 * getFileNameFromPath("readme.md")                // → "readme.md"
 */
export function getFileNameFromPath(filePath: string): string {
  if (!filePath) return "";
  const parts = filePath.split("/");
  return parts[parts.length - 1] ?? "";
}

// ── Profile label resolution ──────────────────────────────────────────────

/**
 * Returns the display label for a profile entry.
 *
 * Priority:
 *   1. `profile.label` when non-empty
 *   2. Filename extracted from `profile.filePath`
 *
 * @example
 * resolveProfileLabel({ label: "Core identity", filePath: "..." })
 * // → "Core identity"
 *
 * resolveProfileLabel({ filePath: "behaviors/abc/system.md" })
 * // → "system.md"
 */
export function resolveProfileLabel(
  profile: Pick<BridgeAgentProfile, "label" | "filePath">,
): string {
  if (profile.label && profile.label.trim() !== "") {
    return profile.label;
  }
  return getFileNameFromPath(profile.filePath);
}

// ── Request builders ──────────────────────────────────────────────────────

/**
 * Constructs the IPC payload to add a new profile entry.
 *
 * Centralises the mapping from UI form state → AdataAddProfileRequest
 * so the component only needs to call this function.
 */
export function buildAddProfileRequest(opts: {
  projectDir: string;
  agentId: string;
  selector: string;
  filePath: string;
  label?: string;
  enabled?: boolean;
}): AdataAddProfileRequest {
  const req: AdataAddProfileRequest = {
    projectDir: opts.projectDir,
    agentId: opts.agentId,
    selector: opts.selector,
    filePath: opts.filePath,
    enabled: opts.enabled ?? true,
  };
  if (opts.label !== undefined) {
    req.label = opts.label;
  }
  return req;
}

// ── Profile sorting ───────────────────────────────────────────────────────

/**
 * Returns a NEW sorted copy of the profiles array, ordered by `order` ascending.
 *
 * Does NOT mutate the original array.
 */
export function sortAndIndexProfiles(
  profiles: readonly BridgeAgentProfile[],
): BridgeAgentProfile[] {
  return [...profiles].sort((a, b) => a.order - b.order);
}

// ── File filtering ────────────────────────────────────────────────────────

/**
 * Filters an array of file paths/names to include only `.md` files.
 *
 * Case-insensitive extension check.
 */
export function filterOnlyMdPaths(paths: string[]): string[] {
  return paths.filter((p) => p.toLowerCase().endsWith(".md"));
}
