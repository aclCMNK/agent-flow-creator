/**
 * tests/electron/opencode-config-fields.test.ts
 *
 * Unit tests for the new OpenCode config fields added below temperature:
 *   - Hidden: boolean toggle (sub-agent only), default false
 *   - Steps: optional integer [7..100], default 7
 *   - Color: hex color string, required, default "#ffffff"
 *
 * Covers:
 *   - Default constants
 *   - isValidSteps: validates range [7, 100], integers only, null allowed
 *   - isValidColor: validates hex strings (#RGB and #RRGGBB)
 *   - getOpenCodeConfigFromAdata: returns defaults and persisted values
 *   - setOpenCodeConfigInAdata: writes new fields correctly
 */

import { describe, it, expect } from "bun:test";
import {
  OPENCODE_CONFIG_HIDDEN_DEFAULT,
  OPENCODE_CONFIG_STEPS_DEFAULT,
  OPENCODE_CONFIG_STEPS_MIN,
  OPENCODE_CONFIG_STEPS_MAX,
  OPENCODE_CONFIG_COLOR_DEFAULT,
  OPENCODE_CONFIG_COLOR_HEX_REGEX,
  isValidSteps,
  isValidColor,
  getOpenCodeConfigFromAdata,
  setOpenCodeConfigInAdata,
} from "../../src/electron/opencode-config-handlers.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

describe("OPENCODE_CONFIG_HIDDEN_DEFAULT", () => {
  it("is false", () => {
    expect(OPENCODE_CONFIG_HIDDEN_DEFAULT).toBe(false);
  });
});

describe("OPENCODE_CONFIG_STEPS_DEFAULT", () => {
  it("is 7", () => {
    expect(OPENCODE_CONFIG_STEPS_DEFAULT).toBe(7);
  });

  it("is within [STEPS_MIN, STEPS_MAX]", () => {
    expect(OPENCODE_CONFIG_STEPS_DEFAULT).toBeGreaterThanOrEqual(OPENCODE_CONFIG_STEPS_MIN);
    expect(OPENCODE_CONFIG_STEPS_DEFAULT).toBeLessThanOrEqual(OPENCODE_CONFIG_STEPS_MAX);
  });
});

describe("OPENCODE_CONFIG_STEPS_MIN and STEPS_MAX", () => {
  it("STEPS_MIN is 7", () => {
    expect(OPENCODE_CONFIG_STEPS_MIN).toBe(7);
  });

  it("STEPS_MAX is 100", () => {
    expect(OPENCODE_CONFIG_STEPS_MAX).toBe(100);
  });
});

describe("OPENCODE_CONFIG_COLOR_DEFAULT", () => {
  it("is '#ffffff'", () => {
    expect(OPENCODE_CONFIG_COLOR_DEFAULT).toBe("#ffffff");
  });

  it("is a valid hex color", () => {
    expect(OPENCODE_CONFIG_COLOR_HEX_REGEX.test(OPENCODE_CONFIG_COLOR_DEFAULT)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidSteps
// ─────────────────────────────────────────────────────────────────────────────

describe("isValidSteps — valid inputs", () => {
  it("accepts null (optional/unset)", () => {
    expect(isValidSteps(null)).toBe(true);
  });

  it("accepts the minimum boundary value 7", () => {
    expect(isValidSteps(7)).toBe(true);
  });

  it("accepts the maximum boundary value 100", () => {
    expect(isValidSteps(100)).toBe(true);
  });

  it("accepts the default value 7", () => {
    expect(isValidSteps(OPENCODE_CONFIG_STEPS_DEFAULT)).toBe(true);
  });

  it("accepts a mid-range value 50", () => {
    expect(isValidSteps(50)).toBe(true);
  });

  it("accepts 10", () => {
    expect(isValidSteps(10)).toBe(true);
  });

  it("accepts 99", () => {
    expect(isValidSteps(99)).toBe(true);
  });
});

describe("isValidSteps — invalid inputs (out of range)", () => {
  it("rejects value below 7 (e.g. 6)", () => {
    expect(isValidSteps(6)).toBe(false);
  });

  it("rejects value above 100 (e.g. 101)", () => {
    expect(isValidSteps(101)).toBe(false);
  });

  it("rejects 0", () => {
    expect(isValidSteps(0)).toBe(false);
  });

  it("rejects negative value (-1)", () => {
    expect(isValidSteps(-1)).toBe(false);
  });

  it("rejects large value (e.g. 1000)", () => {
    expect(isValidSteps(1000)).toBe(false);
  });
});

describe("isValidSteps — invalid inputs (non-integer or NaN)", () => {
  it("rejects non-integer float (e.g. 7.5)", () => {
    expect(isValidSteps(7.5)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isValidSteps(NaN)).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(isValidSteps(Infinity)).toBe(false);
  });

  it("rejects -Infinity", () => {
    expect(isValidSteps(-Infinity)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidColor
// ─────────────────────────────────────────────────────────────────────────────

describe("isValidColor — valid inputs", () => {
  it("accepts 6-digit lowercase hex '#ffffff'", () => {
    expect(isValidColor("#ffffff")).toBe(true);
  });

  it("accepts 6-digit uppercase hex '#AABBCC'", () => {
    expect(isValidColor("#AABBCC")).toBe(true);
  });

  it("accepts 6-digit mixed hex '#aAbBcC'", () => {
    expect(isValidColor("#aAbBcC")).toBe(true);
  });

  it("accepts 3-digit hex '#fff'", () => {
    expect(isValidColor("#fff")).toBe(true);
  });

  it("accepts 3-digit hex '#ABC'", () => {
    expect(isValidColor("#ABC")).toBe(true);
  });

  it("accepts the default '#ffffff'", () => {
    expect(isValidColor(OPENCODE_CONFIG_COLOR_DEFAULT)).toBe(true);
  });

  it("accepts '#000000'", () => {
    expect(isValidColor("#000000")).toBe(true);
  });

  it("accepts '#123456'", () => {
    expect(isValidColor("#123456")).toBe(true);
  });
});

describe("isValidColor — invalid inputs", () => {
  it("rejects empty string", () => {
    expect(isValidColor("")).toBe(false);
  });

  it("rejects hex without # prefix (e.g. 'ffffff')", () => {
    expect(isValidColor("ffffff")).toBe(false);
  });

  it("rejects 7-char hex without # prefix (e.g. '#fffffff')", () => {
    expect(isValidColor("#fffffff")).toBe(false);
  });

  it("rejects 2-char hex (e.g. '#ff')", () => {
    expect(isValidColor("#ff")).toBe(false);
  });

  it("rejects non-hex characters (e.g. '#gggggg')", () => {
    expect(isValidColor("#gggggg")).toBe(false);
  });

  it("rejects plain text 'red'", () => {
    expect(isValidColor("red")).toBe(false);
  });

  it("rejects rgb(...) format", () => {
    expect(isValidColor("rgb(255,255,255)")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOpenCodeConfigFromAdata — render defaults for new fields
// ─────────────────────────────────────────────────────────────────────────────

describe("getOpenCodeConfigFromAdata — new fields defaults", () => {
  const baseAdata = {
    opencode: {
      provider: "GitHub-Copilot",
      model: "gpt-4o",
      temperature: 0.5,
    },
  };

  it("defaults hidden to false when not set", () => {
    const result = getOpenCodeConfigFromAdata(baseAdata);
    expect(result?.hidden).toBe(false);
  });

  it("defaults steps to 7 when not set", () => {
    const result = getOpenCodeConfigFromAdata(baseAdata);
    expect(result?.steps).toBe(7);
  });

  it("defaults color to '#ffffff' when not set", () => {
    const result = getOpenCodeConfigFromAdata(baseAdata);
    expect(result?.color).toBe("#ffffff");
  });

  it("reads hidden=true when set", () => {
    const adata = { opencode: { ...baseAdata.opencode, hidden: true } };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.hidden).toBe(true);
  });

  it("reads steps=50 when set", () => {
    const adata = { opencode: { ...baseAdata.opencode, steps: 50 } };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.steps).toBe(50);
  });

  it("reads color='#123abc' when set", () => {
    const adata = { opencode: { ...baseAdata.opencode, color: "#123abc" } };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.color).toBe("#123abc");
  });

  it("falls back to default color when an invalid hex string is stored", () => {
    const adata = { opencode: { ...baseAdata.opencode, color: "not-a-hex" } };
    const result = getOpenCodeConfigFromAdata(adata);
    expect(result?.color).toBe("#ffffff");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setOpenCodeConfigInAdata — writes new fields
// ─────────────────────────────────────────────────────────────────────────────

describe("setOpenCodeConfigInAdata — new fields", () => {
  const baseConfig = {
    provider: "GitHub-Copilot",
    model: "gpt-4o",
    temperature: 0.5,
    hidden: false,
    steps: 7,
    color: "#ffffff",
  };

  it("writes hidden=true under opencode.hidden", () => {
    const result = setOpenCodeConfigInAdata({}, { ...baseConfig, hidden: true });
    const oc = (JSON.parse(result) as Record<string, unknown>).opencode as Record<string, unknown>;
    expect(oc.hidden).toBe(true);
  });

  it("writes hidden=false under opencode.hidden", () => {
    const result = setOpenCodeConfigInAdata({}, { ...baseConfig, hidden: false });
    const oc = (JSON.parse(result) as Record<string, unknown>).opencode as Record<string, unknown>;
    expect(oc.hidden).toBe(false);
  });

  it("writes steps=100 under opencode.steps", () => {
    const result = setOpenCodeConfigInAdata({}, { ...baseConfig, steps: 100 });
    const oc = (JSON.parse(result) as Record<string, unknown>).opencode as Record<string, unknown>;
    expect(oc.steps).toBe(100);
  });

  it("writes steps=null when null passed", () => {
    const result = setOpenCodeConfigInAdata({}, { ...baseConfig, steps: null });
    const oc = (JSON.parse(result) as Record<string, unknown>).opencode as Record<string, unknown>;
    expect(oc.steps).toBeNull();
  });

  it("writes color='#aabbcc' under opencode.color", () => {
    const result = setOpenCodeConfigInAdata({}, { ...baseConfig, color: "#aabbcc" });
    const oc = (JSON.parse(result) as Record<string, unknown>).opencode as Record<string, unknown>;
    expect(oc.color).toBe("#aabbcc");
  });

  it("writes color='#fff' (3-char hex) under opencode.color", () => {
    const result = setOpenCodeConfigInAdata({}, { ...baseConfig, color: "#fff" });
    const oc = (JSON.parse(result) as Record<string, unknown>).opencode as Record<string, unknown>;
    expect(oc.color).toBe("#fff");
  });
});
