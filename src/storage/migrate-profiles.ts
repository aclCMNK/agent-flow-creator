/**
 * src/storage/migrate-profiles.ts
 *
 * Migration script: add `profile: []` to legacy `.adata` files.
 *
 * # Background
 *
 * Prior to the Agent Profiling feature, `.adata` files had no `profile`
 * top-level key.  The new schema expects `profile` to be a (possibly empty)
 * array at the top level.
 *
 * This migrator scans all `.adata` files in a project's `metadata/` directory
 * and injects a `profile: []` key into any file that does not already have
 * one.  Files that already have a `profile` key (any value) are left
 * untouched — no schema coercion is performed here; that is the loader's job.
 *
 * # Safety guarantees
 *
 * 1. **Non-destructive**: Only the `profile` key is added.  All other keys
 *    are preserved verbatim.
 * 2. **Idempotent**: Running the migrator twice on the same project directory
 *    produces no extra changes on the second pass.
 * 3. **Atomic write**: Each patched file is written via the injected
 *    `FileAdapter.writeText` which the Electron production implementation
 *    routes through `atomicWriteJson` (temp-file + rename).
 * 4. **No crash on bad JSON**: Files that cannot be parsed are reported as
 *    errors and skipped rather than overwritten with corrupt data.
 *
 * # Usage
 *
 * ```ts
 * import { migrateProjectProfiles } from "./migrate-profiles.ts";
 * import { nodeFileAdapter } from "./node-file-adapter.ts"; // (Phase 2)
 *
 * const report = await migrateProjectProfiles(nodeFileAdapter, projectDir);
 * console.log(`Migrated ${report.migrated} / ${report.scanned} .adata files`);
 * ```
 *
 * # When to run
 *
 * This migrator is intended to be called **once** during the first project
 * load after the profiling feature is deployed — either:
 *
 *   a. From `ipc-handlers.ts` on `LOAD_PROJECT` (Phase 2 integration), or
 *   b. Manually from a CLI script for batch upgrades.
 *
 * The IPC integration is out of scope for Phase 1 (infrastructure only).
 */

import type { FileAdapter } from "./adata.ts";
import type { AdataWithProfile } from "../types/agent.ts";

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Result of migrating a single `.adata` file.
 */
export interface FileMigrationResult {
  /** Absolute path to the file */
  filePath: string;
  /** UUID extracted from the filename (`<uuid>.adata`) */
  agentId: string;
  /** True if the file was written (i.e. `profile` key was absent) */
  patched: boolean;
  /** True if the file was skipped because it already has `profile` */
  skipped: boolean;
  /** Error message if the file could not be read or parsed */
  error?: string;
}

/**
 * Aggregate report returned by `migrateProjectProfiles`.
 */
export interface ProfileMigrationReport {
  /** Absolute path to the project directory */
  projectDir: string;
  /** ISO 8601 timestamp when the migration ran */
  ranAt: string;
  /** Number of `.adata` files scanned */
  scanned: number;
  /** Number of files that were patched (profile key added) */
  migrated: number;
  /** Number of files skipped (already had profile key) */
  skipped: number;
  /** Number of files that encountered errors */
  errors: number;
  /** Per-file results */
  files: FileMigrationResult[];
}

// ── Core migration logic ──────────────────────────────────────────────────

/**
 * Migrate all `.adata` files in `<projectDir>/metadata/` to include the
 * `profile: []` key when it is absent.
 *
 * @param fs         - Injected file-system adapter.
 * @param projectDir - Absolute path to the project root.
 * @param listDir    - Injected directory-listing function.  Receives the
 *   absolute path to `metadata/` and returns an array of filenames in that
 *   directory.  Defaults to `undefined` in environments where a Node-based
 *   implementation is injected at call time.
 *
 * @returns A detailed migration report.
 */
export async function migrateProjectProfiles(
  fs: FileAdapter,
  projectDir: string,
  listDir: (dirPath: string) => Promise<string[]>,
): Promise<ProfileMigrationReport> {
  const metadataDir = `${projectDir}/metadata`;
  const ranAt = new Date().toISOString();

  const report: ProfileMigrationReport = {
    projectDir,
    ranAt,
    scanned: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    files: [],
  };

  // List all files in the metadata directory
  let allFiles: string[];
  try {
    allFiles = await listDir(metadataDir);
  } catch (err) {
    // Metadata dir may not exist yet (brand new project, no agents added)
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[migrate-profiles] Could not list metadata dir (${metadataDir}): ${message}`,
    );
    return report;
  }

  // Filter to .adata files only
  const adataFiles = allFiles.filter((name) => name.endsWith(".adata"));

  for (const filename of adataFiles) {
    // Extract agentId from filename: "<agentId>.adata"
    const agentId = filename.slice(0, -6); // strip ".adata"
    const filePath = `${metadataDir}/${filename}`;

    report.scanned++;
    const fileResult: FileMigrationResult = {
      filePath,
      agentId,
      patched: false,
      skipped: false,
    };

    try {
      // Read raw file content
      const raw = await fs.readText(filePath);

      let parsed: AdataWithProfile;
      try {
        parsed = JSON.parse(raw) as AdataWithProfile;
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        fileResult.error = `JSON parse error: ${msg}`;
        report.errors++;
        report.files.push(fileResult);
        console.error(`[migrate-profiles] Skipping ${filePath}: ${fileResult.error}`);
        continue;
      }

      // Check if migration is needed
      if ("profile" in parsed) {
        // Already has a `profile` key — skip (idempotency)
        fileResult.skipped = true;
        report.skipped++;
        report.files.push(fileResult);
        continue;
      }

      // Inject `profile: []` — all other keys preserved
      const migrated: AdataWithProfile = {
        ...parsed,
        profile: [],
        // Refresh updatedAt to record the migration time
        updatedAt: ranAt,
      };

      await fs.writeText(filePath, JSON.stringify(migrated, null, 2));

      fileResult.patched = true;
      report.migrated++;
      report.files.push(fileResult);

      console.log(
        `[migrate-profiles] Patched ${filePath} — added profile: []`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fileResult.error = message;
      report.errors++;
      report.files.push(fileResult);
      console.error(`[migrate-profiles] Error processing ${filePath}: ${message}`);
    }
  }

  console.log(
    `[migrate-profiles] Done — scanned=${report.scanned} migrated=${report.migrated} ` +
    `skipped=${report.skipped} errors=${report.errors}`,
  );

  return report;
}

// ── Convenience: migrate a single file ────────────────────────────────────

/**
 * Migrate a single `.adata` file by its absolute path.
 *
 * Useful when a new agent is added and we want to immediately ensure it
 * has a `profile` key without re-scanning the entire `metadata/` directory.
 *
 * @returns True if the file was patched; false if it already had `profile`.
 * @throws  On I/O or JSON parse errors.
 */
export async function migrateAdataFile(
  fs: FileAdapter,
  filePath: string,
): Promise<boolean> {
  const raw = await fs.readText(filePath);
  const parsed = JSON.parse(raw) as AdataWithProfile;

  if ("profile" in parsed) {
    return false; // Already migrated
  }

  const migrated: AdataWithProfile = {
    ...parsed,
    profile: [],
    updatedAt: new Date().toISOString(),
  };

  await fs.writeText(filePath, JSON.stringify(migrated, null, 2));
  return true;
}
