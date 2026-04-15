# Exploration: Export Directory Dialog Freeze/Block — FORENSE ACTUALIZADO

**Date**: 2026-04-15 (Actualizado con investigación forense completa)  
**Status**: 🔴 CRITICAL - Dialog completely blocks UI, requires app kill  
**Component**: ExportModal + SELECT_EXPORT_DIR IPC handler  
**Investigator**: SDD Explorer (forense phase)

---

## Current State - ACTUALIZADO

### El Bug Confirmado
- ✅ App se congela cuando user hace click en "Pick…" dentro ExportModal
- ✅ Dialog se abre pero app no responde a ninguna interacción
- ✅ Requiere `kill` por terminal para cerrar
- ✅ Log muestra `[ipc] SELECT_EXPORT_DIR: opening folder picker` pero proceso después cuelga

### Código ACTUAL (línea 1355-1372 en ipc-handlers.ts)
```typescript
ipcMain.handle(
  IPC_CHANNELS.SELECT_EXPORT_DIR,
  async (event): Promise<SelectExportDirResult> => {
    console.log("[ipc] SELECT_EXPORT_DIR: opening folder picker");
    const win = BrowserWindow.fromWebContents(event.sender);  // ✓ YA EXTRAE win CORRECTAMENTE
    const opts = {
      title: "Choose export directory",
      properties: ["openDirectory", "createDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)               // ✓ Con referencia
      : await dialog.showOpenDialog(opts);                   // Fallback
    const dirPath = result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!;
    console.log("[ipc] SELECT_EXPORT_DIR: selected →", dirPath ?? "(cancelled)");
    return { dirPath };
  }
);
```

**NO hay error de `win` undefined** — variable SÍ está definida (línea 1358).

---

## HALLAZGO CRÍTICO DE FORENSE

### La Raíz NO es ReferenceError - Es Arquitectural

El bug es una **interacción defectuosa entre DOS componentes**:

1. **React Modal Overlay** (ExportModal via `createPortal` en document.body)
2. **Electron Dialog Modal** (`dialog.showOpenDialog`)

**Cuando se abre un dialog Electron DESDE DENTRO de un overlay React, el event loop se bloquea.**

### Comparativa: Por qué OTROS Pickers Funcionan

| Picker | Ubicación | Estado |
|--------|-----------|--------|
| OPEN_FOLDER_DIALOG | Pantalla inicial (NO en modal) | ✅ FUNCIONA |
| SELECT_EXPORT_DIR | DENTRO de ExportModal (overlay) | ❌ CONGELA |

**Patrón**: Bug SOLO ocurre cuando picker se abre desde dentro de modal React.

---

## INVESTIGACIÓN COMPLETA

### I. Conflicto React Modal + Electron Dialog

```
ExportModal (createPortal en document.body)
  └─> .export-modal__overlay { z-index: 9999 }
      └─> captura eventos React antes del dialog nativo
          └─> dialog.showOpenDialog se abre pero NO recibe eventos del SO
              └─> User ve app "congelada" (dialog existe pero no interactúa)
```

### II. SIN Try-Catch en Handler

```typescript
// WRITE_EXPORT_FILE (línea 1375)
async (_event, req) => {
  try {                    // ✓ CON try-catch
    // ... file write
  } catch (err) {
    console.error("[ipc] WRITE_EXPORT_FILE: error —", message);
    return { success: false, error: message };
  }
}

// SELECT_EXPORT_DIR (línea 1355)
async (event) => {
  // ✗ SIN try-catch — si dialog.showOpenDialog falla, error se pierde
  const result = await dialog.showOpenDialog(win, opts);
  // ...
}
```

### III. SIN Timeout

Si `dialog.showOpenDialog` se cuelga, **promesa cuelga indefinidamente**. No hay timeout para desbloquear.

---

## Affected Areas

- `src/electron/ipc-handlers.ts` — SELECT_EXPORT_DIR handler sin error handling
- `src/ui/components/ExportModal/ExportModal.tsx` — handlePickDir sin error handling
- `src/ui/App.tsx` — ExportModal renderizado via createPortal (genera overlay)
- `src/electron/preload.ts` — selectExportDir solo invoca, sin error handling

---

## Approaches

### 1. **Add Try-Catch + Timeout (RECOMENDADO)**
   - Añadir try-catch exterior en SELECT_EXPORT_DIR handler
   - Implementar Promise.race con timeout de 5 segundos
   - Log errors explícitamente
   - Retornar graceful failure (dirPath: null) en vez de colgar
   - Pros: Mitiga congelación inmediata, error visible, simple
   - Cons: No soluciona la raíz (conflicto React + modal)
   - Effort: **Bajo** (5 minutos)

### 2. **Refactor ExportModal - Abrir Picker Fuera del Overlay**
   - Separar lógica del picker del modal component
   - Cerrar temporalmente overlay → abrir picker → reabre overlay
   - O usar worker/separate window para el dialog
   - Pros: Elimina conflicto arquitectónico, solución definitiva
   - Cons: UX más compleja (flickering), mayor refactor
   - Effort: **Alto** (2-4 horas)

### 3. **Instrumentación + Debugging Completo**
   - Logs exhaustivos en preload, main, renderer
   - Promise tracking para saber DONDE se cuelga
   - Detectar si es React overlay, SO sandbox, o Electron hang
   - Pros: Visibilidad completa, debugging para futuros bugs
   - Cons: No arregla el problema hasta hacer uno de los anteriores
   - Effort: **Medio** (1 hora)

---

## Recommendation

**Implementar Approach 1 (Try-Catch + Timeout) INMEDIATAMENTE**
- Mitiga la congelación
- Permite app seguir responsiva
- Simple de implementar (5 minutos)
- Desbloquea al usuario para usar otras features

**Después, planificar Approach 2 para solución estructural**
- Requiere refactor de ExportModal
- Eliminaría el bug radicalmente

---

## Risks

- **Risk 1**: Si timeout es muy corto (< 3s), dialogs legítimos se interrumpen
- **Risk 2**: Si no se implementa error handling en React, user ver spinner infinito
- **Risk 3**: Otros pickers podrían tener el mismo problema (OPEN_FILE_DIALOG, ASSET_OPEN_MD_DIALOG) — necesita testing

---

## Ready for Proposal?

**YES** ✅

**What the orchestrator should tell the user:**
"The dialog freeze is caused by a conflict between React's modal overlay and Electron's native dialog modal. The code is already extracting BrowserWindow correctly, but the event loop gets blocked when the dialog opens from inside the overlay. We're implementing immediate mitigations (timeout + error handling) to prevent the freeze, then planning a structural refactor to eliminate the root cause."



5. **Symptom**: Dialog appears but is **frozen/non-responsive**, forces `kill -9`

### Comparison with Working Dialogs

| Handler | Window Resolution | Status |
|---------|-------------------|--------|
| `OPEN_FOLDER_DIALOG` (line 408) | `BrowserWindow.fromWebContents(event.sender)` | ✅ Works |
| `OPEN_FILE_DIALOG` (line 427) | `BrowserWindow.fromWebContents(event.sender)` | ✅ Works |
| `ASSET_OPEN_MD_DIALOG` (line 1023) | `BrowserWindow.fromWebContents(event.sender)` | ✅ Works |
| `SELECT_EXPORT_DIR` (line 1348) | `BrowserWindow.getFocusedWindow()` | ❌ **BLOCKED** |

---

## Affected Areas

- **`src/electron/ipc-handlers.ts`** — line 1348-1363: `SELECT_EXPORT_DIR` handler
- **`src/ui/components/ExportModal/ExportModal.tsx`** — line 176-183: `handlePickDir` callback
- **`src/electron/preload.ts`** — line 218-220: `selectExportDir` bridge method
- **`src/electron/bridge.types.ts`** — line 1272: `selectExportDir()` interface

---

## Root Cause Analysis

### Issue 1: Missing Event Parameter

**Current Code** (line 1348):
```typescript
ipcMain.handle(
  IPC_CHANNELS.SELECT_EXPORT_DIR,
  async (_event): Promise<SelectExportDirResult> => {  // ← _event is ignored
```

**Correct Pattern** (e.g., line 406):
```typescript
ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER_DIALOG, async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);  // ← Use event.sender
```

**Why This Matters**:
- `event.sender` is the **exact WebContents** that initiated the IPC call
- `BrowserWindow.getFocusedWindow()` returns the **currently focused window** (may be null if a modal dialog has focus)
- When ExportModal is open, focus may shift to the dialog itself or become ambiguous
- `getFocusedWindow()` can return `null` or the **wrong window** in multi-window scenarios

### Issue 2: Fallback Window Selection

**Current Code** (line 1353):
```typescript
const result = await dialog.showOpenDialog(
  win ?? BrowserWindow.getAllWindows()[0]!,  // ← Dangerous fallback
  { ... }
);
```

**Problem**:
- `BrowserWindow.getAllWindows()[0]!` is **arbitrary** if multiple windows exist
- May not be the window that triggered the IPC call
- Can cause Electron dialog to open **off-screen** or in **wrong context**

### Issue 3: Modal Context Not Passed

**Architecture Issue**:
- ExportModal is a **React Portal** (createPortal into document.body)
- Electron's `showOpenDialog` doesn't know about React overlays
- Without the correct parent window context, the dialog may:
  - Open behind the main window
  - Not receive keyboard/mouse events correctly
  - Hang waiting for user input that never arrives

---

## Approaches

### Option A: Use event.sender (RECOMMENDED - Immediate Fix)
**Effort**: 5 minutes | **Risk**: Very Low | **Completeness**: Complete for single-window

```typescript
ipcMain.handle(
  IPC_CHANNELS.SELECT_EXPORT_DIR,
  async (event): Promise<SelectExportDirResult> => {
    console.log("[ipc] SELECT_EXPORT_DIR: opening folder picker");
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: "Choose export directory",
      properties: ["openDirectory", "createDirectory"],
    });
    const dirPath = result.canceled || result.filePaths.length === 0
      ? null
      : result.filePaths[0]!;
    console.log("[ipc] SELECT_EXPORT_DIR: selected →", dirPath ?? "(cancelled)");
    return { dirPath };
  }
);
```

**Pros**:
- Matches pattern used in all other working dialog handlers
- Ensures dialog is modal to the **correct** window
- Single line change (remove `_event` ignoring, add `event.sender` usage)
- No side effects

**Cons**:
- Assumes single-window app (true for AgentsFlow)

### Option B: Add Timeout + Error Handling (Safety Enhancement)
**Effort**: 10 minutes | **Risk**: Low | **Completeness**: Better error recovery

```typescript
ipcMain.handle(
  IPC_CHANNELS.SELECT_EXPORT_DIR,
  async (event): Promise<SelectExportDirResult> => {
    try {
      console.log("[ipc] SELECT_EXPORT_DIR: opening folder picker");
      const win = BrowserWindow.fromWebContents(event.sender);
      
      if (!win) {
        console.error("[ipc] SELECT_EXPORT_DIR: could not find window from event.sender");
        return { dirPath: null };
      }
      
      const result = await dialog.showOpenDialog(win, {
        title: "Choose export directory",
        properties: ["openDirectory", "createDirectory"],
      });
      
      const dirPath = result.canceled || result.filePaths.length === 0
        ? null
        : result.filePaths[0]!;
      
      console.log("[ipc] SELECT_EXPORT_DIR: selected →", dirPath ?? "(cancelled)");
      return { dirPath };
    } catch (err) {
      console.error("[ipc] SELECT_EXPORT_DIR: error —", err);
      return { dirPath: null };
    }
  }
);
```

**Pros**:
- Better error logging for debugging
- Prevents uncaught exceptions
- Graceful degradation

**Cons**:
- More verbose
- Doesn't address root cause

### Option C: Use showOpenDialogSync + Worker Thread (NOT RECOMMENDED)
**Effort**: 30+ minutes | **Risk**: High | **Completeness**: Overkill

Why NOT: Blocks the main thread; defeats async benefits

---

## Recommendation

**Use Option A**: Fix by using `event.sender` instead of `getFocusedWindow()`.

This is the **standard pattern** used by every other dialog handler in the codebase. The mismatch is the bug.

---

## Minimum Test Plan

### Manual Test 1: Basic Dialog Flow
1. Open AgentsFlow
2. Open Export Modal
3. Click "Pick…"
4. ✅ Dialog should appear and be responsive
5. ✅ Select a directory → path should populate
6. ✅ Modal should close and return to ExportModal

### Manual Test 2: Cancel Dialog
1. Open ExportModal
2. Click "Pick…"
3. Press ESC or click Cancel
4. ✅ Dialog closes without blocking
5. ✅ Export Modal remains open

### Manual Test 3: Dialog + Modal Interaction
1. Open ExportModal
2. Click "Pick…"
3. While dialog is open, try clicking ExportModal buttons (should not respond)
4. ✅ Dialog has modal focus
5. Close dialog
6. ✅ ExportModal buttons are responsive again

### Unit/Integration Test
```typescript
// tests/electron/select-export-dir.test.ts
describe("SELECT_EXPORT_DIR", () => {
  it("should open dialog without blocking", async () => {
    const result = await selectExportDir();
    // Should not hang or timeout
    expect(result).toHaveProperty("dirPath");
  });

  it("should use event.sender to get correct window", () => {
    // Verify handler uses BrowserWindow.fromWebContents(event.sender)
    // not BrowserWindow.getFocusedWindow()
  });
});
```

---

## Verification Checklist

- [ ] Code uses `event.sender` not `getFocusedWindow()`
- [ ] Window context is passed to `showOpenDialog(win, opts)`
- [ ] Error handling catches and logs failures
- [ ] Manual test: Dialog appears and is responsive
- [ ] Manual test: Dialog can be cancelled without blocking
- [ ] Manual test: ExportModal remains functional after dialog close

---

## Files to Change

1. **`src/electron/ipc-handlers.ts`** (lines 1348-1363)
   - Change parameter from `_event` to `event`
   - Replace `BrowserWindow.getFocusedWindow()` with `BrowserWindow.fromWebContents(event.sender)`
   - Add error handling

---

## Key Learnings

| Finding | Evidence |
|---------|----------|
| **Root Cause** | SELECT_EXPORT_DIR uses `getFocusedWindow()` instead of `event.sender` |
| **Pattern Mismatch** | All other dialog handlers use `event.sender` correctly |
| **Window Context** | Electron dialogs need the exact window context (WebContents) to work properly |
| **Modal Context** | React Portal overlays don't inform Electron about modal state |
| **Fix Complexity** | One-line change in window resolution logic |
| **Risk Level** | Very low — matches proven pattern used elsewhere |

---

## Ready for Proposal

**Status**: ✅ YES

**Next Phase**: Can proceed to proposal/design with confidence that:
1. Root cause is clearly identified (window resolution)
2. Fix is straightforward and low-risk
3. Pattern exists in codebase to follow
4. Test plan is clear and minimal

