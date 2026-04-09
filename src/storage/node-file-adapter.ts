/**
 * src/storage/node-file-adapter.ts
 *
 * Node.js (Electron main process) implementation of FileAdapter.
 *
 * This adapter is used exclusively in the Electron main process
 * (src/electron/ipc-handlers.ts) where Node fs APIs are available.
 *
 * In tests, use the in-memory stub defined in the test files instead.
 *
 * Write operations are NOT atomic here (we delegate atomicity to
 * atomicWriteJson from lock-manager when writing full .adata files).
 * The profiles.ts layer calls writeText for profile mutations, which
 * goes through this adapter. For atomic writes, callers should use
 * atomicWriteJson directly. This adapter provides a straightforward
 * fs.writeFile which is sufficient for the profile operations.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { FileAdapter } from "./adata.ts";

/**
 * Singleton Node.js FileAdapter for use in the Electron main process.
 *
 * @example
 * ```ts
 * import { nodeFileAdapter } from "../storage/node-file-adapter.ts";
 * const profiles = await listProfiles(nodeFileAdapter, projectDir, agentId);
 * ```
 */
export const nodeFileAdapter: FileAdapter = {
  async readText(path: string): Promise<string> {
    return readFile(path, "utf-8");
  },

  async writeText(path: string, content: string): Promise<void> {
    // Ensure parent directory exists before writing
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
  },

  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  },
};
