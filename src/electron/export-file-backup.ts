/**
 * src/electron/export-file-backup.ts
 *
 * Pure backup utility for the OpenCode config export flow.
 *
 * # Responsibility
 *
 *   Before writing (or overwriting) an `opencode.json` / `opencode.jsonc`
 *   file in the export destination, this module creates a timestamped backup
 *   copy inside an `opencode_backups/` subdirectory at the same level as the
 *   target file.
 *
 * # Backup naming convention
 *
 *   Source:  <destDir>/opencode.json
 *   Backup:  <destDir>/opencode_backups/opencode_DDMMYYYYHHMMSS.json
 *
 * # Rules
 *
 *   - If the target file does NOT already exist → no backup is created.
 *   - If the target file EXISTS → backup is ALWAYS created before any write.
 *   - `opencode_backups/` directory is created if it does not yet exist.
 *   - The caller is responsible for the actual write after backup succeeds.
 *
 * # Extracted for testability
 *
 *   Like profile-export-handlers.ts, this module has zero Electron IPC
 *   dependency so it can be unit-tested with plain Node.js fs operations.
 */

import { join } from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

// ── Constants ──────────────────────────────────────────────────────────────

/** The name of the backup subdirectory created inside the export destination */
export const BACKUP_DIR_NAME = "opencode_backups";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BackupResult {
  /** Whether a backup file was created */
  backedUp: boolean;
  /** Absolute path of the backup file (set when backedUp === true) */
  backupPath?: string;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Formats a Date as "DDMMYYYYHHMMSS" (no separators).
 *
 * Example: 2026-04-15T23:08:44Z → "15042026230844"
 */
export function formatTimestamp(date: Date): string {
  const dd   = String(date.getDate()).padStart(2, "0");
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh   = String(date.getHours()).padStart(2, "0");
  const min  = String(date.getMinutes()).padStart(2, "0");
  const sec  = String(date.getSeconds()).padStart(2, "0");
  return `${dd}${mm}${yyyy}${hh}${min}${sec}`;
}

/**
 * Builds the backup filename for a given source filename and timestamp.
 *
 * @param fileName  - Source file name, e.g. "opencode.json" or "opencode.jsonc"
 * @param timestamp - Pre-formatted timestamp string, e.g. "15042026230844"
 * @returns Backup filename, e.g. "opencode_15042026230844.json"
 */
export function buildBackupFileName(fileName: string, timestamp: string): string {
  const ext = fileName.endsWith(".jsonc") ? "jsonc" : "json";
  return `opencode_${timestamp}.${ext}`;
}

/**
 * Creates a timestamped backup of the target file, if it exists.
 *
 * If the file at `join(destDir, fileName)` does not exist, returns
 * `{ backedUp: false }` immediately.
 *
 * If it exists:
 *   1. Ensures `<destDir>/opencode_backups/` exists (creates it if needed).
 *   2. Copies the file to `<destDir>/opencode_backups/opencode_<timestamp>.ext`.
 *   3. Returns `{ backedUp: true, backupPath }`.
 *
 * @param destDir  - Absolute path to the export destination directory
 * @param fileName - Name of the config file (e.g. "opencode.json")
 * @param now      - Optional Date for timestamp (defaults to current time)
 */
export async function backupExportFileIfExists(
  destDir: string,
  fileName: string,
  now?: Date,
): Promise<BackupResult> {
  const fullPath = join(destDir, fileName);

  if (!existsSync(fullPath)) {
    return { backedUp: false };
  }

  const timestamp  = formatTimestamp(now ?? new Date());
  const backupName = buildBackupFileName(fileName, timestamp);
  const backupDir  = join(destDir, BACKUP_DIR_NAME);

  await mkdir(backupDir, { recursive: true });

  const backupPath = join(backupDir, backupName);
  await copyFile(fullPath, backupPath);

  return { backedUp: true, backupPath };
}
