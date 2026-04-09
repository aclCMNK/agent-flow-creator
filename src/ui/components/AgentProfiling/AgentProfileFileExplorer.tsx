/**
 * src/ui/components/AgentProfiling/AgentProfileFileExplorer.tsx
 *
 * Embedded .md file picker for the Agent Profile Modal.
 *
 * Layout (VSCode-like split):
 *   ┌──────────────────┬────────────────────────────┐
 *   │ Dir tree (left)  │  .md file list (right)     │
 *   │                  │                            │
 *   │  📁 behaviors/   │  📄 system-prompt.md       │
 *   │    📁 abc-123/   │  📄 tools.md               │
 *   │    📁 def-456/   │                            │
 *   └──────────────────┴────────────────────────────┘
 *
 * The user expands directories in the left tree.
 * Clicking a folder loads its .md files in the right panel.
 * Clicking a file selects it (calls onSelect with relative path).
 *
 * All IPC calls use the existing asset:* channels (ASSET_LIST_DIRS,
 * ASSET_LIST_DIR_CONTENTS). No new channels are needed.
 *
 * Scoped to behaviors/ directory only — the spec requires zero UI for
 * paths outside behaviors/.
 */

import React, { useState, useEffect, useCallback } from "react";
import type { AssetDirEntry, AssetFileEntry } from "../../../electron/bridge.types.ts";

// ── Types ──────────────────────────────────────────────────────────────────

interface FileExplorerProps {
  /** Absolute path to the project root (used to compute relative paths) */
  projectRoot: string;
  /** Currently selected relative file path (may be empty string) */
  selectedPath: string;
  /** Called when the user confirms a file selection */
  onSelect: (relativePath: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Make a path relative to the project root */
function makeRelative(projectRoot: string, absolutePath: string): string {
  if (absolutePath.startsWith(projectRoot)) {
    const rel = absolutePath.slice(projectRoot.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return absolutePath;
}

// ── DirNode (recursive) ────────────────────────────────────────────────────

interface DirNodeProps {
  entry: AssetDirEntry;
  depth: number;
  selectedDir: string | null;
  onSelectDir: (path: string) => void;
}

function DirNode({ entry, depth, selectedDir, onSelectDir }: DirNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<AssetDirEntry[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const isSelected = selectedDir === entry.path;

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!expanded) {
      // Load children on first expand
      if (children.length === 0) {
        setLoadingChildren(true);
        try {
          const dirs = await window.agentsFlow.assetListDirs(entry.path);
          setChildren(dirs);
        } catch {
          // Silently ignore — empty children is a safe fallback
        } finally {
          setLoadingChildren(false);
        }
      }
    }
    setExpanded((prev) => !prev);
  }

  function handleClick() {
    onSelectDir(entry.path);
  }

  const indent = depth * 16;

  return (
    <li className="prof-explorer__dir-li">
      <div
        className={`prof-explorer__dir-row${isSelected ? " prof-explorer__dir-row--selected" : ""}`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={handleClick}
        role="treeitem"
        aria-expanded={expanded}
        aria-selected={isSelected}
        title={entry.path}
      >
        <button
          className="prof-explorer__dir-toggle"
          onClick={handleToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          <span className={`prof-explorer__arrow${expanded ? " prof-explorer__arrow--open" : ""}`}>
            ›
          </span>
        </button>
        <span className="prof-explorer__dir-icon" aria-hidden="true">
          {expanded ? "📂" : "📁"}
        </span>
        <span className="prof-explorer__dir-name">{entry.name}</span>
      </div>

      {expanded && (
        <ul className="prof-explorer__dir-children" role="group">
          {loadingChildren && (
            <li className="prof-explorer__dir-loading">Loading…</li>
          )}
          {!loadingChildren && children.length === 0 && (
            <li className="prof-explorer__dir-empty-children" style={{ paddingLeft: `${8 + indent + 16}px` }}>
              Empty
            </li>
          )}
          {children.map((child) => (
            <DirNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedDir={selectedDir}
              onSelectDir={onSelectDir}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── AgentProfileFileExplorer ───────────────────────────────────────────────

export function AgentProfileFileExplorer({
  projectRoot,
  selectedPath,
  onSelect,
}: FileExplorerProps) {
  // ── State ─────────────────────────────────────────────────────────────
  const [topDirs, setTopDirs] = useState<AssetDirEntry[]>([]);
  const [topDirsLoading, setTopDirsLoading] = useState(false);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [dirFiles, setDirFiles] = useState<AssetFileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [pendingPath, setPendingPath] = useState<string>(selectedPath);

  // ── Load behaviors/ subdirectories on mount ─────────────────────────
  const behaviourRoot = projectRoot.endsWith("/")
    ? `${projectRoot}behaviors`
    : `${projectRoot}/behaviors`;

  const loadTopDirs = useCallback(async () => {
    setTopDirsLoading(true);
    try {
      const dirs = await window.agentsFlow.assetListDirs(behaviourRoot);
      setTopDirs(dirs);
    } catch {
      // If behaviors/ doesn't exist, show empty state
      setTopDirs([]);
    } finally {
      setTopDirsLoading(false);
    }
  }, [behaviourRoot]);

  useEffect(() => {
    loadTopDirs();
  }, [loadTopDirs]);

  // ── When a dir is selected, load its .md files ──────────────────────
  useEffect(() => {
    if (!selectedDir) {
      setDirFiles([]);
      return;
    }

    setFilesLoading(true);
    window.agentsFlow
      .assetListDirContents(selectedDir)
      .then((contents) => {
        setDirFiles(contents.files);
      })
      .catch(() => {
        setDirFiles([]);
      })
      .finally(() => {
        setFilesLoading(false);
      });
  }, [selectedDir]);

  // ── Sync pendingPath with external selectedPath prop ────────────────
  useEffect(() => {
    setPendingPath(selectedPath);
  }, [selectedPath]);

  // ── Handlers ──────────────────────────────────────────────────────────
  function handleDirSelect(absolutePath: string) {
    setSelectedDir(absolutePath);
  }

  function handleFileClick(file: AssetFileEntry) {
    const rel = makeRelative(projectRoot, file.path);
    setPendingPath(rel);
  }

  function handleConfirmSelect() {
    if (pendingPath) {
      onSelect(pendingPath);
    }
  }

  const pendingFileName = pendingPath
    ? pendingPath.split("/").pop() ?? pendingPath
    : "";

  return (
    <div className="prof-explorer">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="prof-explorer__header">
        <span className="prof-explorer__header-title">Select document</span>
      </div>

      {/* ── Two-pane layout ───────────────────────────────────────────── */}
      <div className="prof-explorer__panes">
        {/* ── Left: directory tree ──────────────────────────────────── */}
        <div className="prof-explorer__tree-pane">
          <div className="prof-explorer__pane-label">Project folders</div>
          <ul className="prof-explorer__tree-list" role="tree" aria-label="Project folders">
            {/* behaviors/ root row */}
            <li className="prof-explorer__dir-li">
              <div
                className={`prof-explorer__dir-row prof-explorer__dir-row--root${selectedDir === behaviourRoot ? " prof-explorer__dir-row--selected" : ""}`}
                style={{ paddingLeft: "8px" }}
                onClick={() => handleDirSelect(behaviourRoot)}
                role="treeitem"
                title={behaviourRoot}
              >
                <span className="prof-explorer__dir-icon" aria-hidden="true">📁</span>
                <span className="prof-explorer__dir-name">behaviors/</span>
              </div>
            </li>

            {topDirsLoading && (
              <li className="prof-explorer__dir-loading" style={{ paddingLeft: "24px" }}>
                Loading…
              </li>
            )}

            {!topDirsLoading && topDirs.length === 0 && (
              <li className="prof-explorer__dir-empty" style={{ paddingLeft: "24px" }}>
                No subdirectories
              </li>
            )}

            {topDirs.map((dir) => (
              <DirNode
                key={dir.path}
                entry={dir}
                depth={1}
                selectedDir={selectedDir}
                onSelectDir={handleDirSelect}
              />
            ))}
          </ul>
        </div>

        {/* ── Right: .md file list ───────────────────────────────────── */}
        <div className="prof-explorer__file-pane">
          <div className="prof-explorer__pane-label">Documents (.md)</div>

          {!selectedDir && (
            <div className="prof-explorer__file-empty">
              Select a folder to browse documents.
            </div>
          )}

          {selectedDir && filesLoading && (
            <div className="prof-explorer__file-loading">Loading…</div>
          )}

          {selectedDir && !filesLoading && dirFiles.length === 0 && (
            <div className="prof-explorer__file-empty">
              No .md files found in this directory.
            </div>
          )}

          {selectedDir && !filesLoading && dirFiles.length > 0 && (
            <ul className="prof-explorer__file-list" role="listbox" aria-label="Documents">
              {dirFiles.map((file) => {
                const rel = makeRelative(projectRoot, file.path);
                const isActive = pendingPath === rel;
                return (
                  <li
                    key={file.path}
                    className={`prof-explorer__file-item${isActive ? " prof-explorer__file-item--selected" : ""}`}
                    onClick={() => handleFileClick(file)}
                    role="option"
                    aria-selected={isActive}
                    title={rel}
                  >
                    <span className="prof-explorer__file-icon" aria-hidden="true">📄</span>
                    <span className="prof-explorer__file-name">{file.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Footer: selected file + confirm button ─────────────────────── */}
      <div className="prof-explorer__footer">
        <span className="prof-explorer__selected-label">
          {pendingFileName
            ? `Selected: ${pendingFileName}`
            : "No document selected"}
        </span>
        <button
          type="button"
          className="btn btn--primary prof-explorer__confirm-btn"
          onClick={handleConfirmSelect}
          disabled={!pendingPath}
          aria-label="Select document"
        >
          Select
        </button>
      </div>
    </div>
  );
}
