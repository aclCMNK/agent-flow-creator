/**
 * tests/ui/opencode-config-ui-fields.test.ts
 *
 * Unit tests for the new OpenCode config UI field helpers exported from
 * PropertiesPanel.tsx:
 *   - OPENCODE_HIDDEN_DEFAULT, OPENCODE_HIDDEN_TOOLTIP_TEXT,
 *     OPENCODE_HIDDEN_LABEL_TRUE, OPENCODE_HIDDEN_LABEL_FALSE
 *   - OPENCODE_STEPS_DEFAULT, OPENCODE_STEPS_MIN, OPENCODE_STEPS_MAX
 *   - isValidSteps
 *   - OPENCODE_COLOR_DEFAULT, OPENCODE_COLOR_HEX_REGEX
 *   - isValidColor
 */

import { describe, it, expect } from "bun:test";
import {
  OPENCODE_HIDDEN_DEFAULT,
  OPENCODE_HIDDEN_TOOLTIP_TEXT,
  OPENCODE_HIDDEN_LABEL_TRUE,
  OPENCODE_HIDDEN_LABEL_FALSE,
  OPENCODE_STEPS_DEFAULT,
  OPENCODE_STEPS_MIN,
  OPENCODE_STEPS_MAX,
  isValidSteps,
  OPENCODE_COLOR_DEFAULT,
  OPENCODE_COLOR_HEX_REGEX,
  isValidColor,
} from "../../src/ui/components/PropertiesPanel.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Hidden constants
// ─────────────────────────────────────────────────────────────────────────────

describe("OPENCODE_HIDDEN_DEFAULT", () => {
  it("is false", () => {
    expect(OPENCODE_HIDDEN_DEFAULT).toBe(false);
  });
});

describe("OPENCODE_HIDDEN_TOOLTIP_TEXT", () => {
  it("is a non-empty string", () => {
    expect(typeof OPENCODE_HIDDEN_TOOLTIP_TEXT).toBe("string");
    expect(OPENCODE_HIDDEN_TOOLTIP_TEXT.length).toBeGreaterThan(0);
  });

  it("mentions 'autocomplete' or 'menu' context", () => {
    expect(
      OPENCODE_HIDDEN_TOOLTIP_TEXT.toLowerCase().includes("autocomplete") ||
        OPENCODE_HIDDEN_TOOLTIP_TEXT.toLowerCase().includes("menu")
    ).toBe(true);
  });
});

describe("OPENCODE_HIDDEN_LABEL_TRUE", () => {
  it("is a non-empty string", () => {
    expect(typeof OPENCODE_HIDDEN_LABEL_TRUE).toBe("string");
    expect(OPENCODE_HIDDEN_LABEL_TRUE.length).toBeGreaterThan(0);
  });
});

describe("OPENCODE_HIDDEN_LABEL_FALSE", () => {
  it("is a non-empty string", () => {
    expect(typeof OPENCODE_HIDDEN_LABEL_FALSE).toBe("string");
    expect(OPENCODE_HIDDEN_LABEL_FALSE.length).toBeGreaterThan(0);
  });

  it("is different from OPENCODE_HIDDEN_LABEL_TRUE", () => {
    expect(OPENCODE_HIDDEN_LABEL_FALSE).not.toBe(OPENCODE_HIDDEN_LABEL_TRUE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Steps constants
// ─────────────────────────────────────────────────────────────────────────────

describe("OPENCODE_STEPS_DEFAULT", () => {
  it("is 7", () => {
    expect(OPENCODE_STEPS_DEFAULT).toBe(7);
  });

  it("is within [STEPS_MIN, STEPS_MAX]", () => {
    expect(OPENCODE_STEPS_DEFAULT).toBeGreaterThanOrEqual(OPENCODE_STEPS_MIN);
    expect(OPENCODE_STEPS_DEFAULT).toBeLessThanOrEqual(OPENCODE_STEPS_MAX);
  });
});

describe("OPENCODE_STEPS_MIN and OPENCODE_STEPS_MAX", () => {
  it("STEPS_MIN is 7", () => {
    expect(OPENCODE_STEPS_MIN).toBe(7);
  });

  it("STEPS_MAX is 100", () => {
    expect(OPENCODE_STEPS_MAX).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidSteps (UI version — same logic as electron handler)
// ─────────────────────────────────────────────────────────────────────────────

describe("isValidSteps — valid inputs", () => {
  it("accepts null (optional)", () => {
    expect(isValidSteps(null)).toBe(true);
  });

  it("accepts the minimum boundary 7", () => {
    expect(isValidSteps(7)).toBe(true);
  });

  it("accepts the maximum boundary 100", () => {
    expect(isValidSteps(100)).toBe(true);
  });

  it("accepts a mid-range integer 50", () => {
    expect(isValidSteps(50)).toBe(true);
  });
});

describe("isValidSteps — invalid inputs", () => {
  it("rejects 6 (below min)", () => {
    expect(isValidSteps(6)).toBe(false);
  });

  it("rejects 101 (above max)", () => {
    expect(isValidSteps(101)).toBe(false);
  });

  it("rejects 7.5 (non-integer)", () => {
    expect(isValidSteps(7.5)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isValidSteps(NaN)).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(isValidSteps(Infinity)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Color constants
// ─────────────────────────────────────────────────────────────────────────────

describe("OPENCODE_COLOR_DEFAULT", () => {
  it("is '#ffffff'", () => {
    expect(OPENCODE_COLOR_DEFAULT).toBe("#ffffff");
  });

  it("passes the hex regex", () => {
    expect(OPENCODE_COLOR_HEX_REGEX.test(OPENCODE_COLOR_DEFAULT)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidColor (UI version)
// ─────────────────────────────────────────────────────────────────────────────

describe("isValidColor — valid inputs", () => {
  it("accepts '#ffffff'", () => {
    expect(isValidColor("#ffffff")).toBe(true);
  });

  it("accepts '#000000'", () => {
    expect(isValidColor("#000000")).toBe(true);
  });

  it("accepts '#ABC'", () => {
    expect(isValidColor("#ABC")).toBe(true);
  });

  it("accepts '#aAbBcC'", () => {
    expect(isValidColor("#aAbBcC")).toBe(true);
  });

  it("accepts '#fff'", () => {
    expect(isValidColor("#fff")).toBe(true);
  });
});

describe("isValidColor — invalid inputs", () => {
  it("rejects empty string", () => {
    expect(isValidColor("")).toBe(false);
  });

  it("rejects hex without # prefix", () => {
    expect(isValidColor("ffffff")).toBe(false);
  });

  it("rejects too-long hex '#fffffff'", () => {
    expect(isValidColor("#fffffff")).toBe(false);
  });

  it("rejects plain text 'red'", () => {
    expect(isValidColor("red")).toBe(false);
  });

  it("rejects non-hex chars '#gggggg'", () => {
    expect(isValidColor("#gggggg")).toBe(false);
  });
});
