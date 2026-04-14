/**
 * tests/ui/canvas-pan.test.ts
 *
 * Unit tests for the canvas pan configuration feature.
 *
 * Covers:
 *   - parseEditorConfig: defaults when no config
 *   - parseEditorConfig: reads valid values correctly
 *   - parseEditorConfig: falls back to defaults for invalid/missing values
 *   - parseEditorConfig: handles non-object input
 *   - Config combinations: touchpad disabled, custom speeds, no properties
 *   - EDITOR_CONFIG_DEFAULTS: correct default values
 */

import { describe, it, expect } from "bun:test";
import {
  parseEditorConfig,
  EDITOR_CONFIG_DEFAULTS,
  type EditorConfig,
} from "../../src/ui/hooks/useEditorConfig.ts";

// ── EDITOR_CONFIG_DEFAULTS ─────────────────────────────────────────────────

describe("EDITOR_CONFIG_DEFAULTS", () => {
  it("has touchpad_pan = 1.0", () => {
    expect(EDITOR_CONFIG_DEFAULTS.touchpad_pan).toBe(1.0);
  });

  it("has touchpad = true", () => {
    expect(EDITOR_CONFIG_DEFAULTS.touchpad).toBe(true);
  });

  it("has mouse_pan = 1.0", () => {
    expect(EDITOR_CONFIG_DEFAULTS.mouse_pan).toBe(1.0);
  });
});

// ── parseEditorConfig: no config ───────────────────────────────────────────

describe("parseEditorConfig — null / undefined / missing", () => {
  it("returns defaults when input is null", () => {
    const cfg = parseEditorConfig(null);
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("returns defaults when input is undefined", () => {
    const cfg = parseEditorConfig(undefined);
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("returns defaults when input is an empty object", () => {
    const cfg = parseEditorConfig({});
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("returns defaults when input is a string", () => {
    const cfg = parseEditorConfig("editor");
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("returns defaults when input is a number", () => {
    const cfg = parseEditorConfig(42);
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("returns defaults when input is an array", () => {
    const cfg = parseEditorConfig([1, 2, 3]);
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });
});

// ── parseEditorConfig: valid values ────────────────────────────────────────

describe("parseEditorConfig — valid config", () => {
  it("reads touchpad_pan correctly", () => {
    const cfg = parseEditorConfig({ touchpad_pan: 2.5 });
    expect(cfg.touchpad_pan).toBe(2.5);
  });

  it("reads touchpad: false correctly", () => {
    const cfg = parseEditorConfig({ touchpad: false });
    expect(cfg.touchpad).toBe(false);
  });

  it("reads touchpad: true correctly", () => {
    const cfg = parseEditorConfig({ touchpad: true });
    expect(cfg.touchpad).toBe(true);
  });

  it("reads mouse_pan correctly", () => {
    const cfg = parseEditorConfig({ mouse_pan: 0.5 });
    expect(cfg.mouse_pan).toBe(0.5);
  });

  it("reads all three fields together", () => {
    const cfg = parseEditorConfig({
      touchpad_pan: 1.5,
      touchpad: false,
      mouse_pan: 0.8,
    });
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.5,
      touchpad: false,
      mouse_pan: 0.8,
    });
  });

  it("ignores extra unknown fields", () => {
    const cfg = parseEditorConfig({
      touchpad_pan: 2.0,
      touchpad: true,
      mouse_pan: 1.2,
      unknown_field: "should be ignored",
    });
    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 2.0,
      touchpad: true,
      mouse_pan: 1.2,
    });
  });
});

// ── parseEditorConfig: fallback on invalid values ──────────────────────────

describe("parseEditorConfig — invalid / missing individual fields", () => {
  it("falls back touchpad_pan to 1.0 when value is a string", () => {
    const cfg = parseEditorConfig({ touchpad_pan: "fast" });
    expect(cfg.touchpad_pan).toBe(1.0);
  });

  it("falls back touchpad_pan to 1.0 when value is zero", () => {
    // Zero is not a valid speed factor
    const cfg = parseEditorConfig({ touchpad_pan: 0 });
    expect(cfg.touchpad_pan).toBe(1.0);
  });

  it("falls back touchpad_pan to 1.0 when value is negative", () => {
    const cfg = parseEditorConfig({ touchpad_pan: -1 });
    expect(cfg.touchpad_pan).toBe(1.0);
  });

  it("falls back touchpad_pan to 1.0 when value is NaN", () => {
    const cfg = parseEditorConfig({ touchpad_pan: NaN });
    expect(cfg.touchpad_pan).toBe(1.0);
  });

  it("falls back touchpad_pan to 1.0 when value is Infinity", () => {
    const cfg = parseEditorConfig({ touchpad_pan: Infinity });
    expect(cfg.touchpad_pan).toBe(1.0);
  });

  it("falls back touchpad to true when value is a string", () => {
    const cfg = parseEditorConfig({ touchpad: "yes" });
    expect(cfg.touchpad).toBe(true);
  });

  it("falls back touchpad to true when value is a number", () => {
    const cfg = parseEditorConfig({ touchpad: 1 });
    expect(cfg.touchpad).toBe(true);
  });

  it("falls back mouse_pan to 1.0 when value is null", () => {
    const cfg = parseEditorConfig({ mouse_pan: null });
    expect(cfg.mouse_pan).toBe(1.0);
  });

  it("falls back mouse_pan to 1.0 when value is zero", () => {
    const cfg = parseEditorConfig({ mouse_pan: 0 });
    expect(cfg.mouse_pan).toBe(1.0);
  });

  it("falls back mouse_pan to 1.0 when value is negative", () => {
    const cfg = parseEditorConfig({ mouse_pan: -0.5 });
    expect(cfg.mouse_pan).toBe(1.0);
  });

  it("provides all defaults when touchpad_pan and mouse_pan are missing but object is present", () => {
    const cfg = parseEditorConfig({ touchpad: false });
    expect(cfg.touchpad_pan).toBe(1.0);
    expect(cfg.touchpad).toBe(false);
    expect(cfg.mouse_pan).toBe(1.0);
  });
});

// ── Simulated .afproj properties scenarios ────────────────────────────────

describe("parseEditorConfig — simulated .afproj properties scenarios", () => {
  it("project with no properties → all defaults", () => {
    // Simulates: project.properties = {}
    const properties: Record<string, unknown> = {};
    const editorRaw = properties.editor;
    const cfg = parseEditorConfig(editorRaw);

    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("project with no editor key in properties → all defaults", () => {
    // Simulates: project.properties = { canvasView: { ... } }
    const properties: Record<string, unknown> = {
      canvasView: { panX: 0, panY: 0, zoom: 1 },
    };
    const editorRaw = properties.editor;
    const cfg = parseEditorConfig(editorRaw);

    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("project with touchpad: false, default speeds", () => {
    // Simulates: properties.editor = { touchpad: false }
    const properties: Record<string, unknown> = {
      editor: { touchpad: false },
    };
    const cfg = parseEditorConfig(properties.editor);

    expect(cfg.touchpad).toBe(false);
    expect(cfg.touchpad_pan).toBe(1.0);
    expect(cfg.mouse_pan).toBe(1.0);
  });

  it("project with custom touchpad speed, touchpad enabled", () => {
    // Simulates: properties.editor = { touchpad_pan: 1.5, touchpad: true }
    const properties: Record<string, unknown> = {
      editor: { touchpad_pan: 1.5, touchpad: true },
    };
    const cfg = parseEditorConfig(properties.editor);

    expect(cfg.touchpad).toBe(true);
    expect(cfg.touchpad_pan).toBe(1.5);
    expect(cfg.mouse_pan).toBe(1.0);
  });

  it("project with custom mouse_pan speed only", () => {
    // Simulates: properties.editor = { mouse_pan: 0.7 }
    const properties: Record<string, unknown> = {
      editor: { mouse_pan: 0.7 },
    };
    const cfg = parseEditorConfig(properties.editor);

    expect(cfg.touchpad).toBe(true);
    expect(cfg.touchpad_pan).toBe(1.0);
    expect(cfg.mouse_pan).toBe(0.7);
  });

  it("project with full explicit config matching defaults", () => {
    // Simulates: properties.editor = { touchpad_pan: 1.0, touchpad: true, mouse_pan: 1.0 }
    const properties: Record<string, unknown> = {
      editor: { touchpad_pan: 1.0, touchpad: true, mouse_pan: 1.0 },
    };
    const cfg = parseEditorConfig(properties.editor);

    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 1.0,
      touchpad: true,
      mouse_pan: 1.0,
    });
  });

  it("project with touchpad disabled and custom mouse speed", () => {
    // Simulates: properties.editor = { touchpad: false, mouse_pan: 2.0 }
    const properties: Record<string, unknown> = {
      editor: { touchpad: false, mouse_pan: 2.0 },
    };
    const cfg = parseEditorConfig(properties.editor);

    expect(cfg.touchpad).toBe(false);
    expect(cfg.touchpad_pan).toBe(1.0);  // default since not set
    expect(cfg.mouse_pan).toBe(2.0);
  });

  it("project with all three fields configured to non-default values", () => {
    // Simulates fully customized editor section
    const properties: Record<string, unknown> = {
      editor: {
        touchpad_pan: 0.5,
        touchpad: false,
        mouse_pan: 3.0,
      },
    };
    const cfg = parseEditorConfig(properties.editor);

    expect(cfg).toEqual<EditorConfig>({
      touchpad_pan: 0.5,
      touchpad: false,
      mouse_pan: 3.0,
    });
  });

  it("project editor config with invalid types mixed with valid ones", () => {
    // touchpad_pan invalid → default; touchpad valid; mouse_pan valid
    const properties: Record<string, unknown> = {
      editor: {
        touchpad_pan: "slow",  // invalid → 1.0
        touchpad: false,       // valid
        mouse_pan: 1.5,        // valid
      },
    };
    const cfg = parseEditorConfig(properties.editor);

    expect(cfg.touchpad_pan).toBe(1.0);
    expect(cfg.touchpad).toBe(false);
    expect(cfg.mouse_pan).toBe(1.5);
  });
});
