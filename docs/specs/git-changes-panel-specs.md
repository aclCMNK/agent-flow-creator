# 📋 Especificaciones Técnicas — GitChangesPanel

> **Feature:** Sección "Changes" del modal de integración Git  
> **Módulo:** `GitChangesPanel` — Sección Changes del `GitIntegrationModal`  
> **Fecha:** 2026-04-27  
> **Autor:** Weight-Planner  
> **Plan de referencia:** `docs/plans/git-changes-panel-implementation.md`

---

## 📑 Índice

1. [Estructura de Componentes y Props](#1-estructura-de-componentes-y-props)
2. [Flujos de Validación y UX](#2-flujos-de-validación-y-ux)
3. [Lógica de Integración con Git (IPC/Backend)](#3-lógica-de-integración-con-git-ipcbackend)
4. [Edge Cases y Manejo de Errores](#4-edge-cases-y-manejo-de-errores)
5. [Accesibilidad](#5-accesibilidad)
6. [Reglas de Estilos / CSS](#6-reglas-de-estilos--css)
7. [Checklist QA](#7-checklist-qa)

---

## 1. Estructura de Componentes y Props

### 1.1 Árbol de componentes

```
GitIntegrationModal
└── GitChangesPanel                        ← componente raíz de la sección
    ├── CurrentBranchSection               ← subsección 1: rama actual
    │   ├── <section aria-labelledby>
    │   │   ├── <header> / <h3>            — título "Current Branch"
    │   │   ├── spinner (isLoading)        — estado de carga
    │   │   └── <p> .git-changes__current-branch
    │   │       ├── <span> ⎇              — ícono decorativo (aria-hidden)
    │   │       └── <span> branch name    — nombre de rama (monospace)
    ├── <div className="git-branches__divider" />
    ├── CommitFormSection                  ← subsección 2: formulario de commit
    │   ├── <section aria-labelledby>
    │   │   ├── <header> / <h3>            — título "Commit"
    │   │   ├── .git-changes__field        — campo mensaje
    │   │   │   ├── <label htmlFor="git-changes-commit-msg">
    │   │   │   ├── <input id="git-changes-commit-msg" type="text">
    │   │   │   └── <p> hint | error       — contador / error de validación
    │   │   └── .git-changes__field        — campo descripción
    │   │       ├── <label htmlFor="git-changes-commit-desc">
    │   │       └── <textarea id="git-changes-commit-desc">
    ├── <div className="git-branches__divider" />
    ├── ChangedFilesSection                ← subsección 3: lista de archivos
    │   ├── <section aria-labelledby>
    │   │   ├── <header> / <h3>            — título "Changes" + badge contador
    │   │   │   └── <button> ↻ Refresh
    │   │   ├── error banner (si error)
    │   │   ├── spinner (isLoading)
    │   │   ├── empty state (sin cambios)
    │   │   └── .git-changes__file-list [role="list"]
    │   │       └── GitFileRow × N [role="listitem"]
    │   │           ├── <span> status icon (aria-label)
    │   │           ├── <span> file path
    │   │           │   └── <span> original path (renames)
    │   │           └── <span> badges S / U / ?
    ├── <div className="git-branches__divider" />
    └── CommitActionSection                ← subsección 4: acción de commit
        ├── <section aria-labelledby>
        │   ├── <header> / <h3>            — título "Stage & Commit"
        │   ├── error banner (commitError)
        │   ├── success banner (lastCommitSuccess)
        │   ├── .git-changes__action-row
        │   │   └── <button> "Add and Commit" (btn--primary)
        │   └── <p> hint contextual
```

---

### 1.2 Props de cada componente

#### `GitChangesPanel` (componente raíz)

No recibe props externas. Obtiene `projectDir` desde `useProjectStore`.

```typescript
// Sin props — usa hooks internamente
export function GitChangesPanel(): JSX.Element
```

**Dependencias internas:**
- `useProjectStore((s) => s.project?.projectDir ?? null)` — ruta del proyecto
- `useGitChanges(projectDir)` — hook de estado y acciones

---

#### `CurrentBranchSection`

```typescript
interface CurrentBranchSectionProps {
  /** Nombre de la rama actual. Vacío si HEAD detached o repo sin commits. */
  currentBranch: string;
  /** True mientras se ejecuta git status. Muestra spinner. */
  isLoading: boolean;
}
```

**Comportamiento:**
- Si `currentBranch === ""` → mostrar texto `"(detached HEAD)"`.
- Si `isLoading === true` → mostrar spinner, ocultar nombre de rama.

---

#### `CommitFormSection`

```typescript
interface CommitFormSectionProps {
  /** Valor actual del campo mensaje de commit. */
  commitMessage: string;
  /** Valor actual del campo descripción (opcional). */
  commitDescription: string;
  /** True mientras se ejecuta el commit. Deshabilita ambos campos. */
  isCommitting: boolean;
  /** Callback al cambiar el mensaje. */
  onMessageChange: (msg: string) => void;
  /** Callback al cambiar la descripción. */
  onDescriptionChange: (desc: string) => void;
}
```

**Validación interna (calculada en render, no en props):**

| Condición | Resultado |
|---|---|
| `commitMessage.trim().length === 0 && commitMessage.length > 0` | Error: "Commit message cannot be only whitespace." |
| `commitMessage.length > 72` | Warning: "Commit message should be 72 characters or less." |
| `commitMessage.length > 200` | Bloqueado por `maxLength={200}` |
| `commitDescription` cualquier valor | Sin validación (campo libre) |

---

#### `ChangedFilesSection`

```typescript
interface ChangedFilesSectionProps {
  /** Lista completa de archivos con cambios. */
  files: GitChangedFile[];
  /** Total de archivos con cambios staged. */
  stagedCount: number;
  /** Total de archivos con cambios unstaged (incluyendo untracked). */
  unstagedCount: number;
  /** True mientras se carga el status. */
  isLoading: boolean;
  /** Mensaje de error de la última carga, o null. */
  error: string | null;
  /** Callback para recargar el status manualmente. */
  onRefresh: () => void;
}
```

---

#### `GitFileRow`

```typescript
interface GitFileRowProps {
  /** Datos del archivo con cambios. */
  file: GitChangedFile;
}
```

**Helpers de clasificación (funciones puras, no exportadas):**

```typescript
// Retorna etiqueta legible del estado del archivo
function getStatusLabel(file: GitChangedFile): string

// Retorna ícono de texto para el estado ("+", "−", "~", "→", "!", "?")
function getStatusIcon(file: GitChangedFile): string

// Retorna clase CSS de modificador para el estado
function getStatusClass(file: GitChangedFile): "added" | "modified" | "deleted" | "renamed" | "untracked" | "unmerged"
```

**Tabla de mapeo de estado → ícono → clase:**

| Condición | Ícono | Clase CSS | Color |
|---|---|---|---|
| `isUntracked` | `?` | `untracked` | gris (`--color-text-muted`) |
| `stagedStatus === "A"` | `+` | `added` | verde (`--color-success`) |
| `stagedStatus === "D"` o `unstagedStatus === "D"` | `−` | `deleted` | rojo (`--color-error`) |
| `stagedStatus === "R"` | `→` | `renamed` | acento (`--color-accent`) |
| `stagedStatus === "U"` o `unstagedStatus === "U"` | `!` | `unmerged` | rojo (`--color-error`) |
| Default (Modified) | `~` | `modified` | amarillo (`--color-warning`) |

---

#### `CommitActionSection`

```typescript
interface CommitActionSectionProps {
  /** Mensaje de commit actual (para validar si está vacío). */
  commitMessage: string;
  /** True si hay al menos un archivo con cambios. */
  hasChanges: boolean;
  /** True mientras se ejecuta el commit. */
  isCommitting: boolean;
  /** Error del último intento de commit, o null. */
  commitError: string | null;
  /** Hash corto del último commit exitoso, o null. */
  lastCommitSuccess: string | null;
  /** Callback para ejecutar git add -A && git commit. */
  onAddAndCommit: () => void;
}
```

**Lógica de habilitación del botón:**

```typescript
const canCommit =
  props.commitMessage.trim().length > 0  // mensaje no vacío
  && props.hasChanges                     // hay archivos con cambios
  && !props.isCommitting;                 // no hay operación en curso
```

---

### 1.3 Hook: `useGitChanges`

**Firma:**

```typescript
function useGitChanges(projectDir: string | null): {
  state: GitChangesState;
  loadStatus: () => Promise<void>;
  setCommitMessage: (msg: string) => void;
  setCommitDescription: (desc: string) => void;
  addAndCommit: () => Promise<void>;
  clearFeedback: () => void;
}
```

**Estado (`GitChangesState`):**

```typescript
interface GitChangesState {
  // Datos del repositorio
  currentBranch: string;
  files: GitChangedFile[];
  stagedCount: number;
  unstagedCount: number;

  // Formulario de commit
  commitMessage: string;
  commitDescription: string;

  // Flags de operación
  isLoadingStatus: boolean;
  isCommitting: boolean;

  // Feedback
  statusError: string | null;
  commitError: string | null;
  lastCommitSuccess: string | null;  // hash corto del commit exitoso
}
```

**Estado inicial:**

```typescript
const initialState: GitChangesState = {
  currentBranch: "",
  files: [],
  stagedCount: 0,
  unstagedCount: 0,
  commitMessage: "",
  commitDescription: "",
  isLoadingStatus: false,
  isCommitting: false,
  statusError: null,
  commitError: null,
  lastCommitSuccess: null,
};
```

**Acciones del reducer (`GitChangesAction`):**

```typescript
type GitChangesAction =
  | { type: "LOAD_STATUS_START" }
  | { type: "LOAD_STATUS_SUCCESS"; currentBranch: string; files: GitChangedFile[]; stagedCount: number; unstagedCount: number }
  | { type: "LOAD_STATUS_ERROR"; error: string }
  | { type: "SET_COMMIT_MESSAGE"; message: string }
  | { type: "SET_COMMIT_DESCRIPTION"; description: string }
  | { type: "COMMIT_START" }
  | { type: "COMMIT_SUCCESS"; commitHash: string }
  | { type: "COMMIT_ERROR"; error: string }
  | { type: "CLEAR_COMMIT_FEEDBACK" }
  | { type: "RESET_FORM" };
```

**Efectos secundarios del hook:**

| Evento | Efecto |
|---|---|
| `projectDir` cambia | Llamar `loadStatus()` automáticamente |
| `projectDir === null` | No llamar nada, estado permanece inicial |
| Commit exitoso (`COMMIT_SUCCESS`) | Llamar `loadStatus()` + despachar `RESET_FORM` |
| `lastCommitSuccess !== null` | Auto-clear después de 3 segundos (en el componente raíz) |

---

## 2. Flujos de Validación y UX

### 2.1 Flujo de carga inicial

```
GitChangesPanel monta
  └─► useEffect detecta projectDir
        └─► dispatch LOAD_STATUS_START  →  isLoadingStatus = true
              └─► window.agentsFlow.gitGetStatus({ projectDir })
                    ├─► OK: dispatch LOAD_STATUS_SUCCESS
                    │         isLoadingStatus = false
                    │         files, currentBranch, stagedCount, unstagedCount actualizados
                    └─► Error: dispatch LOAD_STATUS_ERROR
                              isLoadingStatus = false
                              statusError = mensaje de error
```

**UX durante carga:**
- `CurrentBranchSection` muestra spinner con `role="status"` y `aria-live="polite"`.
- `ChangedFilesSection` muestra spinner con texto "Loading changes…".
- El botón "Add and Commit" permanece deshabilitado.

---

### 2.2 Flujo de commit

```
Usuario escribe mensaje en CommitFormSection
  └─► onMessageChange → dispatch SET_COMMIT_MESSAGE
        └─► canCommit se recalcula en CommitActionSection

Usuario hace clic en "Add and Commit"
  └─► canCommit === true (validación previa)
        └─► dispatch COMMIT_START  →  isCommitting = true
              └─► window.agentsFlow.gitAddAndCommit({ projectDir, message, description? })
                    ├─► OK: dispatch COMMIT_SUCCESS { commitHash }
                    │         isCommitting = false
                    │         lastCommitSuccess = commitHash
                    │         → loadStatus() automático
                    │         → dispatch RESET_FORM (limpia campos)
                    └─► Error: dispatch COMMIT_ERROR { error }
                              isCommitting = false
                              commitError = mensaje de error
```

**UX durante commit:**
- Botón muestra texto "Committing…" con `aria-busy="true"`.
- Ambos campos del formulario se deshabilitan (`disabled`).
- Botón "↻ Refresh" se deshabilita.

**UX tras commit exitoso:**
- Banner verde: `✓ Committed successfully — {commitHash}`.
- Campos de mensaje y descripción se limpian.
- Lista de archivos se recarga automáticamente.
- Banner desaparece automáticamente a los 3 segundos.

**UX tras commit fallido:**
- Banner rojo con el mensaje de error.
- Campos del formulario se rehabilitan.
- El usuario puede corregir y reintentar.

---

### 2.3 Flujo de validación del mensaje de commit

```
Usuario escribe en el campo "Message"
  └─► onChange → onMessageChange(value)
        └─► Validación en render de CommitFormSection:
              ├─► value.trim() === "" && value.length > 0
              │     → mostrar error "Commit message cannot be only whitespace."
              │     → aria-invalid="true" en el input
              │     → aria-describedby apunta a #git-changes-msg-error
              ├─► value.length > 72
              │     → mostrar warning (no error) en el hint
              │     → NO bloquear el botón por esto
              └─► value.trim().length > 0 && value.length <= 72
                    → mostrar hint "{n}/72 characters recommended"
                    → aria-describedby apunta a #git-changes-msg-hint
```

---

### 2.4 Flujo de refresh manual

```
Usuario hace clic en "↻ Refresh"
  └─► onRefresh() → loadStatus()
        └─► Mismo flujo que carga inicial
              (isLoadingStatus = true → spinner → resultado)
```

---

### 2.5 Estado sin proyecto abierto

```
projectDir === null
  └─► GitChangesPanel retorna early:
        <div className="git-changes__no-project">No project open.</div>
```

No se monta ninguna subsección. No se realizan llamadas IPC.

---

### 2.6 Estado de working tree limpio

```
loadStatus() exitoso con files = []
  └─► ChangedFilesSection muestra empty state:
        "✓ No changes detected. Working tree is clean."
  └─► CommitActionSection:
        canCommit = false (hasChanges = false)
        hint: "No changes to commit."
```

---

## 3. Lógica de Integración con Git (IPC/Backend)

### 3.1 Arquitectura del bridge

```
Renderer (React)
  useGitChanges hook
    └─► window.agentsFlow.gitGetStatus(req)
    └─► window.agentsFlow.gitAddAndCommit(req)
          │
          │  (IPC via contextBridge)
          ▼
Preload (preload.ts)
  ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STATUS, req)
  ipcRenderer.invoke(IPC_CHANNELS.GIT_ADD_AND_COMMIT, req)
          │
          │  (Electron IPC)
          ▼
Main Process (ipc-handlers.ts)
  registerGitChangesHandlers(ipcMain)
          │
          ▼
git-changes.ts
  getStatus(projectDir)
  addAndCommit(projectDir, message, description?)
          │
          ▼
runGit() → execFile("git", [...args], { cwd: projectDir })
```

---

### 3.2 Canales IPC

| Canal | Constante | Dirección |
|---|---|---|
| `"git:get-status"` | `IPC_CHANNELS.GIT_GET_STATUS` | renderer → main |
| `"git:add-and-commit"` | `IPC_CHANNELS.GIT_ADD_AND_COMMIT` | renderer → main |

---

### 3.3 Tipos IPC completos

#### `GitFileStatusCode`

```typescript
export type GitFileStatusCode =
  | "M"   // Modified
  | "A"   // Added (staged)
  | "D"   // Deleted
  | "R"   // Renamed
  | "C"   // Copied
  | "U"   // Unmerged
  | "?"   // Untracked
  | " ";  // Unmodified (en pares XY)
```

#### `GitChangedFile`

```typescript
export interface GitChangedFile {
  path: string;              // Ruta relativa desde raíz del repo
  stagedStatus: GitFileStatusCode;    // Estado en el index (X)
  unstagedStatus: GitFileStatusCode;  // Estado en working tree (Y)
  isStaged: boolean;         // Tiene cambios en el index
  isUnstaged: boolean;       // Tiene cambios en working tree
  isUntracked: boolean;      // Archivo nuevo no rastreado
  originalPath?: string;     // Solo en renames/copies (stagedStatus R o C)
}
```

#### `GitGetStatusRequest` / `GitGetStatusResponse`

```typescript
export interface GitGetStatusRequest {
  projectDir: string;  // Ruta absoluta al directorio del proyecto
}

export interface GitGetStatusResult {
  ok: true;
  currentBranch: string;
  files: GitChangedFile[];
  stagedCount: number;
  unstagedCount: number;
}

export type GitGetStatusResponse = GitGetStatusResult | GitOperationError;
```

#### `GitAddAndCommitRequest` / `GitAddAndCommitResponse`

```typescript
export interface GitAddAndCommitRequest {
  projectDir: string;
  message: string;       // Obligatorio, no vacío
  description?: string;  // Opcional, segundo párrafo del commit
}

export interface GitAddAndCommitResult {
  ok: true;
  commitHash: string;  // Hash corto del commit creado
  output: string;      // Salida completa de git commit
}

export type GitAddAndCommitResponse = GitAddAndCommitResult | GitOperationError;
```

---

### 3.4 Implementación backend: `git-changes.ts`

#### Función `getStatus(projectDir: string)`

**Comandos ejecutados:**
```bash
git rev-parse --abbrev-ref HEAD          # obtener rama actual
git status --porcelain=v1 -u             # obtener estado de archivos
```

**Algoritmo de parsing del porcelain v1:**

```
Para cada línea del output de git status:
  1. Extraer X = línea[0], Y = línea[1]
  2. Extraer path = línea.slice(3)
  3. Si X === "!" → ignorar (archivo ignorado)
  4. Si X === "?" && Y === "?" → isUntracked = true
  5. Si path contiene " -> " → es rename:
       originalPath = parte antes de " -> "
       path = parte después de " -> "
  6. Construir GitChangedFile:
       isStaged = X !== " " && X !== "?"
       isUnstaged = Y !== " " && Y !== "?"
       isUntracked = X === "?" && Y === "?"
```

**Retorno en caso de repo sin commits:**
```typescript
{ ok: true, currentBranch: "", files: [], stagedCount: 0, unstagedCount: 0 }
```

#### Función `addAndCommit(projectDir, message, description?)`

**Comandos ejecutados (secuencialmente):**
```bash
git add -A
git commit -m "<message>" [-m "<description>"]
```

**Parsing del hash del commit:**
- El output de `git commit` incluye una línea como `[main a1b2c3d] message`.
- Extraer el hash con regex: `/\[.+? ([a-f0-9]+)\]/`.

**Nuevos códigos de error en `GitOperationErrorCode`:**

```typescript
| "E_NOTHING_TO_COMMIT"   // git add -A no encontró nada que agregar
| "E_EMPTY_COMMIT_MSG"    // message vacío (validación backend como segunda línea de defensa)
```

---

### 3.5 Registro en `ipc-handlers.ts`

```typescript
import { registerGitChangesHandlers } from "./git-changes";

// Dentro de la función de registro principal:
registerGitChangesHandlers(ipcMain);
```

---

### 3.6 Exposición en `preload.ts`

```typescript
gitGetStatus: (req: GitGetStatusRequest): Promise<GitGetStatusResponse> =>
  ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STATUS, req),

gitAddAndCommit: (req: GitAddAndCommitRequest): Promise<GitAddAndCommitResponse> =>
  ipcRenderer.invoke(IPC_CHANNELS.GIT_ADD_AND_COMMIT, req),
```

---

### 3.7 Interfaz `AgentsFlowBridge` (en `bridge.types.ts`)

```typescript
gitGetStatus(req: GitGetStatusRequest): Promise<GitGetStatusResponse>;
gitAddAndCommit(req: GitAddAndCommitRequest): Promise<GitAddAndCommitResponse>;
```

---

## 4. Edge Cases y Manejo de Errores

### 4.1 Tabla de edge cases

| Caso | Comportamiento esperado |
|---|---|
| `projectDir === null` | Render early con mensaje "No project open." Sin llamadas IPC. |
| Repo sin commits iniciales | `getStatus()` retorna `files: [], currentBranch: ""`. UI muestra "(detached HEAD)" y empty state. |
| Working tree limpio | `files: []`. Empty state visible. Botón deshabilitado. |
| Archivo con espacios en el nombre | Porcelain v1 los maneja. Parser usa posición fija (chars 0-1 = XY, char 2 = espacio, resto = path). |
| Rename de archivo | Línea con ` -> `. `originalPath` se muestra en la fila con `← original`. |
| Archivos ignorados (`!!`) | Excluidos del listado. No aparecen en la UI. |
| Más de 20 archivos | Lista con scroll interno (`max-height: 200px`, `overflow-y: auto`). |
| Más de 50 archivos | Considerar mostrar resumen "50+ files changed" (MVP: scroll es suficiente). |
| Mensaje de commit con comillas/caracteres especiales | Seguro: `runGit()` usa `execFile` con args separados, no concatenación de shell. |
| `git add -A` en repo grande | Timeout aumentado a 30 segundos para el comando `addAndCommit`. |
| Commit fallido por hook de pre-commit | `GitOperationError` con el mensaje de stderr de git. Mostrado en error banner. |
| Pérdida del mensaje al cambiar de sección | El estado vive en el hook que se destruye al desmontar. Aceptable para MVP. |
| `git commit` sin nada staged (imposible con `add -A`) | Retornar `E_NOTHING_TO_COMMIT`. UI muestra error banner. |
| Mensaje de commit solo con espacios | Validación frontend bloquea el botón. Validación backend como segunda línea de defensa (`E_EMPTY_COMMIT_MSG`). |
| HEAD detached | `git rev-parse --abbrev-ref HEAD` retorna `"HEAD"`. Mostrar `"(detached HEAD)"`. |
| Archivo con estado mixto (staged Y unstaged) | Aparece en la lista con ambos badges `S` y `U`. `git add -A` lo resuelve al commitear. |

---

### 4.2 Manejo de errores en el hook

```typescript
// En loadStatus():
try {
  dispatch({ type: "LOAD_STATUS_START" });
  const result = await getBridge().gitGetStatus({ projectDir });
  if (!result.ok) {
    dispatch({ type: "LOAD_STATUS_ERROR", error: result.message });
    return;
  }
  dispatch({ type: "LOAD_STATUS_SUCCESS", ...result });
} catch (err) {
  dispatch({ type: "LOAD_STATUS_ERROR", error: "Unexpected error loading status." });
}

// En addAndCommit():
try {
  dispatch({ type: "COMMIT_START" });
  const result = await getBridge().gitAddAndCommit({ projectDir, message, description });
  if (!result.ok) {
    dispatch({ type: "COMMIT_ERROR", error: result.message });
    return;
  }
  dispatch({ type: "COMMIT_SUCCESS", commitHash: result.commitHash });
  await loadStatus();  // refrescar lista automáticamente
} catch (err) {
  dispatch({ type: "COMMIT_ERROR", error: "Unexpected error during commit." });
}
```

---

### 4.3 Mensajes de error por código

| `GitOperationErrorCode` | Mensaje sugerido para UI |
|---|---|
| `E_NOT_A_REPO` | "This directory is not a Git repository." |
| `E_NOTHING_TO_COMMIT` | "Nothing to commit. Working tree is clean." |
| `E_EMPTY_COMMIT_MSG` | "Commit message cannot be empty." |
| `E_GIT_NOT_FOUND` | "Git is not installed or not found in PATH." |
| `E_PERMISSION_DENIED` | "Permission denied. Check repository access." |
| `E_UNKNOWN` | "An unexpected error occurred. Check the console for details." |

---

## 5. Accesibilidad

### 5.1 Estructura semántica

- Cada subsección usa `<section>` con `aria-labelledby` apuntando al `id` de su `<h3>`.
- Los `<h3>` tienen IDs únicos: `git-changes-branch-title`, `git-changes-commit-title`, `git-changes-files-title`, `git-changes-action-title`.
- La lista de archivos usa `role="list"` en el contenedor y `role="listitem"` en cada fila.

### 5.2 Formulario

| Elemento | Requisito de accesibilidad |
|---|---|
| `<input>` mensaje | `<label htmlFor="git-changes-commit-msg">` + `aria-required="true"` |
| `<textarea>` descripción | `<label htmlFor="git-changes-commit-desc">` + `aria-required="false"` |
| Error de validación | `role="alert"` + `aria-live="assertive"` + `id` referenciado por `aria-describedby` |
| Hint de caracteres | `id` referenciado por `aria-describedby` cuando no hay error |
| `aria-invalid` | `"true"` cuando hay error de validación, `"false"` en caso contrario |

### 5.3 Botones e interactivos

| Elemento | Requisito de accesibilidad |
|---|---|
| Botón "Add and Commit" | `aria-busy="true"` durante commit, `disabled` cuando `!canCommit` |
| Botón "↻ Refresh" | `aria-label="Refresh file status"`, `disabled` durante carga |
| Íconos decorativos (`⎇`, `✔`, `↻`) | `aria-hidden="true"` |
| Badge contador de archivos | `aria-label="{n} files changed"` |

### 5.4 Feedback dinámico

| Elemento | Atributo ARIA |
|---|---|
| Spinner de carga | `role="status"` + `aria-live="polite"` |
| Error banner | `role="alert"` (implica `aria-live="assertive"`) |
| Success banner | `role="status"` |
| Hint contextual (sin cambios) | `role="status"` |

### 5.5 Navegación por teclado

- `Tab` navega entre: campo mensaje → campo descripción → botón Refresh → botón Add and Commit.
- `Enter` en el botón "Add and Commit" ejecuta el commit (comportamiento nativo de `<button type="button">`).
- Cuando el botón está `disabled`, no recibe foco (comportamiento nativo).
- El scroll de la lista de archivos es accesible con teclado (overflow-y: auto en contenedor focusable).

### 5.6 Contraste y visibilidad

- Todos los colores de estado (verde, rojo, amarillo, gris) deben cumplir WCAG AA (ratio 4.5:1 mínimo sobre el fondo del panel).
- Los badges `S`, `U`, `?` tienen texto blanco sobre fondo de color — verificar contraste.
- El estado `disabled` del botón debe ser visualmente distinguible (no solo por color).

---

## 6. Reglas de Estilos / CSS

### 6.1 Archivo de destino

Agregar las clases en el mismo archivo CSS que contiene los estilos de `git-branches__*`. Verificar si es `src/ui/styles/app.css` o `app2.css` antes de editar.

### 6.2 Variables CSS requeridas

Las siguientes variables CSS deben existir en el sistema de diseño:

| Variable | Uso |
|---|---|
| `--color-text-primary` | Texto principal, nombre de rama, rutas de archivos |
| `--color-text-muted` | Títulos de sección, labels, hints, íconos decorativos |
| `--color-accent` | Ícono de rama, badge contador, archivos renombrados, focus de inputs |
| `--color-border` | Borde de inputs y textarea |
| `--color-input-bg` | Fondo de inputs y textarea |
| `--color-hover` | Fondo hover de filas de archivos |
| `--color-success` | Archivos added, badge staged, banner de éxito |
| `--color-warning` | Archivos modified, badge unstaged |
| `--color-error` | Archivos deleted/unmerged, errores de validación, banner de error |

### 6.3 Clases CSS nuevas

#### Contenedor raíz

```css
.git-changes {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  overflow-y: auto;
}
```

#### Secciones

```css
.git-changes__section {
  padding: 1rem 1.25rem;
}

.git-changes__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.git-changes__section-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
```

#### Rama actual

```css
.git-changes__current-branch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
}

.git-changes__branch-icon {
  color: var(--color-accent);
}

.git-changes__branch-name {
  font-family: monospace;
  color: var(--color-text-primary);
}
```

#### Formulario de commit

```css
.git-changes__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.git-changes__label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--color-text-muted);
}

.git-changes__required {
  color: var(--color-error);
  margin-left: 0.15rem;
}

.git-changes__optional {
  color: var(--color-text-muted);
  font-weight: 400;
  font-size: 0.75rem;
}

.git-changes__input {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-input-bg);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.git-changes__input:focus {
  border-color: var(--color-accent);
}

.git-changes__input--error {
  border-color: var(--color-error);
}

.git-changes__textarea {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-input-bg);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  resize: vertical;
  min-height: 60px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}

.git-changes__textarea:focus {
  border-color: var(--color-accent);
}

.git-changes__hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.git-changes__validation-error {
  font-size: 0.75rem;
  color: var(--color-error);
}
```

#### Lista de archivos

```css
.git-changes__count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--color-accent);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
}

.git-changes__file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}

.git-changes__file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: monospace;
  cursor: default;
  transition: background 0.1s;
}

.git-changes__file-row:hover {
  background: var(--color-hover);
}

.git-changes__file-status {
  font-weight: 700;
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
}

/* Modificadores de color por estado */
.git-changes__file-status--added     { color: var(--color-success); }
.git-changes__file-status--modified  { color: var(--color-warning); }
.git-changes__file-status--deleted   { color: var(--color-error); }
.git-changes__file-status--renamed   { color: var(--color-accent); }
.git-changes__file-status--untracked { color: var(--color-text-muted); }
.git-changes__file-status--unmerged  { color: var(--color-error); }

.git-changes__file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-primary);
}

.git-changes__file-original {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  margin-left: 0.4rem;
}

.git-changes__file-badges {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.git-changes__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
}

.git-changes__badge--staged    { background: var(--color-success); color: white; }
.git-changes__badge--unstaged  { background: var(--color-warning); color: white; }
.git-changes__badge--untracked { background: var(--color-text-muted); color: white; }
```

#### Sección de acción

```css
.git-changes__action-section {
  padding-top: 0.75rem;
}

.git-changes__action-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.5rem;
}
```

#### Utilidades

```css
.git-changes__spinner {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: 0.5rem 0;
}

.git-changes__no-project {
  padding: 1rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
```

### 6.4 Clases reutilizadas de `git-branches__*`

Las siguientes clases ya existen y deben reutilizarse sin duplicar:

| Clase | Uso en GitChangesPanel |
|---|---|
| `git-branches__divider` | Separador entre subsecciones |
| `git-branches__error-banner` | Banner de error en ChangedFilesSection y CommitActionSection |
| `git-branches__success-banner` | Banner de éxito en CommitActionSection |
| `git-branches__empty-state` | Estado vacío en ChangedFilesSection |
| `btn` | Base de todos los botones |
| `btn--primary` | Botón "Add and Commit" |
| `btn--ghost` | Botón "↻ Refresh" |

### 6.5 Convenciones de nomenclatura CSS

- Prefijo: `git-changes__` para todos los elementos nuevos.
- Modificadores: `git-changes__elemento--modificador` (BEM-like).
- No usar `!important`.
- No usar estilos inline en JSX (excepto valores dinámicos imposibles de expresar en CSS).
- Usar variables CSS del sistema de diseño, nunca valores hardcodeados de color.

---

## 7. Checklist QA

### 7.1 Funcionalidad core

- [ ] Al abrir la sección "Changes", se carga automáticamente el estado del repositorio.
- [ ] La rama actual se muestra correctamente en `CurrentBranchSection`.
- [ ] La lista de archivos muestra todos los archivos con cambios (staged, unstaged, untracked).
- [ ] El botón "Add and Commit" ejecuta `git add -A && git commit` correctamente.
- [ ] Tras un commit exitoso, la lista de archivos se recarga automáticamente.
- [ ] Tras un commit exitoso, los campos de mensaje y descripción se limpian.
- [ ] El hash corto del commit aparece en el banner de éxito.
- [ ] El banner de éxito desaparece automáticamente después de 3 segundos.
- [ ] El botón "↻ Refresh" recarga el estado del repositorio.

### 7.2 Validaciones

- [ ] El botón "Add and Commit" está deshabilitado cuando el mensaje está vacío.
- [ ] El botón "Add and Commit" está deshabilitado cuando no hay archivos con cambios.
- [ ] El botón "Add and Commit" está deshabilitado durante una operación de commit en curso.
- [ ] Un mensaje con solo espacios muestra el error "Commit message cannot be only whitespace."
- [ ] Un mensaje de más de 72 caracteres muestra el warning visual (sin bloquear el botón).
- [ ] El campo de mensaje no acepta más de 200 caracteres (`maxLength`).
- [ ] El campo de descripción no tiene validación (acepta cualquier valor).

### 7.3 Estados de carga

- [ ] El spinner aparece en `CurrentBranchSection` durante la carga inicial.
- [ ] El spinner aparece en `ChangedFilesSection` durante la carga.
- [ ] El botón "Committing…" aparece con `aria-busy` durante el commit.
- [ ] Los campos del formulario se deshabilitan durante el commit.
- [ ] El botón "↻ Refresh" se deshabilita durante la carga.

### 7.4 Manejo de errores

- [ ] Si `git status` falla, se muestra el error banner en `ChangedFilesSection`.
- [ ] Si `git commit` falla, se muestra el error banner en `CommitActionSection`.
- [ ] El error `E_NOTHING_TO_COMMIT` muestra un mensaje comprensible.
- [ ] El error `E_EMPTY_COMMIT_MSG` (backend) muestra un mensaje comprensible.
- [ ] Tras un error de commit, los campos del formulario se rehabilitan.
- [ ] El usuario puede reintentar el commit tras un error.

### 7.5 Edge cases

- [ ] Sin proyecto abierto: se muestra "No project open." sin llamadas IPC.
- [ ] Repo sin commits: se muestra "(detached HEAD)" y lista vacía.
- [ ] Working tree limpio: se muestra el empty state y el botón está deshabilitado.
- [ ] Archivos con espacios en el nombre se muestran correctamente.
- [ ] Archivos renombrados muestran la ruta original con `← original`.
- [ ] Archivos ignorados (`!!`) no aparecen en la lista.
- [ ] Archivos con estado mixto (staged + unstaged) muestran ambos badges `S` y `U`.
- [ ] Lista con más de 20 archivos tiene scroll interno (no desborda el modal).
- [ ] Mensaje de commit con comillas dobles/simples se procesa correctamente.
- [ ] Descripción con saltos de línea se envía correctamente como segundo `-m`.

### 7.6 Accesibilidad

- [ ] Todos los `<input>` y `<textarea>` tienen `<label>` asociado con `htmlFor`.
- [ ] Los errores de validación tienen `role="alert"` y `aria-live="assertive"`.
- [ ] Los mensajes de éxito tienen `role="status"`.
- [ ] El botón "Add and Commit" tiene `aria-busy="true"` durante el commit.
- [ ] La lista de archivos tiene `role="list"` y cada fila `role="listitem"`.
- [ ] Los íconos decorativos tienen `aria-hidden="true"`.
- [ ] El badge contador tiene `aria-label="{n} files changed"`.
- [ ] Los elementos deshabilitados usan el atributo `disabled` (no solo estilos).
- [ ] La navegación por teclado (Tab) recorre todos los elementos interactivos en orden lógico.
- [ ] El campo de mensaje recibe foco automáticamente al abrir la sección (opcional, verificar si es deseable).

### 7.7 Estilos y visual

- [ ] El color de cada tipo de archivo es correcto (verde=added, amarillo=modified, rojo=deleted, gris=untracked).
- [ ] Los badges `S`, `U`, `?` tienen el color correcto y son legibles.
- [ ] El badge contador en el header muestra el número correcto de archivos.
- [ ] El botón "Add and Commit" usa la clase `btn--primary` (color de acento).
- [ ] El botón "↻ Refresh" usa la clase `btn--ghost`.
- [ ] Los separadores `git-branches__divider` aparecen entre cada subsección.
- [ ] El panel no desborda el modal en ningún estado (con muchos archivos, mensajes largos, etc.).
- [ ] El estado `disabled` del botón es visualmente distinguible.
- [ ] Los inputs y textarea muestran el borde de error en rojo cuando hay validación fallida.
- [ ] Los inputs y textarea muestran el borde de acento al recibir foco.

### 7.8 Integración IPC

- [ ] `gitGetStatus` se llama correctamente con `{ projectDir }`.
- [ ] `gitAddAndCommit` se llama con `{ projectDir, message, description? }` (description solo si no está vacía).
- [ ] Las respuestas de error (`ok: false`) se manejan sin excepciones no capturadas.
- [ ] El timeout de 30s para `addAndCommit` no causa problemas en repos normales.
- [ ] Los handlers IPC están registrados en `ipc-handlers.ts`.
- [ ] Los métodos están expuestos en `preload.ts` y accesibles via `window.agentsFlow`.

### 7.9 Regresión

- [ ] La sección "Branches" del modal Git sigue funcionando correctamente.
- [ ] El modal Git abre y cierra correctamente.
- [ ] El cambio de sección entre "Changes" y "Branches" no causa errores.
- [ ] No hay memory leaks (timeouts limpiados en cleanup de useEffect).
- [ ] No hay llamadas IPC duplicadas al montar/desmontar el componente.

---

## 📁 Archivos involucrados

| Acción | Archivo | Descripción |
|---|---|---|
| **Crear** | `src/electron/git-changes.ts` | Backend: `getStatus()`, `addAndCommit()`, `registerGitChangesHandlers()` |
| **Crear** | `src/ui/hooks/useGitChanges.ts` | Hook React con reducer, estado y callbacks |
| **Modificar** | `src/ui/components/GitIntegrationModal/GitChangesPanel.tsx` | Componente principal con 4 subsecciones |
| **Modificar** | `src/electron/bridge.types.ts` | Tipos IPC + canales + códigos de error nuevos |
| **Modificar** | `src/electron/preload.ts` | Exposición de `gitGetStatus` y `gitAddAndCommit` |
| **Modificar** | `src/electron/ipc-handlers.ts` | Registro de `registerGitChangesHandlers` |
| **Modificar** | `src/ui/styles/app.css` (o `app2.css`) | Clases CSS `git-changes__*` |

---

*Documento generado por Weight-Planner — AgentsFlow Git Changes Panel Specs*  
*Fecha: 2026-04-27*  
*Plan de referencia: `docs/plans/git-changes-panel-implementation.md`*
