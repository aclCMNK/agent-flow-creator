/**
 * tests/electron/opencode-config-temperature-ipc.test.ts
 *
 * Integration tests for the OpenCode config IPC handlers with all config fields.
 *
 * Verifies that:
 *   - adataGetOpenCodeConfig returns temperature, hidden, steps, color from .adata
 *   - adataSetOpenCodeConfig persists all fields to .adata
 *   - Fields default correctly when absent from file (backwards-compatibility)
 *
 * These tests use the pure handler logic extracted to opencode-config-handlers.ts.
 */

import { describe, it, expect } from "bun:test";
import {
  getOpenCodeConfigFromAdata,
  setOpenCodeConfigInAdata,
  OPENCODE_CONFIG_TEMPERATURE_DEFAULT,
  OPENCODE_CONFIG_HIDDEN_DEFAULT,
  OPENCODE_CONFIG_STEPS_DEFAULT,
  OPENCODE_CONFIG_COLOR_DEFAULT,
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
        hidden: false,
        steps: 7,
        color: "#ffffff",
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
    expect(result?.temperature).toBeCloseTo(OPENCODE_CONFIG_TEMPERATURE_DEFAULT, 5);
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
        hidden: false,
        steps: 10,
        color: "#aabbcc",
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
        hidden: false,
        steps: 7,
        color: "#ffffff",
      },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.temperature).toBeCloseTo(1.0, 5);
  });

  // ── Hidden field defaults ─────────────────────────────────────────────────

  it("returns hidden=false as default when missing", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5 },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.hidden).toBe(OPENCODE_CONFIG_HIDDEN_DEFAULT);
  });

  it("returns hidden=true when explicitly set to true", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5, hidden: true },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.hidden).toBe(true);
  });

  it("returns hidden=false when explicitly set to false", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5, hidden: false },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.hidden).toBe(false);
  });

  // ── Steps field defaults ──────────────────────────────────────────────────

  it("returns steps=7 as default when missing", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5 },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.steps).toBe(OPENCODE_CONFIG_STEPS_DEFAULT);
  });

  it("returns steps value when explicitly set", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5, steps: 50 },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.steps).toBe(50);
  });

  it("returns steps=7 as default when steps is undefined", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5, steps: undefined },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.steps).toBe(OPENCODE_CONFIG_STEPS_DEFAULT);
  });

  // ── Color field defaults ──────────────────────────────────────────────────

  it("returns color='#ffffff' as default when missing", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5 },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.color).toBe(OPENCODE_CONFIG_COLOR_DEFAULT);
  });

  it("returns color value when a valid hex is set", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5, color: "#aabbcc" },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.color).toBe("#aabbcc");
  });

  it("returns default color when an invalid hex is stored", () => {
    const adata = {
      opencode: { provider: "OpenAI", model: "gpt-4o", temperature: 0.5, color: "notahex" },
    };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.color).toBe(OPENCODE_CONFIG_COLOR_DEFAULT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setOpenCodeConfigInAdata
// ─────────────────────────────────────────────────────────────────────────────

describe("setOpenCodeConfigInAdata", () => {
  it("writes temperature as float under adata.opencode.temperature", () => {
    const existing = { version: 1, agentId: "abc" };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "GitHub-Copilot",
      model: "gpt-4o",
      temperature: 0.05,
      hidden: false,
      steps: 7,
      color: "#ffffff",
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
      hidden: false,
      steps: 7,
      color: "#ffffff",
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
      hidden: false,
      steps: 7,
      color: "#ffffff",
    });

    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.temperature).toBe(0);
  });

  it("writes hidden=true correctly", () => {
    const existing = { version: 1 };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "OpenAI",
      model: "gpt-4o",
      temperature: 0.5,
      hidden: true,
      steps: 7,
      color: "#ffffff",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.hidden).toBe(true);
  });

  it("writes hidden=false correctly", () => {
    const existing = { version: 1 };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "OpenAI",
      model: "gpt-4o",
      temperature: 0.5,
      hidden: false,
      steps: 7,
      color: "#ffffff",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.hidden).toBe(false);
  });

  it("writes steps value correctly", () => {
    const existing = { version: 1 };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "OpenAI",
      model: "gpt-4o",
      temperature: 0.5,
      hidden: false,
      steps: 50,
      color: "#ffffff",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.steps).toBe(50);
  });

  it("writes steps=null correctly (unset)", () => {
    const existing = { version: 1 };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "OpenAI",
      model: "gpt-4o",
      temperature: 0.5,
      hidden: false,
      steps: null,
      color: "#ffffff",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.steps).toBeNull();
  });

  it("writes color hex value correctly", () => {
    const existing = { version: 1 };
    const result = setOpenCodeConfigInAdata(existing, {
      provider: "OpenAI",
      model: "gpt-4o",
      temperature: 0.5,
      hidden: false,
      steps: 7,
      color: "#aabbcc",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const opencode = parsed.opencode as Record<string, unknown>;
    expect(opencode.color).toBe("#aabbcc");
  });
});
