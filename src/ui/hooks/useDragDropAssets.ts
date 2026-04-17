/**
 * src/ui/hooks/useDragDropAssets.ts
 *
 * Custom hook that encapsulates all HTML5 Drag-and-Drop logic for the
 * Assets panel (DirTree + FileList).
 *
 * Design:
 *   - Zero external dependencies — uses the native HTML5 Drag-and-Drop API.
 *   - Drag state is stored in assetStore (draggedItem) so both DirTree and
 *     FileList share the same drag context.
 *   - Client-side validation runs before any IPC call (fast feedback).
 *   - Server-side validation runs inside assetStore.moveItem() (security).
 *
 * Usage:
 *   const dnd = useDragDropAssets();
 *
 *   // Make an item draggable:
 *   <div draggable {...dnd.getDragProps({ kind: "file", path, name, parentPath })} />
 *
 *   // Make a dir a drop target:
 *   <div {...dnd.getDropProps(targetDirPath)} className={dnd.getDropClass(targetDirPath)} />
 */

import { useState, useCallback } from "react";
import { useAssetStore } from "../store/assetStore.ts";
import type { DraggedItem, DropValidation } from "../../electron/bridge.types.ts";

// ── Constants ─────────────────────────────────────────────────────────────

/**
 * Root-level directory names that are NEVER draggable but CAN be drop targets.
 * Only applies when the item's parentPath === projectRoot.
 */
const PROTECTED_ROOT_SOURCE_NAMES = new Set(["skills", "behaviors"]);

/**
 * Directory name that is completely hidden from the UI (never rendered, never
 * a drag source, never a drop target) regardless of where it appears in the tree.
 */
const HIDDEN_DIR_NAME = "metadata";

// ── Path helpers ───────────────────────────────────────────────────────────

/**
 * Returns true if any segment of the path is exactly "metadata".
 * Works with both forward-slash and backslash separators.
 */
function pathContainsMetadata(p: string): boolean {
  return p.replace(/\\/g, "/").split("/").includes(HIDDEN_DIR_NAME);
}

// ── Hook ──────────────────────────────────────────────────────────────────

export interface DragDropHandlers {
  /**
   * Returns drag event props for a draggable item.
   * When `draggable` is false the item is non-draggable (protected root dir).
   */
  getDragProps(item: DraggedItem): {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };

  /**
   * Returns drop event props for a directory drop target.
   * Pass the absolute path of the directory.
   */
  getDropProps(targetDirPath: string): {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };

  /**
   * Returns the CSS modifier class for a drop target.
   *   ""                 — not being dragged over
   *   "dnd--drop-valid"  — valid drop target (green highlight)
   *   "dnd--drop-invalid"— invalid drop target (red highlight)
   */
  getDropClass(targetDirPath: string): string;

  /** Validate a potential drop client-side (before IPC). */
  validateDrop(targetDirPath: string): DropValidation;

  /** The item currently being dragged, or null. */
  draggedItem: DraggedItem | null;

  /** The directory path currently hovered as a drop target. */
  dropTarget: string | null;
}

export function useDragDropAssets(): DragDropHandlers {
  const { draggedItem, setDraggedItem, moveItem, projectRoot } = useAssetStore();
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // ── Client-side validation ─────────────────────────────────────────────

  const validateDrop = useCallback(
    (targetDirPath: string): DropValidation => {
      if (!draggedItem) return { valid: false, reason: "Nothing being dragged." };

      const src = draggedItem.path.replace(/\\/g, "/").replace(/\/+$/, "");
      const tgt = targetDirPath.replace(/\\/g, "/").replace(/\/+$/, "");
      const root = (projectRoot ?? "").replace(/\\/g, "/").replace(/\/+$/, "");

      const srcName = draggedItem.name;
      const srcParent = draggedItem.parentPath.replace(/\\/g, "/").replace(/\/+$/, "");

      // Metadata anywhere in source path → never movable (also never rendered, belt-and-suspenders)
      if (pathContainsMetadata(src) || srcName === HIDDEN_DIR_NAME) {
        return { valid: false, reason: `"${HIDDEN_DIR_NAME}" directories cannot be moved.` };
      }

      // Root-level protected dirs (skills, behaviors) → non-draggable
      if (srcParent === root && PROTECTED_ROOT_SOURCE_NAMES.has(srcName)) {
        return { valid: false, reason: `"${srcName}" is a system directory and cannot be moved.` };
      }

      // Metadata anywhere in target path → never a valid drop target
      if (pathContainsMetadata(tgt)) {
        const tgtName = tgt.split("/").pop() ?? "";
        return { valid: false, reason: `Cannot move items into "${tgtName}".` };
      }

      // Same parent — no-op
      if (srcParent === tgt) {
        return { valid: false, reason: "Item is already in that folder." };
      }

      // Cycle: moving a dir into itself or a descendant
      if (draggedItem.kind === "dir") {
        const srcWithSlash = src + "/";
        if (tgt === src || tgt.startsWith(srcWithSlash)) {
          return { valid: false, reason: "Cannot move a folder into itself or one of its subfolders." };
        }
      }

      return { valid: true };
    },
    [draggedItem, projectRoot]
  );

  // ── Drag props ─────────────────────────────────────────────────────────

  const getDragProps = useCallback(
    (item: DraggedItem) => {
      const root = (projectRoot ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
      const srcParent = item.parentPath.replace(/\\/g, "/").replace(/\/+$/, "");

      // Root-level protected dirs (skills, behaviors) must not be draggable
      const isProtectedRoot =
        item.kind === "dir" &&
        srcParent === root &&
        PROTECTED_ROOT_SOURCE_NAMES.has(item.name);

      if (isProtectedRoot) {
        // Return draggable=false so the HTML element becomes non-draggable.
        // The noop handlers are kept for type compatibility but never fire.
        return {
          draggable: false as const,
          onDragStart: (_e: React.DragEvent) => {},
          onDragEnd: (_e: React.DragEvent) => {},
        };
      }

      return {
        draggable: true as const,
        onDragStart: (e: React.DragEvent) => {
          // Store metadata in dataTransfer for cross-component communication
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("application/x-asset-path", item.path);
          e.dataTransfer.setData("application/x-asset-kind", item.kind);
          setDraggedItem(item);
        },
        onDragEnd: (_e: React.DragEvent) => {
          setDraggedItem(null);
          setDropTarget(null);
        },
      };
    },
    [setDraggedItem, projectRoot]
  );

  // ── Drop props ─────────────────────────────────────────────────────────

  const getDropProps = useCallback(
    (targetDirPath: string) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        const validation = validateDrop(targetDirPath);
        e.dataTransfer.dropEffect = validation.valid ? "move" : "none";
        if (dropTarget !== targetDirPath) setDropTarget(targetDirPath);
      },
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        setDropTarget(targetDirPath);
      },
      onDragLeave: (e: React.DragEvent) => {
        // Only clear if we're leaving to outside the element (not entering a child)
        const related = e.relatedTarget as Node | null;
        if (related && (e.currentTarget as HTMLElement).contains(related)) return;
        if (dropTarget === targetDirPath) setDropTarget(null);
      },
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);

        const validation = validateDrop(targetDirPath);
        if (!validation.valid) return;

        if (!draggedItem) return;

        // Kick off the move — store handles optimistic UI + reconciliation
        setDraggedItem(null);
        await moveItem(draggedItem.path, targetDirPath);
      },
    }),
    [draggedItem, dropTarget, validateDrop, moveItem, setDraggedItem]
  );

  // ── CSS class helper ───────────────────────────────────────────────────

  const getDropClass = useCallback(
    (targetDirPath: string): string => {
      if (!draggedItem) return "";
      if (dropTarget !== targetDirPath) return "";
      const validation = validateDrop(targetDirPath);
      return validation.valid ? "dnd--drop-valid" : "dnd--drop-invalid";
    },
    [draggedItem, dropTarget, validateDrop]
  );

  return {
    getDragProps,
    getDropProps,
    getDropClass,
    validateDrop,
    draggedItem,
    dropTarget,
  };
}
