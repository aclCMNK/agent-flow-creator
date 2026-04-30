/**
 * tests/renderer/services/model-search-utils.test.ts
 *
 * Unit tests for src/renderer/services/model-search-utils.ts
 */

import { describe, it, expect } from "bun:test";
import {
  buildModelSearchEntries,
  filterModelEntries,
  type ModelSearchEntry,
} from "../../../src/renderer/services/model-search-utils.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLI_MODELS = {
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini"],
};

const MODELS_DEV_DATA = {
  models: [
    {
      id: "anthropic/claude-opus-4-5",
      cost: { input: 15, output: 75 },
      reasoning: true,
      limit: { context: 200000, output: 32000 },
    },
    {
      id: "openai/gpt-4o",
      cost: { input: 2.5, output: 10 },
      reasoning: false,
      limit: { context: 128000, output: 16384 },
    },
  ],
};

// ── buildModelSearchEntries ───────────────────────────────────────────────────

describe("buildModelSearchEntries", () => {
  it("returns entries for all CLI models", () => {
    const entries = buildModelSearchEntries(CLI_MODELS, MODELS_DEV_DATA);
    expect(entries.length).toBe(4);
  });

  it("fills extended info when models.dev has a match", () => {
    const entries = buildModelSearchEntries(CLI_MODELS, MODELS_DEV_DATA);
    const opus = entries.find((e) => e.fullId === "anthropic/claude-opus-4-5");
    expect(opus).toBeDefined();
    expect(opus!.inputCostPer1M).toBe(15);
    expect(opus!.outputCostPer1M).toBe(75);
    expect(opus!.hasReasoning).toBe(true);
    expect(opus!.contextWindow).toBe(200000);
    expect(opus!.maxOutput).toBe(32000);
    expect(opus!.hasExtendedInfo).toBe(true);
  });

  it("sets null fields and hasExtendedInfo=false when no match", () => {
    const entries = buildModelSearchEntries(CLI_MODELS, MODELS_DEV_DATA);
    const mini = entries.find((e) => e.fullId === "openai/gpt-4o-mini");
    expect(mini).toBeDefined();
    expect(mini!.inputCostPer1M).toBeNull();
    expect(mini!.outputCostPer1M).toBeNull();
    expect(mini!.hasReasoning).toBeNull();
    expect(mini!.contextWindow).toBeNull();
    expect(mini!.maxOutput).toBeNull();
    expect(mini!.hasExtendedInfo).toBe(false);
  });

  it("returns empty array for empty CLI models", () => {
    const entries = buildModelSearchEntries({}, MODELS_DEV_DATA);
    expect(entries).toEqual([]);
  });

  it("handles null modelsDevData gracefully", () => {
    const entries = buildModelSearchEntries(CLI_MODELS, null);
    expect(entries.length).toBe(4);
    entries.forEach((e) => {
      expect(e.hasExtendedInfo).toBe(false);
      expect(e.inputCostPer1M).toBeNull();
    });
  });

  it("sorts entries by provider then model", () => {
    const entries = buildModelSearchEntries(CLI_MODELS, null);
    const providers = entries.map((e) => e.provider);
    expect(providers[0]).toBe("anthropic");
    expect(providers[1]).toBe("anthropic");
    expect(providers[2]).toBe("openai");
    expect(providers[3]).toBe("openai");
    expect(entries[0].model).toBe("claude-opus-4-5");
    expect(entries[1].model).toBe("claude-sonnet-4-5");
    expect(entries[2].model).toBe("gpt-4o");
    expect(entries[3].model).toBe("gpt-4o-mini");
  });

  it("sets fullId as provider/model", () => {
    const entries = buildModelSearchEntries({ openai: ["gpt-4o"] }, null);
    expect(entries[0].fullId).toBe("openai/gpt-4o");
  });
});

// ── filterModelEntries ────────────────────────────────────────────────────────

const SAMPLE_ENTRIES: ModelSearchEntry[] = [
  {
    provider: "anthropic",
    model: "claude-opus-4-5",
    fullId: "anthropic/claude-opus-4-5",
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    hasReasoning: true,
    contextWindow: 200000,
    maxOutput: 32000,
    hasExtendedInfo: true,
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    fullId: "openai/gpt-4o-mini",
    inputCostPer1M: null,
    outputCostPer1M: null,
    hasReasoning: null,
    contextWindow: null,
    maxOutput: null,
    hasExtendedInfo: false,
  },
];

describe("filterModelEntries", () => {
  it("returns all entries for empty query", () => {
    expect(filterModelEntries(SAMPLE_ENTRIES, "")).toHaveLength(2);
    expect(filterModelEntries(SAMPLE_ENTRIES, "   ")).toHaveLength(2);
  });

  it("filters by provider name", () => {
    const result = filterModelEntries(SAMPLE_ENTRIES, "anthropic");
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("anthropic");
  });

  it("filters by model name", () => {
    const result = filterModelEntries(SAMPLE_ENTRIES, "gpt-4o-mini");
    expect(result).toHaveLength(1);
    expect(result[0].model).toBe("gpt-4o-mini");
  });

  it("filters by cost value", () => {
    const result = filterModelEntries(SAMPLE_ENTRIES, "15");
    expect(result).toHaveLength(1);
    expect(result[0].fullId).toBe("anthropic/claude-opus-4-5");
  });

  it("filters by reasoning 'yes'", () => {
    const result = filterModelEntries(SAMPLE_ENTRIES, "yes");
    expect(result).toHaveLength(1);
    expect(result[0].hasReasoning).toBe(true);
  });

  it("filters by 'no info' for null fields", () => {
    const result = filterModelEntries(SAMPLE_ENTRIES, "no info");
    expect(result).toHaveLength(1);
    expect(result[0].fullId).toBe("openai/gpt-4o-mini");
  });

  it("is case-insensitive", () => {
    const result = filterModelEntries(SAMPLE_ENTRIES, "ANTHROPIC");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no match", () => {
    const result = filterModelEntries(SAMPLE_ENTRIES, "zzz-no-match");
    expect(result).toHaveLength(0);
  });
});
