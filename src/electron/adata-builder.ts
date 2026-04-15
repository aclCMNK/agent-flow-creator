/**
 * src/electron/adata-builder.ts
 *
 * Pure builder function for `.adata` agent metadata documents.
 *
 * Extracted from the inline object literal in the SAVE_AGENT_GRAPH handler
 * so that:
 *   1. The shape can be typed exhaustively against AdataWriteShape.
 *   2. The function can be unit-tested in isolation (no Electron dependency).
 *   3. Metadata fields like `permissions`, `opencode`, and any future field
 *      cannot accidentally be dropped from the save cycle.
 *
 * ## Preservation contract
 *
 * - Every field that is ONLY managed by a dedicated handler (permissions,
 *   opencode, profile, aspects, skills, subagents, profilePath, createdAt)
 *   is taken straight from `existing` so it is never silently dropped.
 *
 * - `metadata` is deep-merged: existing metadata fields survive, and the
 *   graph-save fields (agentType, isOrchestrator, hidden) are overwritten.
 *
 * - Any **unknown / future field** present in `existing` is forwarded via
 *   a spread at the end of the builder return, guaranteeing forward
 *   compatibility.
 *
 * - `permissions` is treated as optional:
 *   - If `existing.permissions` is present (non-undefined) → forwarded as-is.
 *   - If absent (new agent, no existing file) → field is omitted (not set to
 *     null or `{}`), so new `.adata` files do NOT gain a spurious permissions key.
 */

import type { AgentGraphNode } from "./bridge.types.ts";

// ── Type for the adata write payload ────────────────────────────────────────

/**
 * TypeScript shape of a fully-written `.adata` document.
 *
 * This interface intentionally covers every field that the
 * `buildAdataFromExisting` function may produce. Keeping this exhaustive
 * forces future developers to update the builder whenever a new field is
 * added, preventing silent loss.
 *
 * Fields that are managed by dedicated IPC handlers (and therefore may be
 * absent on brand-new agents) are marked `optional` (`?`) so that we do
 * not inject spurious keys into freshly-created `.adata` files.
 */
export interface AdataWriteShape {
  /** Schema version — always 1 */
  version: number;
  /** Agent UUID */
  agentId: string;
  /** Slug name */
  agentName: string;
  /** Free-form description */
  description: string;
  /** Behavior aspect references */
  aspects: unknown[];
  /** Skill references */
  skills: unknown[];
  /** Subagent declarations */
  subagents: unknown[];
  /**
   * Relative path to the compiled profile.md.
   * Preserved from existing when set; falls back to slug-based default.
   */
  profilePath: string;
  /**
   * Profile entry array (managed by ADATA_*_PROFILE handlers).
   * Preserved from existing; defaults to [].
   */
  profile: unknown[];
  /** Agent-level metadata (agentType, isOrchestrator, hidden, ...) */
  metadata: Record<string, string>;
  /**
   * Permissions object (managed by ADATA_SET_PERMISSIONS handler).
   * Optional — absent for brand-new agents with no permissions yet.
   */
  permissions?: unknown;
  /**
   * OpenCode adapter config (managed by ADATA_SET_OPENCODE_CONFIG handler).
   * Optional — absent for agents not configured for OpenCode.
   */
  opencode?: unknown;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-modified timestamp */
  updatedAt: string;
  /** Forward-compat: any extra fields from existing are spread here */
  [key: string]: unknown;
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Builds a complete `.adata` write payload from a canvas graph node and the
 * current on-disk content for that agent.
 *
 * @param node     - Serialized agent node from the save request
 * @param existing - Current on-disk `.adata` content (empty `{}` for new agents)
 * @param now      - ISO 8601 timestamp to use for `updatedAt`
 * @returns        - A plain object ready to be written atomically to disk
 *
 * @pure This function does NOT perform any I/O. It does NOT mutate `existing`.
 */
export function buildAdataFromExisting(
  node: AgentGraphNode,
  existing: Record<string, unknown>,
  now: string,
): AdataWriteShape {
  // ── fields that come exclusively from the graph node ──────────────────────
  const agentId = node.id;
  const agentName = node.name;
  const description = node.description;

  // ── fields fully owned by dedicated handlers — preserved from disk ─────────
  const aspects = (existing.aspects as unknown[]) ?? [];
  const skills = (existing.skills as unknown[]) ?? [];
  const subagents = (existing.subagents as unknown[]) ?? [];
  const profile = (existing.profile as unknown[]) ?? [];

  // profilePath: keep existing (RENAME_AGENT_FOLDER may have updated it)
  const profilePath =
    typeof existing.profilePath === "string" && existing.profilePath.length > 0
      ? existing.profilePath
      : `behaviors/${node.name}/profile.md`;

  // ── metadata: deep-merge (existing fields survive, graph fields overwrite) ──
  const existingMetadata = (existing.metadata as Record<string, string>) ?? {};
  const metadata: Record<string, string> = {
    ...existingMetadata,
    agentType: node.type,
    isOrchestrator: String(node.isOrchestrator),
    // hidden is only meaningful for Sub-Agent; always false for other types
    hidden: node.type === "Sub-Agent" ? String(node.hidden) : "false",
  };

  // ── timestamps ───────────────────────────────────────────────────────────────
  const createdAt = (existing.createdAt as string) ?? now;
  const updatedAt = now;

  // ── base shape with all known fields ─────────────────────────────────────────
  const base: AdataWriteShape = {
    // Forward any UNKNOWN fields from existing first (future-compat spread).
    // Known fields declared below will overwrite any accidental collisions.
    ...existing,

    version: 1,
    agentId,
    agentName,
    description,
    aspects,
    skills,
    subagents,
    profilePath,
    profile,
    metadata,
    createdAt,
    updatedAt,
  };

  // ── permissions: optional — only set if present in existing ──────────────────
  // Using explicit key presence check to distinguish "absent" from "null" or "{}".
  if ("permissions" in existing && existing.permissions !== undefined) {
    base.permissions = existing.permissions;
  } else {
    // Ensure the key is truly absent for new agents (not set to undefined,
    // which JSON.stringify would omit anyway, but this is explicit).
    delete base.permissions;
  }

  // ── opencode: optional — only set if present in existing ─────────────────────
  if ("opencode" in existing && existing.opencode !== undefined) {
    base.opencode = existing.opencode;
  } else {
    delete base.opencode;
  }

  return base;
}
