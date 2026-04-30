# 🧠 Plan de Implementación: GitChangesPanel

## 🎯 Objetivo

Implementar la sección **"Changes"** del modal de integración Git (`GitChangesPanel`) en el editor AgentsFlow, reemplazando el placeholder actual con una UI funcional que permita al usuario ver el estado del repositorio, redactar un commit y ejecutar `git add + git commit` de todos los cambios pendientes.

---

## 🧩 Contexto

### Estado actual
- `GitChangesPanel.tsx` es un stub con un `<p>Changes — coming soon.</p>`.
- El modal `GitIntegrationModal.tsx` ya renderiza `<GitChangesPanel />` cuando `activeSection === "changes"`.
- El patrón arquitectónico establecido por `GitBranchesPanel` + `useGitBranches` es el modelo a seguir.
- El backend Git (`git-branches.ts`) usa `runGit()` + `execFile` con manejo de errores tipado.
- El bridge IPC sigue el patrón: `IPC_CHANNELS` → `preload.ts` → `window.agentsFlow.*` → hook React.

### Archivos clave de referencia
| Archivo | Rol |
|---|---|
| `src/ui/components/GitIntegrationModal/GitChangesPanel.tsx` | Componente a implementar |
| `src/ui/hooks/useGitBranches.ts` | Modelo de hook a replicar |
| `src/electron/git-branches.ts` | Modelo de handlers IPC a replicar |
| `src/electron/bridge.types.ts` | Tipos IPC + `IPC_CHANNELS` |
| `src/electron/preload.ts` | Bridge renderer↔main |
| `src/electron/ipc-handlers.ts` | Registro de handlers |

---

## 🧭 Estrategia

Seguir **exactamente** el patrón establecido en el proyecto:

1. **Backend (main process):** Nuevas funciones en `git-changes.ts` que ejecutan comandos git via `runGit()`.
2. **IPC:** Nuevos canales en `IPC_CHANNELS` + tipos en `bridge.types.ts`.
3. **Preload:** Exposición de los nuevos métodos en `window.agentsFlow`.
4. **Hook React:** `useGitChanges.ts` con `useReducer` + `useCallback`.
5. **UI:** `GitChangesPanel.tsx` con subsecciones bien definidas.

---

## 🚀 Fases

---

### 🔹 Phase 1: Tipos IPC y canales

**Description:**  
Definir todos los tipos TypeScript y constantes de canal necesarios para las operaciones de Changes. Esto es el contrato entre main y renderer.

**Archivo:** `src/electron/bridge.types.ts`

#### Nuevos canales en `IPC_CHANNELS`

```typescript
// ── Git Changes channels ───────────────────────────────────────────────────

// Obtiene el estado de todos los archivos del working tree (staged, unstaged, untracked).
// Equivale a: git status --porcelain=v1
GIT_GET_STATUS: "git:get-status",

// Ejecuta git add -A && git commit -m <message> [-m <description>]
// Hace stage de TODO lo pendiente y crea el commit.
GIT_ADD_AND_COMMIT: "git:add-and-commit",
```

#### Nuevos tipos en `bridge.types.ts`

```typescript
// ── Git Changes IPC types ──────────────────────────────────────────────────

/**
 * Estado de un archivo en el working tree de Git.
 * Basado en el formato porcelain v1 de `git status`.
 *
 * Códigos de estado (columna X = staged, columna Y = unstaged):
 *   M  = Modified
 *   A  = Added (staged)
 *   D  = Deleted
 *   R  = Renamed
 *   C  = Copied
 *   U  = Updated but unmerged
 *   ?  = Untracked
 *   !  = Ignored
 */
export type GitFileStatusCode =
  | "M"   // Modified
  | "A"   // Added
  | "D"   // Deleted
  | "R"   // Renamed
  | "C"   // Copied
  | "U"   // Unmerged
  | "?"   // Untracked
  | " ";  // Unmodified (used in XY pairs)

/**
 * Representa un archivo con cambios en el repositorio.
 * Cada archivo puede tener estado staged (X) y/o unstaged (Y).
 */
export interface GitChangedFile {
  /** Ruta relativa del archivo desde la raíz del repositorio */
  path: string;
  /**
   * Código de estado en el área staged (index).
   * " " significa sin cambios staged.
   */
  stagedStatus: GitFileStatusCode;
  /**
   * Código de estado en el working tree (unstaged).
   * " " significa sin cambios unstaged.
   */
  unstagedStatus: GitFileStatusCode;
  /** True si el archivo tiene cambios en el área staged */
  isStaged: boolean;
  /** True si el archivo tiene cambios en el working tree (no staged) */
  isUnstaged: boolean;
  /** True si el archivo es untracked (nuevo, no rastreado por git) */
  isUntracked: boolean;
  /**
   * Ruta original antes de un rename/copy.
   * Solo presente cuando stagedStatus === "R" o "C".
   */
  originalPath?: string;
}

/** Request payload para GIT_GET_STATUS */
export interface GitGetStatusRequest {
  /** Ruta absoluta al directorio del proyecto */
  projectDir: string;
}

/** Resultado exitoso de GIT_GET_STATUS */
export interface GitGetStatusResult {
  ok: true;
  /** Rama actual del repositorio */
  currentBranch: string;
  /** Lista de todos los archivos con cambios */
  files: GitChangedFile[];
  /** Total de archivos con cambios staged */
  stagedCount: number;
  /** Total de archivos con cambios unstaged (incluyendo untracked) */
  unstagedCount: number;
}

/** Respuesta de GIT_GET_STATUS */
export type GitGetStatusResponse = GitGetStatusResult | GitOperationError;

/** Request payload para GIT_ADD_AND_COMMIT */
export interface GitAddAndCommitRequest {
  /** Ruta absoluta al directorio del proyecto */
  projectDir: string;
  /** Mensaje del commit (obligatorio, no vacío) */
  message: string;
  /**
   * Descripción extendida del commit (opcional).
   * Se agrega como segundo párrafo del mensaje de commit.
   */
  description?: string;
}

/** Resultado exitoso de GIT_ADD_AND_COMMIT */
export interface GitAddAndCommitResult {
  ok: true;
  /** Hash corto del commit creado */
  commitHash: string;
  /** Mensaje de salida de git commit */
  output: string;
}

/** Respuesta de GIT_ADD_AND_COMMIT */
export type GitAddAndCommitResponse = GitAddAndCommitResult | GitOperationError;
```

**Tasks:**

- **Task:** Agregar `GIT_GET_STATUS` y `GIT_ADD_AND_COMMIT` a `IPC_CHANNELS`
  - **Assigned to:** Developer
  - **Dependencies:** Ninguna

- **Task:** Agregar tipos `GitChangedFile`, `GitGetStatusRequest`, `GitGetStatusResult`, `GitGetStatusResponse`, `GitAddAndCommitRequest`, `GitAddAndCommitResult`, `GitAddAndCommitResponse` a `bridge.types.ts`
  - **Assigned to:** Developer
  - **Dependencies:** Tarea anterior

---

### 🔹 Phase 2: Backend IPC — git-changes.ts

**Description:**  
Crear el archivo `src/electron/git-changes.ts` con las funciones que ejecutan los comandos git y los handlers IPC. Seguir el mismo patrón que `git-branches.ts`.

**Archivo nuevo:** `src/electron/git-changes.ts`

#### Función: `getStatus(projectDir)`

```
git status --porcelain=v1 -u
```

- Parsear cada línea del formato `XY path` o `XY orig -> path` (para renames).
- Clasificar cada archivo según los códigos X (staged) e Y (unstaged).
- Obtener la rama actual con `git rev-parse --abbrev-ref HEAD`.
- Retornar `GitGetStatusResult` con `files`, `currentBranch`, `stagedCount`, `unstagedCount`.

**Parsing de `git status --porcelain=v1`:**
```
Formato: "XY path\n" o "XY orig_path -> new_path\n" (rename)
X = estado staged (index)
Y = estado working tree
?? = untracked
!! = ignored (ignorar)
```

**Edge cases a manejar:**
- Repo sin commits → `git status` puede fallar con "HEAD" inválido; retornar lista vacía con `currentBranch: ""`.
- Archivos con espacios en el nombre → el formato porcelain los maneja correctamente.
- Renames: línea con ` -> ` → separar `originalPath` y `path`.
- Archivos ignorados (`!!`) → excluir del listado.
- Repo limpio (sin cambios) → retornar `files: []`.

#### Función: `addAndCommit(projectDir, message, description?)`

```
git add -A
git commit -m <message> [-m <description>]
```

- Primero ejecutar `git add -A` (stage todo).
- Luego `git commit -m message` (con `-m description` adicional si existe).
- Parsear el hash del commit del output de git.
- Si no hay nada que commitear → retornar error `E_NOTHING_TO_COMMIT`.

**Nuevo error code a agregar en `GitOperationErrorCode`:**
```typescript
| "E_NOTHING_TO_COMMIT"   // No hay cambios staged ni unstaged
| "E_EMPTY_COMMIT_MSG"    // Mensaje de commit vacío (validación backend)
```

**Tasks:**

- **Task:** Crear `src/electron/git-changes.ts` con `getStatus()`, `addAndCommit()`, `registerGitChangesHandlers()`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 1 completada

- **Task:** Agregar `E_NOTHING_TO_COMMIT` y `E_EMPTY_COMMIT_MSG` a `GitOperationErrorCode` en `bridge.types.ts`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 1

---

### 🔹 Phase 3: Registro de handlers y preload

**Description:**  
Registrar los nuevos handlers en el proceso main y exponerlos en el bridge del renderer.

#### `src/electron/ipc-handlers.ts`

Importar y llamar `registerGitChangesHandlers(ipcMain)` junto a los demás registros.

```typescript
import { registerGitChangesHandlers } from "./git-changes.ts";
// ...
registerGitChangesHandlers(ipcMain);
```

#### `src/electron/preload.ts`

Agregar los dos nuevos métodos al objeto `window.agentsFlow`:

```typescript
gitGetStatus: (req: GitGetStatusRequest): Promise<GitGetStatusResponse> =>
  ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STATUS, req),

gitAddAndCommit: (req: GitAddAndCommitRequest): Promise<GitAddAndCommitResponse> =>
  ipcRenderer.invoke(IPC_CHANNELS.GIT_ADD_AND_COMMIT, req),
```

#### `AgentsFlowBridge` interface (en `bridge.types.ts`)

Agregar las firmas a la interfaz del bridge:

```typescript
gitGetStatus(req: GitGetStatusRequest): Promise<GitGetStatusResponse>;
gitAddAndCommit(req: GitAddAndCommitRequest): Promise<GitAddAndCommitResponse>;
```

**Tasks:**

- **Task:** Registrar `registerGitChangesHandlers` en `ipc-handlers.ts`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 2

- **Task:** Exponer `gitGetStatus` y `gitAddAndCommit` en `preload.ts`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 2

- **Task:** Agregar firmas a `AgentsFlowBridge` en `bridge.types.ts`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 1

---

### 🔹 Phase 4: Hook React — useGitChanges.ts

**Description:**  
Crear el hook `src/ui/hooks/useGitChanges.ts` siguiendo el patrón de `useGitBranches.ts` con `useReducer` + `useCallback`.

**Archivo nuevo:** `src/ui/hooks/useGitChanges.ts`

#### Estado (`GitChangesState`)

```typescript
interface GitChangesState {
  // Datos
  currentBranch: string;
  files: GitChangedFile[];
  stagedCount: number;
  unstagedCount: number;

  // Formulario de commit
  commitMessage: string;
  commitDescription: string;

  // Loading flags
  isLoadingStatus: boolean;
  isCommitting: boolean;

  // Feedback
  statusError: string | null;
  commitError: string | null;
  lastCommitSuccess: string | null;  // hash del último commit exitoso
}
```

#### Acciones (`GitChangesAction`)

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

#### Funciones expuestas por el hook

```typescript
return {
  state,
  loadStatus,       // () => Promise<void> — recarga git status
  setCommitMessage, // (msg: string) => void
  setCommitDescription, // (desc: string) => void
  addAndCommit,     // () => Promise<void> — ejecuta git add -A && git commit
  clearFeedback,    // () => void
};
```

#### Comportamiento

- `useEffect` inicial: llamar `loadStatus()` cuando `projectDir` cambia.
- Tras un commit exitoso: llamar `loadStatus()` automáticamente para refrescar la lista.
- Tras commit exitoso: limpiar `commitMessage` y `commitDescription` (acción `RESET_FORM`).
- Auto-clear del mensaje de éxito después de 3 segundos (igual que en `GitBranchesPanel`).

**Tasks:**

- **Task:** Crear `src/ui/hooks/useGitChanges.ts` con reducer, estado inicial y callbacks
  - **Assigned to:** Developer
  - **Dependencies:** Phase 3

---

### 🔹 Phase 5: Componente UI — GitChangesPanel.tsx

**Description:**  
Implementar el componente `GitChangesPanel` con las 4 subsecciones requeridas.

**Archivo:** `src/ui/components/GitIntegrationModal/GitChangesPanel.tsx`

---

#### Estructura general del componente

```tsx
export function GitChangesPanel() {
  const projectDir = useProjectStore((s) => s.project?.projectDir ?? null);
  const { state, loadStatus, setCommitMessage, setCommitDescription, addAndCommit, clearFeedback } = useGitChanges(projectDir);

  // Auto-clear success message
  useEffect(() => {
    if (!state.lastCommitSuccess) return;
    const id = window.setTimeout(clearFeedback, 3000);
    return () => window.clearTimeout(id);
  }, [state.lastCommitSuccess, clearFeedback]);

  if (!projectDir) {
    return <div className="git-changes__no-project">No project open.</div>;
  }

  return (
    <div className="git-changes">
      <CurrentBranchSection currentBranch={state.currentBranch} isLoading={state.isLoadingStatus} />
      <div className="git-branches__divider" />
      <CommitFormSection ... />
      <div className="git-branches__divider" />
      <ChangedFilesSection ... />
      <div className="git-branches__divider" />
      <CommitActionSection ... />
    </div>
  );
}
```

---

#### Subsección 1: `CurrentBranchSection`

**Propósito:** Mostrar la rama actual del repositorio.

```tsx
interface CurrentBranchSectionProps {
  currentBranch: string;
  isLoading: boolean;
}

function CurrentBranchSection({ currentBranch, isLoading }: CurrentBranchSectionProps) {
  return (
    <section className="git-changes__section" aria-labelledby="git-changes-branch-title">
      <header className="git-changes__section-header">
        <h3 id="git-changes-branch-title" className="git-changes__section-title">
          Current Branch
        </h3>
      </header>
      {isLoading ? (
        <div className="git-changes__spinner" role="status" aria-live="polite">
          Loading…
        </div>
      ) : (
        <p className="git-changes__current-branch">
          <span className="git-changes__branch-icon" aria-hidden="true">⎇</span>
          <span className="git-changes__branch-name">
            {currentBranch || "(detached HEAD)"}
          </span>
        </p>
      )}
    </section>
  );
}
```

**UX:**
- Mostrar ícono de rama (`⎇`) antes del nombre.
- Si `currentBranch` está vacío (HEAD detached), mostrar `"(detached HEAD)"`.
- Durante la carga inicial, mostrar spinner inline.

---

#### Subsección 2: `CommitFormSection`

**Propósito:** Campos para ingresar el mensaje y descripción del commit.

```tsx
interface CommitFormSectionProps {
  commitMessage: string;
  commitDescription: string;
  isCommitting: boolean;
  onMessageChange: (msg: string) => void;
  onDescriptionChange: (desc: string) => void;
}

function CommitFormSection(props: CommitFormSectionProps) {
  const messageError = props.commitMessage.trim().length === 0 && props.commitMessage.length > 0
    ? "Commit message cannot be only whitespace."
    : props.commitMessage.length > 72
    ? "Commit message should be 72 characters or less."
    : null;

  return (
    <section className="git-changes__section" aria-labelledby="git-changes-commit-title">
      <header className="git-changes__section-header">
        <h3 id="git-changes-commit-title" className="git-changes__section-title">
          Commit
        </h3>
      </header>

      {/* Campo: Commit message */}
      <div className="git-changes__field">
        <label htmlFor="git-changes-commit-msg" className="git-changes__label">
          Message <span className="git-changes__required" aria-hidden="true">*</span>
        </label>
        <input
          id="git-changes-commit-msg"
          type="text"
          className={`git-changes__input${messageError ? " git-changes__input--error" : ""}`}
          value={props.commitMessage}
          onChange={(e) => props.onMessageChange(e.target.value)}
          placeholder="Short summary of changes"
          disabled={props.isCommitting}
          maxLength={200}
          aria-required="true"
          aria-describedby={messageError ? "git-changes-msg-error" : "git-changes-msg-hint"}
          aria-invalid={messageError ? "true" : "false"}
          autoComplete="off"
          spellCheck={true}
        />
        {messageError ? (
          <p id="git-changes-msg-error" className="git-changes__validation-error" role="alert" aria-live="assertive">
            {messageError}
          </p>
        ) : (
          <p id="git-changes-msg-hint" className="git-changes__hint">
            {props.commitMessage.length}/72 characters recommended
          </p>
        )}
      </div>

      {/* Campo: Descripción (opcional) */}
      <div className="git-changes__field">
        <label htmlFor="git-changes-commit-desc" className="git-changes__label">
          Description <span className="git-changes__optional">(optional)</span>
        </label>
        <textarea
          id="git-changes-commit-desc"
          className="git-changes__textarea"
          value={props.commitDescription}
          onChange={(e) => props.onDescriptionChange(e.target.value)}
          placeholder="Extended description of the changes (optional)"
          disabled={props.isCommitting}
          rows={3}
          aria-required="false"
          spellCheck={true}
        />
      </div>
    </section>
  );
}
```

**Validaciones UI (frontend):**
- `commitMessage` vacío o solo espacios → deshabilitar botón "Add and Commit".
- `commitMessage.length > 72` → mostrar advertencia visual (no bloquear).
- `commitMessage.length > 200` → bloqueado por `maxLength`.
- `commitDescription` es completamente opcional, sin validación.

---

#### Subsección 3: `ChangedFilesSection`

**Propósito:** Listar todos los archivos con cambios, agrupados por estado.

```tsx
interface ChangedFilesSectionProps {
  files: GitChangedFile[];
  stagedCount: number;
  unstagedCount: number;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function ChangedFilesSection(props: ChangedFilesSectionProps) {
  const stagedFiles = props.files.filter((f) => f.isStaged);
  const unstagedFiles = props.files.filter((f) => !f.isStaged || f.isUnstaged);
  // Nota: un archivo puede aparecer en ambos grupos si tiene cambios staged Y unstaged

  return (
    <section className="git-changes__section" aria-labelledby="git-changes-files-title">
      <header className="git-changes__section-header">
        <h3 id="git-changes-files-title" className="git-changes__section-title">
          Changes
          {props.files.length > 0 && (
            <span className="git-changes__count-badge" aria-label={`${props.files.length} files changed`}>
              {props.files.length}
            </span>
          )}
        </h3>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={props.onRefresh}
          disabled={props.isLoading}
          aria-label="Refresh file status"
        >
          ↻ Refresh
        </button>
      </header>

      {props.error && (
        <div className="git-branches__error-banner" role="alert">{props.error}</div>
      )}

      {props.isLoading ? (
        <div className="git-changes__spinner" role="status" aria-live="polite">
          Loading changes…
        </div>
      ) : props.files.length === 0 ? (
        <div className="git-branches__empty-state">
          ✓ No changes detected. Working tree is clean.
        </div>
      ) : (
        <div className="git-changes__file-list" role="list" aria-label="Changed files">
          {props.files.map((file) => (
            <GitFileRow key={file.path} file={file} />
          ))}
        </div>
      )}
    </section>
  );
}
```

##### Sub-componente: `GitFileRow`

```tsx
interface GitFileRowProps {
  file: GitChangedFile;
}

function GitFileRow({ file }: GitFileRowProps) {
  const statusLabel = getStatusLabel(file);
  const statusClass = getStatusClass(file);

  return (
    <div
      className={`git-changes__file-row git-changes__file-row--${statusClass}`}
      role="listitem"
      title={file.originalPath ? `Renamed from: ${file.originalPath}` : file.path}
    >
      <span
        className={`git-changes__file-status git-changes__file-status--${statusClass}`}
        aria-label={statusLabel}
        title={statusLabel}
      >
        {getStatusIcon(file)}
      </span>
      <span className="git-changes__file-path">
        {file.path}
        {file.originalPath && (
          <span className="git-changes__file-original" aria-label={`renamed from ${file.originalPath}`}>
            ← {file.originalPath}
          </span>
        )}
      </span>
      <span className="git-changes__file-badges">
        {file.isStaged && (
          <span className="git-changes__badge git-changes__badge--staged" title="Staged">S</span>
        )}
        {file.isUnstaged && (
          <span className="git-changes__badge git-changes__badge--unstaged" title="Unstaged">U</span>
        )}
        {file.isUntracked && (
          <span className="git-changes__badge git-changes__badge--untracked" title="Untracked">?</span>
        )}
      </span>
    </div>
  );
}
```

**Helpers de clasificación visual:**

```typescript
function getStatusLabel(file: GitChangedFile): string {
  if (file.isUntracked) return "Untracked";
  const staged = file.stagedStatus;
  const unstaged = file.unstagedStatus;
  if (staged === "A") return "Added";
  if (staged === "M" || unstaged === "M") return "Modified";
  if (staged === "D" || unstaged === "D") return "Deleted";
  if (staged === "R") return "Renamed";
  if (staged === "C") return "Copied";
  if (staged === "U" || unstaged === "U") return "Unmerged";
  return "Changed";
}

function getStatusIcon(file: GitChangedFile): string {
  if (file.isUntracked) return "?";
  const staged = file.stagedStatus;
  const unstaged = file.unstagedStatus;
  if (staged === "A") return "+";
  if (staged === "D" || unstaged === "D") return "−";
  if (staged === "R") return "→";
  if (staged === "U" || unstaged === "U") return "!";
  return "~";  // Modified
}

function getStatusClass(file: GitChangedFile): string {
  if (file.isUntracked) return "untracked";
  if (file.stagedStatus === "A") return "added";
  if (file.stagedStatus === "D" || file.unstagedStatus === "D") return "deleted";
  if (file.stagedStatus === "R") return "renamed";
  if (file.stagedStatus === "U" || file.unstagedStatus === "U") return "unmerged";
  return "modified";
}
```

**UX de la lista:**
- Ordenar: primero staged, luego unstaged/untracked.
- Mostrar badge `S` (staged), `U` (unstaged), `?` (untracked) en cada fila.
- Color coding: verde=added, rojo=deleted, amarillo=modified, gris=untracked.
- Tooltip con ruta completa en archivos con nombres largos.
- Si hay muchos archivos (>20), mostrar scroll interno con `max-height`.

---

#### Subsección 4: `CommitActionSection`

**Propósito:** Botón "Add and Commit" + feedback de resultado.

```tsx
interface CommitActionSectionProps {
  commitMessage: string;
  hasChanges: boolean;
  isCommitting: boolean;
  commitError: string | null;
  lastCommitSuccess: string | null;
  onAddAndCommit: () => void;
}

function CommitActionSection(props: CommitActionSectionProps) {
  const canCommit =
    props.commitMessage.trim().length > 0 &&
    props.hasChanges &&
    !props.isCommitting;

  return (
    <section className="git-changes__section git-changes__action-section" aria-labelledby="git-changes-action-title">
      <header className="git-changes__section-header">
        <h3 id="git-changes-action-title" className="git-changes__section-title">
          Stage & Commit
        </h3>
      </header>

      {props.commitError && (
        <div className="git-branches__error-banner" role="alert">
          {props.commitError}
        </div>
      )}

      {props.lastCommitSuccess && (
        <div className="git-branches__success-banner" role="status">
          ✓ Committed successfully — {props.lastCommitSuccess}
        </div>
      )}

      <div className="git-changes__action-row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canCommit}
          onClick={props.onAddAndCommit}
          aria-busy={props.isCommitting}
          aria-describedby={!canCommit ? "git-changes-commit-hint" : undefined}
        >
          {props.isCommitting ? "Committing…" : "✔ Add and Commit"}
        </button>
      </div>

      {!props.hasChanges && !props.isCommitting && (
        <p id="git-changes-commit-hint" className="git-changes__hint" role="status">
          No changes to commit.
        </p>
      )}
      {props.hasChanges && props.commitMessage.trim().length === 0 && !props.isCommitting && (
        <p id="git-changes-commit-hint" className="git-changes__hint">
          Enter a commit message to continue.
        </p>
      )}
    </section>
  );
}
```

**Tasks:**

- **Task:** Implementar `GitChangesPanel.tsx` con las 4 subsecciones
  - **Assigned to:** Developer
  - **Dependencies:** Phase 4

- **Task:** Implementar sub-componentes `CurrentBranchSection`, `CommitFormSection`, `ChangedFilesSection`, `GitFileRow`, `CommitActionSection`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 4

---

### 🔹 Phase 6: Estilos CSS

**Description:**  
Agregar las clases CSS necesarias para `GitChangesPanel` en los archivos de estilos existentes. Reutilizar clases de `git-branches__*` donde sea posible.

**Archivo:** `src/ui/styles/app.css` o `app2.css` (verificar cuál contiene los estilos de git-branches)

#### Clases nuevas a agregar

```css
/* ── Git Changes Panel ──────────────────────────────────────────────────── */

.git-changes {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  overflow-y: auto;
}

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

/* ── Commit Form ─────────────────────────────────────────────────────────── */

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
  /* Reutilizar estilos de git-branches__input */
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

/* ── File List ───────────────────────────────────────────────────────────── */

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

.git-changes__file-status--added    { color: var(--color-success); }
.git-changes__file-status--modified { color: var(--color-warning); }
.git-changes__file-status--deleted  { color: var(--color-error); }
.git-changes__file-status--renamed  { color: var(--color-accent); }
.git-changes__file-status--untracked{ color: var(--color-text-muted); }
.git-changes__file-status--unmerged { color: var(--color-error); }

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

/* ── Action Section ──────────────────────────────────────────────────────── */

.git-changes__action-section {
  padding-top: 0.75rem;
}

.git-changes__action-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.5rem;
}

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

**Tasks:**

- **Task:** Agregar clases CSS de `git-changes__*` al archivo de estilos correspondiente
  - **Assigned to:** Developer
  - **Dependencies:** Phase 5

---

## ⚠️ Risks

### Riesgos técnicos

1. **Repo sin commits iniciales:** `git status --porcelain` puede comportarse diferente en repos vacíos. Manejar con `isRepoWithoutCommits()` ya existente.

2. **Archivos con rutas que contienen espacios o caracteres especiales:** El formato porcelain v1 los maneja, pero el parser debe ser robusto. Usar split por posición fija (primeros 2 chars = XY, char 3 = espacio, resto = path).

3. **Renames en porcelain v1:** El formato es `R  new_path\0old_path` en modo `-z`, pero en modo texto es `R  old_path -> new_path`. Usar `-z` para mayor robustez o parsear el ` -> ` con cuidado.

4. **Commit con nada staged pero sí untracked:** `git add -A` hace stage de todo incluyendo untracked, por lo que siempre habrá algo que commitear si `files.length > 0`.

5. **Mensaje de commit con comillas o caracteres especiales:** Pasar el mensaje como argumento separado a `execFile` (no como string concatenado en shell), lo que ya hace `runGit()` — esto es seguro por diseño.

6. **Timeout en `git add -A` en repos grandes:** Aumentar el timeout a 30s para el comando `addAndCommit`.

### Riesgos de UX

7. **Lista de archivos muy larga:** Limitar la altura con scroll. Si hay >50 archivos, mostrar un resumen ("50+ files changed").

8. **Pérdida del mensaje de commit al cambiar de sección:** El estado vive en el hook, que se destruye cuando `GitChangesPanel` se desmonta. Considerar si esto es aceptable (sí lo es para MVP).

---

## 📝 Notes

### Convenciones del proyecto a respetar

- **Patrón de hook:** `useReducer` + `useCallback` + `getBridge()` helper. NO usar `useState` múltiple.
- **Patrón de componente:** Sub-componentes funcionales con props tipadas como interfaces. NO componentes de clase.
- **Manejo de errores:** Siempre retornar `GitOperationError` tipado, nunca lanzar al renderer.
- **CSS:** BEM-like con prefijo `git-changes__`. Reutilizar variables CSS existentes.
- **Accesibilidad:** `role`, `aria-label`, `aria-live`, `aria-busy`, `aria-invalid` en todos los elementos interactivos.
- **Timeouts de feedback:** 3 segundos para mensajes de éxito (igual que `GitBranchesPanel`).

### Comportamiento del botón "Add and Commit"

El botón ejecuta **`git add -A && git commit`** — hace stage de TODO lo pendiente (staged + unstaged + untracked) y luego commitea. No hay selección individual de archivos. Esto es intencional y debe quedar claro en el tooltip/label del botón.

### Orden de implementación recomendado

1. `bridge.types.ts` (tipos + canales)
2. `git-changes.ts` (backend)
3. `ipc-handlers.ts` + `preload.ts` (registro + bridge)
4. `useGitChanges.ts` (hook)
5. `GitChangesPanel.tsx` (UI)
6. CSS

### Comandos git utilizados

```bash
# Obtener estado del repo
git status --porcelain=v1 -u

# Obtener rama actual
git rev-parse --abbrev-ref HEAD

# Stage todo + commit
git add -A
git commit -m "message" -m "description"
```

### Accesibilidad (checklist)

- [ ] Todos los `<input>` y `<textarea>` tienen `<label>` asociado con `htmlFor`
- [ ] Errores de validación tienen `role="alert"` y `aria-live="assertive"`
- [ ] Mensajes de éxito tienen `role="status"`
- [ ] Botón "Add and Commit" tiene `aria-busy` durante la operación
- [ ] Lista de archivos tiene `role="list"` y cada fila `role="listitem"`
- [ ] Íconos decorativos tienen `aria-hidden="true"`
- [ ] Elementos con estado deshabilitado tienen `disabled` (no solo estilos)
- [ ] Navegación por teclado funcional (Tab, Enter en botones)

---

## 📁 Archivos a crear/modificar

| Acción | Archivo |
|---|---|
| **Crear** | `src/electron/git-changes.ts` |
| **Crear** | `src/ui/hooks/useGitChanges.ts` |
| **Modificar** | `src/ui/components/GitIntegrationModal/GitChangesPanel.tsx` |
| **Modificar** | `src/electron/bridge.types.ts` |
| **Modificar** | `src/electron/preload.ts` |
| **Modificar** | `src/electron/ipc-handlers.ts` |
| **Modificar** | `src/ui/styles/app.css` (o `app2.css`) |

---

## 🎨 Recomendaciones de UX

### 1. Feedback inmediato
- El spinner de carga debe aparecer inmediatamente al abrir la sección "Changes".
- El botón "Add and Commit" debe mostrar "Committing…" con `aria-busy` durante la operación.
- El mensaje de éxito debe incluir el hash corto del commit (ej: `✓ Committed — a1b2c3d`).

### 2. Estado vacío claro
- Cuando no hay cambios: mostrar `✓ No changes detected. Working tree is clean.` con ícono verde.
- Cuando hay cambios pero no hay mensaje: mostrar hint "Enter a commit message to continue."

### 3. Contador de archivos
- El badge numérico en el header de "Changes" da contexto rápido sin necesidad de scrollear.

### 4. Color coding de archivos
- Verde para archivos nuevos/added.
- Amarillo/naranja para modificados.
- Rojo para eliminados.
- Gris para untracked.
- Esto sigue la convención visual de VS Code y GitHub, familiar para desarrolladores.

### 5. Botón prominente
- "Add and Commit" debe ser `btn--primary` (color de acento del sistema).
- Alineado a la derecha para seguir la convención de acciones confirmatorias.

### 6. Refresh manual
- El botón "↻ Refresh" en la sección de archivos permite al usuario recargar el estado sin cerrar el modal.
- Útil cuando se hacen cambios externos mientras el modal está abierto.

### 7. Límite visual de caracteres
- El contador `{n}/72` en el campo de mensaje ayuda al usuario a seguir las convenciones de commit messages.
- 72 caracteres es el límite recomendado por la comunidad git.

---

*Documento generado por Weight-Planner — AgentsFlow Git Changes Panel*  
*Fecha: 2026-04-27*
