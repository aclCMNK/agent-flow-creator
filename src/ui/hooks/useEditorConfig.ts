/**
 * src/ui/hooks/useEditorConfig.ts
 *
 * Hook that reads the `properties.editor` section from the loaded .afproj
 * and returns all editor config values with their defaults applied.
 *
 * Schema (in .afproj under `properties.editor`):
 * {
 *   "touchpad_pan": number,  // Speed factor for two-finger touchpad pan (default 1.0)
 *   "touchpad": boolean,     // Whether two-finger touchpad pan is enabled (default true)
 *   "mouse_pan": number      // Speed factor for middle-mouse-button pan (default 1.0)
 * }
 *
 * All fields are optional; missing fields fall back to their defaults.
 * Extra unknown fields are silently ignored.
 */

import { useProjectStore } from "../store/projectStore.ts";

// ── Default values ─────────────────────────────────────────────────────────

export const EDITOR_CONFIG_DEFAULTS = {
  /** Two-finger touchpad pan speed multiplier */
  touchpad_pan: 1.0,
  /** Whether two-finger touchpad pan is enabled */
  touchpad: true,
  /** Middle-mouse-button pan speed multiplier */
  mouse_pan: 1.0,
} as const;

export type EditorConfig = {
  touchpad_pan: number;
  touchpad: boolean;
  mouse_pan: number;
};

// ── Parse helper ───────────────────────────────────────────────────────────

/**
 * Parse an `editor` config object from raw project properties.
 * Returns a fully-populated EditorConfig with defaults for every missing/invalid field.
 *
 * This function is exported so it can be used in tests without React context.
 */
export function parseEditorConfig(raw: unknown): EditorConfig {
  const defaults = EDITOR_CONFIG_DEFAULTS;

  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const r = raw as Record<string, unknown>;

  // touchpad_pan — must be a positive finite number
  const touchpad_pan =
    typeof r.touchpad_pan === "number" && Number.isFinite(r.touchpad_pan) && r.touchpad_pan > 0
      ? r.touchpad_pan
      : defaults.touchpad_pan;

  // touchpad — must be a boolean
  const touchpad =
    typeof r.touchpad === "boolean" ? r.touchpad : defaults.touchpad;

  // mouse_pan — must be a positive finite number
  const mouse_pan =
    typeof r.mouse_pan === "number" && Number.isFinite(r.mouse_pan) && r.mouse_pan > 0
      ? r.mouse_pan
      : defaults.mouse_pan;

  return { touchpad_pan, touchpad, mouse_pan };
}

// ── React hook ─────────────────────────────────────────────────────────────

/**
 * Returns the current editor config for the loaded project.
 * Re-renders when the project properties change.
 */
export function useEditorConfig(): EditorConfig {
  const properties = useProjectStore((s) => s.project?.properties);
  const editorRaw = (properties as Record<string, unknown> | undefined)?.editor;
  return parseEditorConfig(editorRaw);
}
