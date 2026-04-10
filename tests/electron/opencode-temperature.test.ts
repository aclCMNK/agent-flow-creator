/**
 * tests/electron/opencode-temperature.test.ts
 *
 * Unit tests for the Temperature number input field in the OpenCode adapter config.
 *
 * Covers:
 *   - OPENCODE_TEMPERATURE_DEFAULT constant (must be 0.5 float)
 *   - OPENCODE_TEMPERATURE_HELP_TEXT constant (help text for the field)
 *   - isValidTemperature: validates range [0.0, 1.0]
 *   - Input values: valid, invalid (out of range, empty/NaN)
 */

import { describe, it, expect } from "bun:test";
import {
  OPENCODE_TEMPERATURE_DEFAULT,
  OPENCODE_TEMPERATURE_HELP_TEXT,
  isValidTemperature,
} from "../../src/ui/components/PropertiesPanel.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// OPENCODE_TEMPERATURE_DEFAULT
// ─────────────────────────────────────────────────────────────────────────────

describe("OPENCODE_TEMPERATURE_DEFAULT", () => {
  it("is 0.5 (float, direct storage value)", () => {
    expect(OPENCODE_TEMPERATURE_DEFAULT).toBeCloseTo(0.5, 5);
  });

  it("is within the valid range [0.0, 1.0]", () => {
    expect(OPENCODE_TEMPERATURE_DEFAULT).toBeGreaterThanOrEqual(0.0);
    expect(OPENCODE_TEMPERATURE_DEFAULT).toBeLessThanOrEqual(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OPENCODE_TEMPERATURE_HELP_TEXT
// ─────────────────────────────────────────────────────────────────────────────

describe("OPENCODE_TEMPERATURE_HELP_TEXT", () => {
  it("is a non-empty string", () => {
    expect(typeof OPENCODE_TEMPERATURE_HELP_TEXT).toBe("string");
    expect(OPENCODE_TEMPERATURE_HELP_TEXT.length).toBeGreaterThan(0);
  });

  it("contains '0 = less randomness' text", () => {
    expect(OPENCODE_TEMPERATURE_HELP_TEXT.toLowerCase()).toContain("less randomness");
  });

  it("contains '1.0 = more randomness' text", () => {
    expect(OPENCODE_TEMPERATURE_HELP_TEXT.toLowerCase()).toContain("more randomness");
  });

  it("exact value matches expected help text", () => {
    expect(OPENCODE_TEMPERATURE_HELP_TEXT).toBe("0 = less randomness — 1.0 = more randomness");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidTemperature
// ─────────────────────────────────────────────────────────────────────────────

describe("isValidTemperature — valid inputs", () => {
  it("accepts the minimum boundary value 0.0", () => {
    expect(isValidTemperature(0.0)).toBe(true);
  });

  it("accepts the maximum boundary value 1.0", () => {
    expect(isValidTemperature(1.0)).toBe(true);
  });

  it("accepts the default value 0.5", () => {
    expect(isValidTemperature(0.5)).toBe(true);
  });

  it("accepts a mid-range value 0.75", () => {
    expect(isValidTemperature(0.75)).toBe(true);
  });

  it("accepts 0.01 (minimum step)", () => {
    expect(isValidTemperature(0.01)).toBe(true);
  });

  it("accepts 0.99", () => {
    expect(isValidTemperature(0.99)).toBe(true);
  });
});

describe("isValidTemperature — invalid inputs (out of range)", () => {
  it("rejects value above 1.0 (e.g. 1.01)", () => {
    expect(isValidTemperature(1.01)).toBe(false);
  });

  it("rejects value below 0.0 (e.g. -0.01)", () => {
    expect(isValidTemperature(-0.01)).toBe(false);
  });

  it("rejects large positive value (e.g. 100)", () => {
    expect(isValidTemperature(100)).toBe(false);
  });

  it("rejects large negative value (e.g. -1)", () => {
    expect(isValidTemperature(-1)).toBe(false);
  });
});

describe("isValidTemperature — invalid inputs (empty/NaN)", () => {
  it("rejects NaN", () => {
    expect(isValidTemperature(NaN)).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(isValidTemperature(Infinity)).toBe(false);
  });

  it("rejects -Infinity", () => {
    expect(isValidTemperature(-Infinity)).toBe(false);
  });
});
