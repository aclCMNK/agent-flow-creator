/**
 * tests/electron/opencode-config-temperature-ipc.test.ts
 *
 * Integration tests for the OpenCode config IPC handlers with temperature field.
 *
 * Verifies that:
 *   - adataGetOpenCodeConfig returns temperature from .adata[opencode.temperature]
 *   - adataSetOpenCodeConfig persists temperature to .adata[opencode.temperature]
 *   - Temperature defaults correctly when absent from file (backwards-compatibility)
 *
 * These tests use the pure handler logic extracted to ipc-opencode-temperature-handlers.ts.
 */

import { describe, it, expect } from "bun:test";
import {
  getOpenCodeConfigFromAdata,
  setOpenCodeConfigInAdata,
} from "../../src/electron/opencode-config-handlers.ts";

// ─────────────────────────────────────────────────────────────────────────────
// getOpenCodeConfigFromAdata
// ─────────────────────────────────────────────────────────────────────────────

describe("getOpenCodeConfigFromAdata", () => {
  it("returns temperature from adata.opencode.temperature", () => {
    const adata = {
      opencode: {
        provider: "GitHub-Copilot",
        model: "gpt-4o",
        temperature: 0.05,
      },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result).not.toBeNull();
    expect(result?.temperature).toBeCloseTo(0.05, 5);
    expect(result?.provider).toBe("GitHub-Copilot");
    expect(result?.model).toBe("gpt-4o");
  });

  it("returns temperature 0.05 as default when opencode exists but temperature is missing", () => {
    const adata = {
      opencode: {
        provider: "OpenAI",
        model: "gpt-4o",
        // no temperature key
      },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.temperature).toBeCloseTo(0.05, 5);
  });

  it("returns null when adata has no opencode key", () => {
    const adata = {};
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result).toBeNull();
  });

  it("returns temperature 0.0 when explicitly set to 0", () => {
    const adata = {
      opencode: {
        provider: "Ollama",
        model: "llama3",
        temperature: 0.0,
      },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.temperature).toBe(0);
  });

  it("returns temperature 1.0 when set to 100%", () => {
    const adata = {
      opencode: {
        provider: "OpenAI",
        model: "gpt-4",
        temperature: 1.0,
      },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.temperature).toBeCloseTo(1.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setOpenCodeConfigInAdata
// ─────────────────────────────────────────────────────────────────────────────

describe("setOpenCodeConfigInAdata", () => {
  it("writes temperature as float under adata.opencode.temperature", () => {
    const existing = {
      version: 1,
      agentId: "abc",
    };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "GitHub-Copilot",
      model: "gpt-4o",
      temperature: 0.05,
    });

    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.temperature).toBeCloseTo(0.05, 5);
    expect(opencode.provider).toBe("GitHub-Copilot");
    expect(opencode.model).toBe("gpt-4o");
  });

  it("preserves existing adata fields when writing opencode config", () => {
    const existing = {
      version: 1,
      agentId: "abc",
      description: "kept",
      metadata: { adapter: "opencode" },
    };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "OpenAI",
      model: "gpt-4",
      temperature: 0.5,
    });

    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.description).toBe("kept");
    expect((parsed.metadata as Record<string, unknown>).adapter).toBe("opencode");
  });

  it("stores temperature 0 (0%) as 0.0 in the JSON", () => {
    const existing = { version: 1 };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "Ollama",
      model: "llama3",
      temperature: 0,
    });

    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.temperature).toBe(0);
  });
});
