/**
 * src/renderer/services/model-search-utils.ts
 *
 * Pure utility functions for the model search feature.
 * Combines CLI model list with models.dev extended data.
 * No side effects, no state — fully testable in isolation.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModelSearchEntry {
  provider: string;
  model: string;
  fullId: string;                    // "provider/model"
  inputCostPer1M: number | null;     // USD per 1M tokens input
  outputCostPer1M: number | null;    // USD per 1M tokens output
  hasReasoning: boolean | null;      // null = no info
  contextWindow: number | null;      // tokens
  maxOutput: number | null;          // tokens
  hasExtendedInfo: boolean;          // false if no data in models.dev
}

// ── Internal types for models.dev JSON structure ──────────────────────────────

interface ModelsDevEntry {
  id?: string;
  cost?: {
    input?: unknown;
    output?: unknown;
  };
  reasoning?: unknown;
  limit?: {
    context?: unknown;
    output?: unknown;
  };
}

interface ModelsDevData {
  models?: unknown[];
}

// ── buildModelSearchEntries ───────────────────────────────────────────────────

/**
 * Crosses the CLI model list with models.dev extended data.
 * Returns a sorted array of ModelSearchEntry.
 *
 * @param cliModels    - Map from `useOpencodeModels`: { provider: string[] }
 * @param modelsDevData - Raw JSON from `useModelsApi`: unknown | null
 */
export function buildModelSearchEntries(
  cliModels: Record<string, string[]>,
  modelsDevData: unknown | null,
): ModelSearchEntry[] {
  // ── Build lookup map from models.dev data ────────────────────────────────
  const lookupMap = new Map<string, ModelsDevEntry>();

  const rawData = modelsDevData as ModelsDevData | null;
  if (rawData && Array.isArray(rawData.models)) {
    for (const item of rawData.models) {
      const entry = item as ModelsDevEntry;
      if (entry && typeof entry.id === "string" && entry.id) {
        lookupMap.set(entry.id, entry);
      }
    }
  }

  // ── Build entries ─────────────────────────────────────────────────────────
  const entries: ModelSearchEntry[] = [];

  for (const [provider, modelList] of Object.entries(cliModels)) {
    for (const model of modelList) {
      const fullId = `${provider}/${model}`;
      const entry = lookupMap.get(fullId);

      const inputCostPer1M = typeof entry?.cost?.input === "number" ? entry.cost.input : null;
      const outputCostPer1M = typeof entry?.cost?.output === "number" ? entry.cost.output : null;
      const hasReasoning = typeof entry?.reasoning === "boolean" ? entry.reasoning : null;
      const contextWindow = typeof entry?.limit?.context === "number" ? entry.limit.context : null;
      const maxOutput = typeof entry?.limit?.output === "number" ? entry.limit.output : null;
      const hasExtendedInfo = entry !== undefined;

      entries.push({
        provider,
        model,
        fullId,
        inputCostPer1M,
        outputCostPer1M,
        hasReasoning,
        contextWindow,
        maxOutput,
        hasExtendedInfo,
      });
    }
  }

  // ── Sort by provider then model ───────────────────────────────────────────
  entries.sort((a, b) => {
    const providerCmp = a.provider.localeCompare(b.provider);
    if (providerCmp !== 0) return providerCmp;
    return a.model.localeCompare(b.model);
  });

  return entries;
}

// ── filterModelEntries ────────────────────────────────────────────────────────

/**
 * Filters model entries by a free-text query against all visible fields.
 * Case-insensitive. Empty query returns all entries.
 *
 * @param entries - Full list of ModelSearchEntry
 * @param query   - User-typed search string
 */
export function filterModelEntries(
  entries: ModelSearchEntry[],
  query: string,
): ModelSearchEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return entries;

  const normalized = trimmed.toLowerCase();

  return entries.filter((entry) => {
    const searchable = [
      entry.provider,
      entry.model,
      entry.fullId,
      entry.inputCostPer1M !== null ? `${entry.inputCostPer1M}` : "no info",
      entry.outputCostPer1M !== null ? `${entry.outputCostPer1M}` : "no info",
      entry.hasReasoning === true ? "yes reasoning" : entry.hasReasoning === false ? "no reasoning" : "",
      entry.contextWindow !== null ? `${entry.contextWindow}` : "",
      entry.maxOutput !== null ? `${entry.maxOutput}` : "",
    ].join(" ").toLowerCase();

    return searchable.includes(normalized);
  });
}
