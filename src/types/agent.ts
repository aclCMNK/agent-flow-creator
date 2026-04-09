/**
 * src/types/agent.ts
 *
 * Domain types for the Agent Profiling feature.
 *
 * # Overview
 *
 * An "agent profile" (AgentProfile) is a named, ordered reference to a
 * markdown document (`.md` file) associated with one particular **selector**
 * (a functional role label such as "System Prompt", "Memory", "Tools", …).
 *
 * Each agent can have **zero or more** profiles.  Multiple profiles with the
 * same selector are allowed — the `order` field determines their rendering
 * sequence.  No uniqueness constraint exists at the type level; enforcement
 * (if needed) lives in the storage layer.
 *
 * ## Persistence location
 *
 * Profiles are stored in the agent's `.adata` file under the top-level
 * `profile` key as a JSON array:
 *
 * ```json
 * {
 *   "profile": [
 *     {
 *       "id":         "550e8400-e29b-41d4-a716-446655440000",
 *       "selector":   "System Prompt",
 *       "filePath":   "behaviors/abc-123/system-prompt.md",
 *       "label":      "Core identity",
 *       "order":      0,
 *       "enabled":    true
 *     }
 *   ]
 * }
 * ```
 *
 * ## Design decisions
 *
 * - `id` is a UUID v4 string — no runtime UUID library is required; IDs are
 *   generated in the storage helpers using `crypto.randomUUID()`.
 * - `filePath` is always relative to the **project root** (same convention
 *   as AspectRef.filePath and SkillRef.filePath).
 * - `selector` is a free-form string.  The PROFILE_SELECTORS constant
 *   (below) lists the well-known values used in the UI; custom values are
 *   accepted for forward-compatibility.
 * - `enabled` defaults to `true`; setting it to `false` excludes the profile
 *   from compiled output without deleting the reference.
 * - `order` is a non-negative integer.  Lower = earlier in the compiled
 *   output.  Duplicates are resolved by stable sort (array position).
 */

// ── Core domain types ──────────────────────────────────────────────────────

/**
 * A single profile entry associated with an agent.
 *
 * Stored as an element of `.adata.profile[]`.
 */
export interface AgentProfile {
  /**
   * Stable UUID v4 identifier for this profile entry.
   * Generated once on creation; never changes.
   */
  readonly id: string;

  /**
   * Functional role / category of this profile document.
   *
   * Well-known values are enumerated in PROFILE_SELECTORS but any string
   * is accepted (future extensibility).
   *
   * Examples: "System Prompt", "Memory", "Tools", "Examples", "Context"
   */
  selector: string;

  /**
   * Relative path from the project root to the `.md` file.
   *
   * Convention: `behaviors/<agentId>/<filename>.md`
   * (same convention as AspectRef.filePath)
   *
   * Must not be empty or start with a forward-slash.
   */
  filePath: string;

  /**
   * Optional human-readable label for the UI.
   * Falls back to the filename if absent.
   */
  label?: string;

  /**
   * Rendering / compilation order within the same selector group.
   * Non-negative integer. Default: 0.
   */
  order: number;

  /**
   * Whether this profile is active.
   * Inactive profiles are stored but excluded from compiled output.
   * Default: true.
   */
  enabled: boolean;
}

/**
 * Minimal shape of the `.adata` raw JSON that this module operates on.
 *
 * We intentionally use a structural "duck" type instead of importing the full
 * Zod-inferred `Adata` type to keep this module free of schema dependencies.
 * The storage helpers narrow and validate the `profile` array on read.
 *
 * Other `.adata` fields (aspects, skills, metadata, …) are preserved
 * verbatim by all write helpers.
 */
export interface AdataWithProfile {
  /** .adata format version */
  version?: number;
  /** UUID of the owning agent */
  agentId: string;
  /**
   * The profile list.
   * May be absent on legacy files (pre-profiling feature).
   * Defaults to [] when missing.
   */
  profile?: AgentProfile[];
  /**
   * All other .adata fields that the profiling layer must not touch.
   * Using an index signature preserves unknown keys during read/write.
   */
  [key: string]: unknown;
}

// ── Well-known selector constants ─────────────────────────────────────────

/**
 * Canonical selector labels used in the UI.
 *
 * These are the pre-defined options shown in the "Selector" dropdown of the
 * profile modal.  Users may also type a custom value.
 *
 * Extend this tuple when new selectors are standardised.
 */
export const PROFILE_SELECTORS = [
  "System Prompt",
  "Memory",
  "Tools",
  "Examples",
  "Context",
  "Rules",
  "Persona",
] as const;

/**
 * Union type of all well-known selector strings.
 * Custom values are typed as `string` — see AgentProfile.selector.
 */
export type ProfileSelector = (typeof PROFILE_SELECTORS)[number];

// ── Factory / creation helpers ────────────────────────────────────────────

/**
 * Input to create a new AgentProfile.
 * `id` and `order` are omitted — they are assigned by the factory.
 */
export type CreateProfileInput = Omit<AgentProfile, "id" | "order"> & {
  /**
   * Explicit order override.
   * When omitted the storage layer appends to the end of the list.
   */
  order?: number;
};

/**
 * Constructs a new AgentProfile with a freshly generated UUID.
 *
 * @param input - Required profile fields (id/order assigned automatically)
 * @param currentProfiles - Existing profiles, used to compute the next order
 *   when `input.order` is not provided.
 * @returns A fully-formed AgentProfile ready to be persisted.
 *
 * @example
 * ```ts
 * const p = makeAgentProfile(
 *   { selector: "System Prompt", filePath: "behaviors/abc/system.md", enabled: true },
 *   existingProfiles
 * );
 * ```
 */
export function makeAgentProfile(
  input: CreateProfileInput,
  currentProfiles: readonly AgentProfile[] = [],
): AgentProfile {
  const nextOrder =
    input.order !== undefined
      ? input.order
      : currentProfiles.length === 0
        ? 0
        : Math.max(...currentProfiles.map((p) => p.order)) + 1;

  return {
    id: crypto.randomUUID(),
    selector: input.selector,
    filePath: input.filePath,
    label: input.label,
    order: nextOrder,
    enabled: input.enabled ?? true,
  };
}

/**
 * Returns profiles sorted by order (ascending), with a stable tie-break
 * based on array position.  Does NOT mutate the input array.
 */
export function sortProfilesByOrder(
  profiles: readonly AgentProfile[],
): AgentProfile[] {
  return [...profiles].sort((a, b) => a.order - b.order);
}
