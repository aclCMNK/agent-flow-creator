/**
 * src/electron/opencode-config-handlers.ts
 *
 * Pure functions for reading and writing the OpenCode config (including
 * temperature) from/to a raw .adata object.
 *
 * These functions are extracted from ipc-handlers.ts to be testable without
 * Electron IPC. The handlers in ipc-handlers.ts call these functions.
 *
 * Temperature contract:
 *   - Stored as float (0.0..1.0) under .adata.opencode.temperature
 *   - Default value: 0.05 (= 5%)
 *   - Always required — never null or undefined in the config
 */

import { atomicWriteJson } from "../loader/lock-manager.ts";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

/** Default temperature (float) stored when not explicitly set: 5% */
export const OPENCODE_CONFIG_TEMPERATURE_DEFAULT = 0.05;

/**
 * Reads the OpenCode config (provider, model, temperature) from a raw
 * .adata object.
 *
 * @param adata - Raw .adata object (plain Record)
 * @returns OpenCode config with temperature, or null if opencode key is absent
 */
export function getOpenCodeConfigFromAdata(
  adata: Record<string, unknown>,
): { provider: string; model: string; temperature: number } | null {
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

  return { provider, model, temperature };
}

/**
 * Merges an OpenCode config (provider, model, temperature) into an existing
 * .adata object and returns the updated JSON string (pretty-printed).
 *
 * Does NOT write to disk — the caller is responsible for persistence.
 *
 * @param existing - Existing raw .adata object
 * @param config   - OpenCode config to write
 * @returns JSON string of the updated .adata object
 */
export function setOpenCodeConfigInAdata(
  existing: Record<string, unknown>,
  config: { provider: string; model: string; temperature: number },
): string {
  const updated: Record<string, unknown> = {
    ...existing,
    opencode: {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
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
): Promise<{ provider: string; model: string; temperature: number } | null> {
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
  config: { provider: string; model: string; temperature: number },
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
