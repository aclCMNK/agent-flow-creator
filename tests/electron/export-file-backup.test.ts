/**
 * tests/electron/export-file-backup.test.ts
 *
 * Unit tests for the export file backup utility.
 *   - formatTimestamp
 *   - buildBackupFileName
 *   - backupExportFileIfExists
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  formatTimestamp,
  buildBackupFileName,
  backupExportFileIfExists,
  BACKUP_DIR_NAME,
} from "../../src/electron/export-file-backup.ts";

// ── formatTimestamp ────────────────────────────────────────────────────────

describe("formatTimestamp", () => {
  it("formats a date as DDMMYYYYHHMMSS (14 chars)", () => {
    const d = new Date(2026, 3, 15, 23, 8, 44); // April = month 3 (0-indexed)
    expect(formatTimestamp(d)).toBe("15042026230844");
  });

  it("pads single-digit day and month", () => {
    const d = new Date(2026, 0, 5, 9, 3, 7); // Jan 5, 09:03:07
    expect(formatTimestamp(d)).toBe("05012026090307");
  });

  it("returns a 14-character string", () => {
    const d = new Date(2026, 11, 31, 23, 59, 59);
    expect(formatTimestamp(d).length).toBe(14);
  });

  it("year is 4 digits", () => {
    const d = new Date(2030, 0, 1, 0, 0, 0);
    const ts = formatTimestamp(d);
    // format: DDMMYYYY... → year at chars 4-8
    expect(ts.slice(4, 8)).toBe("2030");
  });
});

// ── buildBackupFileName ────────────────────────────────────────────────────

describe("buildBackupFileName", () => {
  it("generates 'opencode_<timestamp>.json' for .json source", () => {
    expect(buildBackupFileName("opencode.json", "15042026230844")).toBe(
      "opencode_15042026230844.json",
    );
  });

  it("generates 'opencode_<timestamp>.jsonc' for .jsonc source", () => {
    expect(buildBackupFileName("opencode.jsonc", "15042026230844")).toBe(
      "opencode_15042026230844.jsonc",
    );
  });

  it("always starts with 'opencode_'", () => {
    const name = buildBackupFileName("opencode.json", "00000000000000");
    expect(name.startsWith("opencode_")).toBe(true);
  });

  it("defaults to .json extension for unknown extension", () => {
    // Any file that doesn't end in .jsonc → .json
    const name = buildBackupFileName("opencode.txt", "12345678901234");
    expect(name.endsWith(".json")).toBe(true);
  });
});

// ── backupExportFileIfExists ───────────────────────────────────────────────

// We use a temporary directory for each test so tests don't interfere.

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `agentsflow-backup-test-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("backupExportFileIfExists — no existing file", () => {
  it("returns backedUp=false when target file does not exist", async () => {
    const result = await backupExportFileIfExists(tempDir, "opencode.json");
    expect(result.backedUp).toBe(false);
    expect(result.backupPath).toBeUndefined();
  });

  it("does NOT create opencode_backups/ when target is absent", async () => {
    await backupExportFileIfExists(tempDir, "opencode.json");
    expect(existsSync(join(tempDir, BACKUP_DIR_NAME))).toBe(false);
  });
});

describe("backupExportFileIfExists — existing file", () => {
  it("returns backedUp=true when target file exists", async () => {
    await writeFile(join(tempDir, "opencode.json"), '{"test":1}', "utf-8");
    const result = await backupExportFileIfExists(tempDir, "opencode.json");
    expect(result.backedUp).toBe(true);
  });

  it("returns a backupPath when backed up", async () => {
    await writeFile(join(tempDir, "opencode.json"), '{"test":1}', "utf-8");
    const result = await backupExportFileIfExists(tempDir, "opencode.json");
    expect(result.backupPath).toBeTruthy();
  });

  it("backup file actually exists on disk", async () => {
    const content = '{"backed":"up"}';
    await writeFile(join(tempDir, "opencode.json"), content, "utf-8");

    const result = await backupExportFileIfExists(tempDir, "opencode.json");
    expect(existsSync(result.backupPath!)).toBe(true);
  });

  it("backup file has the correct content (copy of original)", async () => {
    const original = '{"original":"content"}';
    await writeFile(join(tempDir, "opencode.json"), original, "utf-8");

    const result   = await backupExportFileIfExists(tempDir, "opencode.json");
    const { readFile } = await import("node:fs/promises");
    const backed   = await readFile(result.backupPath!, "utf-8");
    expect(backed).toBe(original);
  });

  it("creates opencode_backups/ directory when it does not exist", async () => {
    await writeFile(join(tempDir, "opencode.json"), "{}", "utf-8");
    await backupExportFileIfExists(tempDir, "opencode.json");
    expect(existsSync(join(tempDir, BACKUP_DIR_NAME))).toBe(true);
  });

  it("backup filename matches opencode_<timestamp>.json pattern", async () => {
    await writeFile(join(tempDir, "opencode.json"), "{}", "utf-8");
    const fixedDate = new Date(2026, 3, 15, 23, 8, 44);
    const result    = await backupExportFileIfExists(tempDir, "opencode.json", fixedDate);

    const backupName = result.backupPath!.split("/").pop()!;
    expect(backupName).toBe("opencode_15042026230844.json");
  });

  it("backup filename ends with .jsonc for opencode.jsonc source", async () => {
    await writeFile(join(tempDir, "opencode.jsonc"), "{}", "utf-8");
    const fixedDate = new Date(2026, 3, 15, 23, 8, 44);
    const result    = await backupExportFileIfExists(tempDir, "opencode.jsonc", fixedDate);

    const backupName = result.backupPath!.split("/").pop()!;
    expect(backupName).toBe("opencode_15042026230844.jsonc");
  });
});

describe("backupExportFileIfExists — multiple backups", () => {
  it("creates separate backup files on repeated calls with different timestamps", async () => {
    await writeFile(join(tempDir, "opencode.json"), "{}", "utf-8");

    const d1 = new Date(2026, 3, 15, 10, 0, 0);
    const d2 = new Date(2026, 3, 15, 10, 0, 1); // 1 second later

    const r1 = await backupExportFileIfExists(tempDir, "opencode.json", d1);
    const r2 = await backupExportFileIfExists(tempDir, "opencode.json", d2);

    expect(r1.backupPath).not.toBe(r2.backupPath);

    const files = await readdir(join(tempDir, BACKUP_DIR_NAME));
    expect(files.length).toBe(2);
  });
});

describe("backupExportFileIfExists — BACKUP_DIR_NAME constant", () => {
  it("BACKUP_DIR_NAME is 'opencode_backups'", () => {
    expect(BACKUP_DIR_NAME).toBe("opencode_backups");
  });
});
