/**
 * src/electron/opencode-config-handlers.ts
 *
 * Pure functions for reading and writing the OpenCode config (including
 * temperature, hidden, steps, and color) from/to a raw .adata object.
 *
 * These functions are extracted from ipc-handlers.ts to be testable without
 * Electron IPC. The handlers in ipc-handlers.ts call these functions.
 *
 * Config contract:
 *   - temperature: float (0.0..1.0) under .adata.opencode.temperature, default 0.05
 *   - hidden:      boolean under .adata.opencode.hidden, default false
 *   - steps:       integer [7..100] or null under .adata.opencode.steps, default 7
 *   - color:       hex string under .adata.opencode.color, default "#ffffff"
 */

import { atomicWriteJson } from "../loader/lock-manager.ts";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

/** Default temperature (float) stored when not explicitly set: 5% */
export const OPENCODE_CONFIG_TEMPERATURE_DEFAULT = 0.05;

/** Default hidden value: false */
export const OPENCODE_CONFIG_HIDDEN_DEFAULT = false;

/** Default steps value */
export const OPENCODE_CONFIG_STEPS_DEFAULT = 7;

/** Minimum steps value */
export const OPENCODE_CONFIG_STEPS_MIN = 7;

/** Maximum steps value */
export const OPENCODE_CONFIG_STEPS_MAX = 100;

/** Default color value (hex) */
export const OPENCODE_CONFIG_COLOR_DEFAULT = "#ffffff";

/** Regex for valid hex color strings: #RRGGBB or #RGB */
export const OPENCODE_CONFIG_COLOR_HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Returns true if the steps value is a valid integer in [STEPS_MIN, STEPS_MAX]
 * or null (meaning unset/optional).
 */
export function isValidSteps(value: number | null): boolean {
  if (value === null) return true;
  return (
    typeof value === "number" &&
    isFinite(value) &&
    Number.isInteger(value) &&
    value >= OPENCODE_CONFIG_STEPS_MIN &&
    value <= OPENCODE_CONFIG_STEPS_MAX
  );
}

/**
 * Returns true if the color is a valid hex color string (#RGB or #RRGGBB).
 */
export function isValidColor(value: string): boolean {
  return typeof value === "string" && OPENCODE_CONFIG_COLOR_HEX_REGEX.test(value);
}

/**
 * Reads the OpenCode config (provider, model, temperature, hidden, steps, color)
 * from a raw .adata object.
 *
 * @param adata - Raw .adata object (plain Record)
 * @returns OpenCode config with all fields, or null if opencode key is absent
 */
export function getOpenCodeConfigFromAdata(
  adata: Record<string, unknown>,
): { provider: string; model: string; temperature: number; hidden: boolean; steps: number | null; color: string } | null {
  const opencode = adata.opencode;
  if (!opencode || typeof opencode !== "object") {
    return null;
  }
  const oc = opencode as Record<string, unknown>;
  const provider = typeof oc.provider === "string" ? oc.provider : "";
  const model = typeof oc.model === "string" ? oc.model : "";

  // temperature is always stored as float; default to 0.05 when missing
  const rawTemp = oc.temperature;
  const temperature =
    typeof rawTemp === "number" && isFinite(rawTemp)
      ? rawTemp
      : OPENCODE_CONFIG_TEMPERATURE_DEFAULT;

  // hidden defaults to false when missing
  const hidden = typeof oc.hidden === "boolean" ? oc.hidden : OPENCODE_CONFIG_HIDDEN_DEFAULT;

  // steps defaults to 7 when missing; null means unset
  const rawSteps = oc.steps;
  let steps: number | null;
  if (rawSteps === null || rawSteps === undefined) {
    steps = OPENCODE_CONFIG_STEPS_DEFAULT;
  } else if (typeof rawSteps === "number" && isFinite(rawSteps)) {
    steps = rawSteps;
  } else {
    steps = OPENCODE_CONFIG_STEPS_DEFAULT;
  }

  // color defaults to "#ffffff" when missing or invalid
  const rawColor = oc.color;
  const color =
    typeof rawColor === "string" && isValidColor(rawColor)
      ? rawColor
      : OPENCODE_CONFIG_COLOR_DEFAULT;

  return { provider, model, temperature, hidden, steps, color };
}

/**
 * Merges an OpenCode config (provider, model, temperature, hidden, steps, color)
 * into an existing .adata object and returns the updated JSON string (pretty-printed).
 *
 * Does NOT write to disk — the caller is responsible for persistence.
 *
 * @param existing - Existing raw .adata object
 * @param config   - OpenCode config to write
 * @returns JSON string of the updated .adata object
 */
export function setOpenCodeConfigInAdata(
  existing: Record<string, unknown>,
  config: { provider: string; model: string; temperature: number; hidden: boolean; steps: number | null; color: string },
): string {
  const updated: Record<string, unknown> = {
    ...existing,
    opencode: {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      hidden: config.hidden,
      steps: config.steps,
      color: config.color,
    },
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(updated, null, 2);
}

/**
 * Reads the OpenCode config from disk (metadata/<agentId>.adata).
 * Returns null if the file does not exist or has no opencode config.
 */
export async function readOpenCodeConfigFromDisk(
  projectDir: string,
  agentId: string,
): Promise<{ provider: string; model: string; temperature: number; hidden: boolean; steps: number | null; color: string } | null> {
  const adataPath = join(projectDir, "metadata", `${agentId}.adata`);
  let raw: string;
  try {
    raw = await readFile(adataPath, "utf-8");
  } catch {
    return null;
  }
  const adata = JSON.parse(raw) as Record<string, unknown>;
  return getOpenCodeConfigFromAdata(adata);
}

/**
 * Writes the OpenCode config to disk (metadata/<agentId>.adata).
 * Preserves all existing .adata fields.
 */
export async function writeOpenCodeConfigToDisk(
  projectDir: string,
  agentId: string,
  config: { provider: string; model: string; temperature: number; hidden: boolean; steps: number | null; color: string },
): Promise<void> {
  const adataPath = join(projectDir, "metadata", `${agentId}.adata`);
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(adataPath, "utf-8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Agent .adata file not found: ${adataPath}`);
  }
  const json = setOpenCodeConfigInAdata(existing, config);
  await atomicWriteJson(adataPath, JSON.parse(json) as Record<string, unknown>);
}
