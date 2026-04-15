/**
 * tests/electron/select-export-dir-handler.test.ts
 *
 * Unit tests for the SELECT_EXPORT_DIR handler logic.
 *
 * These tests verify the pure result-processing logic extracted from the
 * SELECT_EXPORT_DIR handler in ipc-handlers.ts.
 *
 * Covered scenarios:
 *   - Returns { dirPath: null } when dialog is cancelled
 *   - Returns { dirPath: null } when filePaths is empty
 *   - Returns { dirPath: string } when a directory is selected
 *   - Window resolution: handler uses BrowserWindow.fromWebContents (not getFocusedWindow)
 */

import { describe, it, expect } from "bun:test";

// ── Pure logic extracted from the SELECT_EXPORT_DIR handler ──────────────────
//
// The handler in ipc-handlers.ts does:
//
//   const win = BrowserWindow.fromWebContents(event.sender);
//   const result = win
//     ? await dialog.showOpenDialog(win, opts)
//     : await dialog.showOpenDialog(opts);
//   const dirPath = result.canceled || result.filePaths.length === 0
//     ? null
//     : result.filePaths[0]!;
//   return { dirPath };
//
// We test the pure result-processing step here.

/** Mirrors the Electron OpenDialogReturnValue shape relevant to our handler */
interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

/** Pure result processor — mirrors exactly what the handler does */
function resolveExportDir(result: DialogResult): { dirPath: string | null } {
  const dirPath = result.canceled || result.filePaths.length === 0
    ? null
    : result.filePaths[0]!;
  return { dirPath };
}

// ── resolveExportDir — cancelled dialog ───────────────────────────────────────

describe("SELECT_EXPORT_DIR handler logic — cancelled dialog", () => {
  it("returns dirPath: null when canceled is true with filePaths", () => {
    const result = resolveExportDir({ canceled: true, filePaths: ["/some/dir"] });
    expect(result.dirPath).toBeNull();
  });

  it("returns dirPath: null when canceled is true and filePaths is empty", () => {
    const result = resolveExportDir({ canceled: true, filePaths: [] });
    expect(result.dirPath).toBeNull();
  });
});

// ── resolveExportDir — no paths selected ─────────────────────────────────────

describe("SELECT_EXPORT_DIR handler logic — empty filePaths", () => {
  it("returns dirPath: null when canceled is false but filePaths is empty", () => {
    const result = resolveExportDir({ canceled: false, filePaths: [] });
    expect(result.dirPath).toBeNull();
  });
});

// ── resolveExportDir — directory selected ────────────────────────────────────

describe("SELECT_EXPORT_DIR handler logic — directory selected", () => {
  it("returns the selected directory path", () => {
    const result = resolveExportDir({
      canceled: false,
      filePaths: ["/home/user/exports"],
    });
    expect(result.dirPath).toBe("/home/user/exports");
  });

  it("returns the first path when multiple are returned", () => {
    const result = resolveExportDir({
      canceled: false,
      filePaths: ["/first/dir", "/second/dir"],
    });
    expect(result.dirPath).toBe("/first/dir");
  });

  it("returns an absolute path unchanged", () => {
    const path = "/Users/kamiloid/projects/export-dest";
    const result = resolveExportDir({ canceled: false, filePaths: [path] });
    expect(result.dirPath).toBe(path);
  });

  it("returns a path with spaces", () => {
    const path = "/Users/kamiloid/my projects/export dest";
    const result = resolveExportDir({ canceled: false, filePaths: [path] });
    expect(result.dirPath).toBe(path);
  });
});

// ── Return shape ──────────────────────────────────────────────────────────────

describe("SELECT_EXPORT_DIR handler logic — return shape", () => {
  it("always returns an object with a dirPath key", () => {
    const selected = resolveExportDir({ canceled: false, filePaths: ["/foo"] });
    expect(Object.keys(selected)).toContain("dirPath");
  });

  it("result is serializable (no undefined — null is used for cancellation)", () => {
    const cancelled = resolveExportDir({ canceled: true, filePaths: [] });
    // JSON.stringify converts undefined to nothing; null is explicit
    const json = JSON.parse(JSON.stringify(cancelled));
    expect(json.dirPath).toBeNull();
  });
});

// ── Window resolution audit ───────────────────────────────────────────────────
//
// The critical fix: SELECT_EXPORT_DIR must use BrowserWindow.fromWebContents(event.sender)
// instead of BrowserWindow.getFocusedWindow().
//
// We verify this at the source level by reading the handler implementation.
// This is a static analysis assertion — it guards against regressions.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IPC_HANDLERS_PATH = join(__dirname, "../../src/electron/ipc-handlers.ts");

describe("SELECT_EXPORT_DIR handler — window resolution guard", () => {
  it("uses BrowserWindow.fromWebContents(event.sender) instead of getFocusedWindow()", async () => {
    const source = await readFile(IPC_HANDLERS_PATH, "utf-8");

    // Locate the SELECT_EXPORT_DIR handler block
    const handlerStart = source.indexOf("IPC_CHANNELS.SELECT_EXPORT_DIR");
    expect(handlerStart).toBeGreaterThan(-1);

    // Grab a window of source code after the channel registration (the handler body)
    const handlerBlock = source.slice(handlerStart, handlerStart + 600);

    // Must use fromWebContents
    expect(handlerBlock).toContain("BrowserWindow.fromWebContents(event.sender)");

    // Must NOT use getFocusedWindow() inside the handler body
    // (it may appear in a comment — we check executable code patterns)
    expect(handlerBlock).not.toContain("getFocusedWindow()");
  });

  it("handler signature receives the event parameter (not _event)", async () => {
    const source = await readFile(IPC_HANDLERS_PATH, "utf-8");
    const handlerStart = source.indexOf("IPC_CHANNELS.SELECT_EXPORT_DIR");
    const handlerBlock = source.slice(handlerStart, handlerStart + 300);

    // async (event) — not async (_event)
    expect(handlerBlock).toContain("async (event)");
    expect(handlerBlock).not.toContain("async (_event)");
  });
});
