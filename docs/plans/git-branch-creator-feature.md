# 🧠 Plan de Solución — Creador de Ramas (Branch Creator)

> **Módulo:** `GitBranchesPanel` — Segunda subsección de la sección Branches del modal Git  
> **Fecha:** 2026-04-27  
> **Autor:** Weight-Planner

---

## 🎯 Objetivo

Agregar una segunda subsección llamada **"Create Branch"** dentro de `GitBranchesPanel`, que permita al usuario crear una nueva rama local a partir de la rama actual o de cualquier otra rama local existente, con validación en tiempo real, checkout automático al crearla y feedback visual claro de éxito o error.

---

## 🧩 Contexto

### Estado actual del sistema

El modal Git (`GitIntegrationModal`) contiene la sección **Branches** renderizada por `GitBranchesPanel`. Esta sección ya tiene:

1. **RemoteChangesSection** — Fetch & Pull desde remoto
2. **BranchSelectorSection** — Selector de ramas existentes + Pull + Checkout
3. **BranchCommitsSection** — Historial de commits de la rama seleccionada

El backend (Electron main process) expone operaciones Git vía IPC a través de `window.agentsFlow` (bridge). El patrón establecido es:

- **`bridge.types.ts`** → define `IPC_CHANNELS` + tipos de request/response
- **`git-branches.ts`** → implementa la lógica Git con `runGit()` + registra handlers IPC
- **`useGitBranches.ts`** → hook React con `useReducer` que consume el bridge
- **`GitBranchesPanel.tsx`** → componentes presentacionales que consumen el hook

### Convenciones del codebase

- Respuestas IPC: `{ ok: true, ... }` o `GitOperationError { ok: false, code, message, rawOutput }`
- Errores mapeados a mensajes legibles en `mapGitErrorToMessage()`
- Accesibilidad: `role="alert"` para errores, `role="status"` para éxito, `aria-live="polite"` para spinners
- CSS BEM: `.git-branches__<elemento>` y `.btn.btn--<variante>`
- Validaciones de nombre de rama: solo en frontend (UX inmediata) + backend (seguridad)

---

## 🧭 Estrategia

Seguir **exactamente el mismo patrón arquitectónico** ya establecido:

1. Agregar canal IPC `GIT_CREATE_BRANCH` en `bridge.types.ts`
2. Implementar `createBranch()` en `git-branches.ts`
3. Extender `useGitBranches` con estado y acción `createBranch`
4. Crear componente `BranchCreatorSection` en `GitBranchesPanel.tsx`
5. Integrar la sección como segunda subsección en `GitBranchesPanel`

---

## 🚀 Fases

---

### 🔹 Phase 1: Contrato IPC — `bridge.types.ts`

**Description:**  
Definir el canal IPC, el tipo de request y el tipo de response para la operación de creación de rama.

**Tasks:**

- **Task 1.1:** Agregar `GIT_CREATE_BRANCH` a `IPC_CHANNELS`
  - **Assigned to:** Developer
  - **Dependencies:** ninguna
  - **Detalle:**
    ```ts
    // En IPC_CHANNELS (después de GIT_GET_BRANCH_COMMITS):
    GIT_CREATE_BRANCH: "git:create-branch",
    ```

- **Task 1.2:** Definir tipos de request y response
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1
  - **Detalle:**
    ```ts
    // Request
    export interface GitCreateBranchRequest {
      projectDir: string;
      newBranchName: string;   // nombre validado en frontend, re-validado en backend
      sourceBranch: string;    // rama base (puede ser la actual u otra local)
    }

    // Response (éxito)
    export interface GitCreateBranchSuccess {
      ok: true;
      branch: string;          // nombre de la rama creada
      checkedOut: boolean;     // siempre true (checkout automático)
    }

    // Response (unión)
    export type GitCreateBranchResponse =
      | GitCreateBranchSuccess
      | GitOperationError;
    ```

- **Task 1.3:** Agregar `gitCreateBranch` al tipo del bridge (`AgentsFlowBridge`)
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.2
  - **Detalle:** Buscar la interfaz `AgentsFlowBridge` (o equivalente) en `bridge.types.ts` y agregar:
    ```ts
    gitCreateBranch(req: GitCreateBranchRequest): Promise<GitCreateBranchResponse>;
    ```

---

### 🔹 Phase 2: Backend — `git-branches.ts`

**Description:**  
Implementar la función `createBranch()` en el proceso principal de Electron y registrar su handler IPC.

**Tasks:**

- **Task 2.1:** Implementar función `createBranch()`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 1 completa
  - **Detalle de lógica:**

    ```ts
    async function createBranch(
      projectDir: string,
      newBranchName: string,
      sourceBranch: string,
    ): Promise<GitCreateBranchResponse> {
      // 1. Verificar que es un repo git
      const repoError = ensureGitRepo(projectDir);
      if (repoError) return repoError;

      // 2. Re-validar nombre en backend (defensa en profundidad)
      const trimmed = newBranchName.trim();
      if (!trimmed || !/^[a-zA-Z0-9][a-zA-Z0-9\-]*$/.test(trimmed)) {
        return gitError("E_INVALID_BRANCH_NAME", `Invalid branch name: '${trimmed}'.`);
      }
      const PROTECTED = ["main", "master"];
      if (PROTECTED.includes(trimmed.toLowerCase())) {
        return gitError("E_INVALID_BRANCH_NAME", `Cannot create a branch named '${trimmed}'.`);
      }

      // 3. Verificar que la rama base existe
      const sourceRes = await runGit(projectDir, ["rev-parse", "--verify", sourceBranch]);
      if (sourceRes.exitCode !== 0) {
        return gitError("E_BRANCH_NOT_FOUND", `Source branch '${sourceBranch}' does not exist.`);
      }

      // 4. Verificar que la nueva rama NO existe ya
      const existsRes = await runGit(projectDir, ["rev-parse", "--verify", trimmed]);
      if (existsRes.exitCode === 0) {
        return gitError("E_BRANCH_ALREADY_EXISTS", `Branch '${trimmed}' already exists.`);
      }

      // 5. Crear la rama y hacer checkout en un solo comando
      const createRes = await runGit(projectDir, ["checkout", "-b", trimmed, sourceBranch]);
      if (createRes.exitCode !== 0) {
        return toGitError(createRes, `Failed to create branch '${trimmed}'.`);
      }

      return { ok: true, branch: trimmed, checkedOut: true };
    }
    ```

- **Task 2.2:** Agregar nuevo código de error `E_BRANCH_ALREADY_EXISTS` e `E_INVALID_BRANCH_NAME`
  - **Assigned to:** Developer
  - **Dependencies:** Task 2.1
  - **Detalle:** Agregar a `GitOperationErrorCode` en `bridge.types.ts`:
    ```ts
    | "E_BRANCH_ALREADY_EXISTS"
    | "E_INVALID_BRANCH_NAME"
    ```

- **Task 2.3:** Registrar el handler IPC en `registerGitBranchesHandlers()`
  - **Assigned to:** Developer
  - **Dependencies:** Task 2.1
  - **Detalle:**
    ```ts
    ipcMain.handle(
      IPC_CHANNELS.GIT_CREATE_BRANCH,
      async (_event, req: GitCreateBranchRequest) => {
        return createBranch(req.projectDir, req.newBranchName, req.sourceBranch);
      },
    );
    ```

---

### 🔹 Phase 3: Hook — `useGitBranches.ts`

**Description:**  
Extender el hook existente con estado y acción para la creación de ramas.

**Tasks:**

- **Task 3.1:** Agregar campos al estado `GitBranchesState`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 1 completa
  - **Detalle:**
    ```ts
    // Campos nuevos en GitBranchesState:
    isCreatingBranch: boolean;
    createBranchError: string | null;
    lastCreateBranchSuccess: string | null;  // nombre de la rama creada
    ```

- **Task 3.2:** Agregar acciones al union type `GitBranchesAction`
  - **Assigned to:** Developer
  - **Dependencies:** Task 3.1
  - **Detalle:**
    ```ts
    | { type: "CREATE_BRANCH_START" }
    | { type: "CREATE_BRANCH_SUCCESS"; branch: string }
    | { type: "CREATE_BRANCH_ERROR"; error: string }
    ```

- **Task 3.3:** Agregar casos al `reducer`
  - **Assigned to:** Developer
  - **Dependencies:** Task 3.2
  - **Detalle:**
    ```ts
    case "CREATE_BRANCH_START":
      return { ...state, isCreatingBranch: true, createBranchError: null, lastCreateBranchSuccess: null };
    case "CREATE_BRANCH_SUCCESS":
      return { ...state, isCreatingBranch: false, createBranchError: null, lastCreateBranchSuccess: action.branch };
    case "CREATE_BRANCH_ERROR":
      return { ...state, isCreatingBranch: false, createBranchError: action.error };
    ```
    También extender `CLEAR_ERRORS` para limpiar `createBranchError` y `lastCreateBranchSuccess`.

- **Task 3.4:** Agregar mapeo de nuevos errores en `mapGitErrorToMessage()`
  - **Assigned to:** Developer
  - **Dependencies:** Task 2.2
  - **Detalle:**
    ```ts
    case "E_BRANCH_ALREADY_EXISTS":
      return "A branch with that name already exists.";
    case "E_INVALID_BRANCH_NAME":
      return error.message || "Invalid branch name.";
    ```

- **Task 3.5:** Implementar callback `createBranch` en el hook
  - **Assigned to:** Developer
  - **Dependencies:** Tasks 3.1–3.4
  - **Detalle:**
    ```ts
    const createBranch = useCallback(
      async (newBranchName: string, sourceBranch: string) => {
        if (!projectDir || !newBranchName || !sourceBranch) return;
        const bridge = getBridge();
        if (!bridge) {
          dispatch({ type: "CREATE_BRANCH_ERROR", error: "Electron bridge unavailable." });
          return;
        }

        dispatch({ type: "CREATE_BRANCH_START" });
        const res = await bridge.gitCreateBranch({ projectDir, newBranchName, sourceBranch });
        if (!res.ok) {
          dispatch({ type: "CREATE_BRANCH_ERROR", error: mapGitErrorToMessage(res) });
          return;
        }

        dispatch({ type: "CREATE_BRANCH_SUCCESS", branch: res.branch });
        // Recargar lista de ramas y diff remoto para reflejar la nueva rama
        await loadBranches();
        await loadRemoteDiff();
      },
      [projectDir, loadBranches, loadRemoteDiff],
    );
    ```

- **Task 3.6:** Exponer `createBranch` en el return del hook
  - **Assigned to:** Developer
  - **Dependencies:** Task 3.5

---

### 🔹 Phase 4: UI — `GitBranchesPanel.tsx`

**Description:**  
Crear el componente `BranchCreatorSection` e integrarlo como segunda subsección en `GitBranchesPanel`.

**Tasks:**

- **Task 4.1:** Definir la interfaz de props de `BranchCreatorSection`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 3 completa
  - **Detalle:**
    ```ts
    interface BranchCreatorSectionProps {
      currentBranch: string;
      allLocalBranches: GitBranch[];   // todas las ramas locales (sin filtrar main/master)
      isCreatingBranch: boolean;
      createBranchError: string | null;
      lastCreateBranchSuccess: string | null;
      onCreateBranch: (newName: string, sourceBranch: string) => void;
    }
    ```

- **Task 4.2:** Implementar estado local del componente
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.1
  - **Detalle — estado interno con `useState`:**
    ```ts
    const [newBranchName, setNewBranchName] = useState("");
    const [sourceBranch, setSourceBranch] = useState(props.currentBranch);
    const [validationError, setValidationError] = useState<string | null>(null);
    ```
    - `sourceBranch` se inicializa con `currentBranch` y se actualiza si `currentBranch` cambia (via `useEffect`).

- **Task 4.3:** Implementar lógica de validación en tiempo real
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.2
  - **Detalle — función `validateBranchName(name, existingNames)`:**

    | Condición | Mensaje de error |
    |-----------|-----------------|
    | Vacío | `null` (sin mensaje, botón deshabilitado) |
    | Contiene espacios | `"Branch name cannot contain spaces."` |
    | Caracteres inválidos (no `[a-zA-Z0-9\-]`) | `"Only letters, numbers and hyphens are allowed."` |
    | Empieza con guión | `"Branch name cannot start with a hyphen."` |
    | Termina con guión | `"Branch name cannot end with a hyphen."` |
    | Doble guión `--` | `"Branch name cannot contain consecutive hyphens."` |
    | Es `main` o `master` (case-insensitive) | `"Cannot use 'main' or 'master' as branch name."` |
    | Ya existe en ramas locales | `"A branch with this name already exists."` |
    | Válido | `null` |

    La validación se ejecuta en el `onChange` del input (sin debounce — es síncrona y barata).

- **Task 4.4:** Implementar el componente `BranchCreatorSection`
  - **Assigned to:** Developer
  - **Dependencies:** Tasks 4.1–4.3
  - **Estructura JSX:**

    ```tsx
    <section
      className="git-branches__section"
      aria-labelledby="git-branches-creator-title"
    >
      <header className="git-branches__section-header">
        <h3 id="git-branches-creator-title" className="git-branches__section-title">
          Create Branch
        </h3>
      </header>

      {/* Selector de rama base */}
      <div className="git-branches__creator-row">
        <label htmlFor="git-branches-source-select" className="git-branches__creator-label">
          From:
        </label>
        <select
          id="git-branches-source-select"
          className="git-branches__select"
          value={sourceBranch}
          onChange={(e) => setSourceBranch(e.target.value)}
          disabled={isCreatingBranch}
          aria-label="Source branch"
        >
          {allLocalBranches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}{b.isCurrent ? " (current)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Input de nombre */}
      <div className="git-branches__creator-row">
        <label htmlFor="git-branches-new-name" className="git-branches__creator-label">
          New branch:
        </label>
        <input
          id="git-branches-new-name"
          type="text"
          className={`git-branches__input${validationError ? " git-branches__input--error" : ""}`}
          value={newBranchName}
          onChange={handleNameChange}
          placeholder="feature/my-branch"
          disabled={isCreatingBranch}
          aria-describedby={validationError ? "git-branches-name-error" : undefined}
          aria-invalid={validationError ? "true" : "false"}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isFormValid) handleCreate();
          }}
        />
      </div>

      {/* Error de validación inline */}
      {validationError && (
        <p
          id="git-branches-name-error"
          className="git-branches__validation-error"
          role="alert"
          aria-live="assertive"
        >
          {validationError}
        </p>
      )}

      {/* Botón crear */}
      <div className="git-branches__creator-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!isFormValid || isCreatingBranch}
          onClick={handleCreate}
          aria-busy={isCreatingBranch}
        >
          {isCreatingBranch ? "Creating…" : "⎇ Create & Checkout"}
        </button>
      </div>

      {/* Feedback de error de operación */}
      {createBranchError && (
        <div className="git-branches__error-banner" role="alert">
          {createBranchError}
        </div>
      )}

      {/* Feedback de éxito */}
      {lastCreateBranchSuccess && (
        <div className="git-branches__success-banner" role="status">
          ✓ Branch '{lastCreateBranchSuccess}' created and checked out.
        </div>
      )}
    </section>
    ```

- **Task 4.5:** Integrar `BranchCreatorSection` en `GitBranchesPanel`
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.4
  - **Posición:** Insertar **después** de `BranchSelectorSection` y **antes** de `BranchCommitsSection`, separada por `<div className="git-branches__divider" />`.
  - **Props a pasar:**
    - `currentBranch={state.currentBranch}`
    - `allLocalBranches={state.branches.filter(b => !b.isRemote)}` — todas las locales, incluyendo main/master como opciones de base
    - `isCreatingBranch={state.isCreatingBranch}`
    - `createBranchError={state.createBranchError}`
    - `lastCreateBranchSuccess={state.lastCreateBranchSuccess}`
    - `onCreateBranch={(name, source) => { void createBranch(name, source); }}`

- **Task 4.6:** Auto-limpiar mensajes de éxito tras 3 segundos
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.5
  - **Detalle:** Extender el `useEffect` existente en `GitBranchesPanel` que ya limpia `lastFetchPullSuccess` y `lastCheckoutSuccess`:
    ```ts
    useEffect(() => {
      if (!state.lastFetchPullSuccess && !state.lastCheckoutSuccess && !state.lastCreateBranchSuccess) return;
      const timeoutId = window.setTimeout(() => { clearErrors(); }, 3000);
      return () => window.clearTimeout(timeoutId);
    }, [state.lastFetchPullSuccess, state.lastCheckoutSuccess, state.lastCreateBranchSuccess, clearErrors]);
    ```

- **Task 4.7:** Limpiar el input tras creación exitosa
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.5
  - **Detalle:** En `BranchCreatorSection`, usar `useEffect` que observe `lastCreateBranchSuccess`:
    ```ts
    useEffect(() => {
      if (props.lastCreateBranchSuccess) {
        setNewBranchName("");
        setValidationError(null);
      }
    }, [props.lastCreateBranchSuccess]);
    ```

---

### 🔹 Phase 5: Estilos CSS

**Description:**  
Agregar las clases CSS necesarias para los nuevos elementos, siguiendo la convención BEM existente.

**Tasks:**

- **Task 5.1:** Agregar clases nuevas al stylesheet de `GitBranchesPanel`
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.4
  - **Clases a agregar:**

    | Clase | Propósito |
    |-------|-----------|
    | `.git-branches__creator-row` | Fila de label + control (flexbox, gap, align-items: center) |
    | `.git-branches__creator-label` | Label de los campos del creador (font-size pequeño, color muted) |
    | `.git-branches__creator-actions` | Contenedor del botón crear (margin-top) |
    | `.git-branches__input` | Input de texto (mismo estilo que `.git-branches__select`) |
    | `.git-branches__input--error` | Modificador: borde rojo cuando hay error de validación |
    | `.git-branches__validation-error` | Mensaje de error inline (color rojo, font-size pequeño) |

---

### 🔹 Phase 6: Preload — `preload.ts`

**Description:**  
Exponer el nuevo canal IPC en el bridge del preload para que el renderer pueda invocarlo.

**Tasks:**

- **Task 6.1:** Agregar `gitCreateBranch` al objeto expuesto en `contextBridge.exposeInMainWorld`
  - **Assigned to:** Developer
  - **Dependencies:** Phase 1 completa
  - **Detalle:** Buscar el bloque donde se exponen `gitListBranches`, `gitCheckoutBranch`, etc., y agregar:
    ```ts
    gitCreateBranch: (req: GitCreateBranchRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_BRANCH, req),
    ```

---

## 📐 Especificaciones Técnicas Detalladas

### Regex de validación de nombre de rama (frontend)

```ts
// Regla completa (aplicar en orden):
const BRANCH_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
// Equivalente a: empieza y termina con alfanumérico, medio puede tener guiones
// No permite: espacios, puntos, ~, ^, :, ?, *, [, \, doble guión
```

> **Nota:** Git tiene reglas más complejas para nombres de ramas (ver `git check-ref-format`). Para el MVP, la regex anterior cubre los casos más comunes. El backend puede usar `git check-ref-format --branch <name>` como validación adicional si se desea mayor robustez.

### Flujo de datos completo

```
Usuario escribe nombre
  → onChange → validateBranchName() → setValidationError()
  → isFormValid = !validationError && newBranchName.length > 0

Usuario hace click en "Create & Checkout" (o Enter)
  → onCreateBranch(newBranchName, sourceBranch)
  → useGitBranches.createBranch()
    → dispatch CREATE_BRANCH_START
    → bridge.gitCreateBranch({ projectDir, newBranchName, sourceBranch })
      → IPC → git-branches.ts → createBranch()
        → ensureGitRepo()
        → re-validar nombre
        → git rev-parse --verify <sourceBranch>
        → git rev-parse --verify <newBranchName>  (debe fallar)
        → git checkout -b <newBranchName> <sourceBranch>
        → return { ok: true, branch, checkedOut: true }
    → dispatch CREATE_BRANCH_SUCCESS
    → loadBranches() + loadRemoteDiff()
  → BranchCreatorSection recibe lastCreateBranchSuccess
    → limpiar input
    → mostrar banner de éxito (auto-desaparece en 3s)
```

### Edge Cases cubiertos

| Caso | Manejo |
|------|--------|
| Nombre vacío | Botón deshabilitado, sin mensaje de error |
| Nombre con espacios | Error inline inmediato |
| Nombre = `main` o `master` | Error inline inmediato |
| Nombre ya existe (local) | Error inline inmediato (validado contra `allLocalBranches`) |
| Nombre ya existe (detectado por git) | Error de operación desde backend (`E_BRANCH_ALREADY_EXISTS`) |
| Rama base no existe | Error de operación desde backend (`E_BRANCH_NOT_FOUND`) |
| Working dir sucio | Error de operación desde backend (`E_DIRTY_WORKING_DIR`) |
| Git no instalado | Error de operación desde backend (`E_GIT_NOT_FOUND`) |
| Timeout | Error de operación desde backend (`E_TIMEOUT`) |
| No es repo git | Error de operación desde backend (`E_NOT_A_GIT_REPO`) |
| Bridge no disponible | Error de operación: "Electron bridge unavailable." |
| Creación exitosa | Input limpiado, banner de éxito 3s, lista de ramas recargada |
| `currentBranch` cambia externamente | `sourceBranch` se resetea via `useEffect` |

---

## 🎨 Recomendaciones de UX

1. **Orden visual del selector "From":** Mostrar la rama actual primero (con etiqueta `(current)`), luego el resto ordenadas alfabéticamente.

2. **Placeholder del input:** Usar `feature/my-branch` como placeholder para guiar al usuario sobre el formato esperado.

3. **Feedback inmediato:** La validación debe ser en tiempo real (onChange), no al perder el foco (onBlur), para que el usuario vea el error mientras escribe.

4. **Botón deshabilitado vs. error:** Cuando el campo está vacío, el botón está deshabilitado pero NO se muestra mensaje de error (no es un error, es un estado inicial). El mensaje de error solo aparece cuando hay contenido inválido.

5. **Enter para crear:** Permitir `Enter` en el input para disparar la creación (si el formulario es válido), mejora la fluidez del teclado.

6. **Aria-busy en el botón:** Usar `aria-busy={isCreatingBranch}` para que lectores de pantalla anuncien el estado de carga.

7. **Limpiar error de operación al escribir:** Cuando el usuario modifica el nombre después de un error de operación (ej. conflicto detectado por git), limpiar `createBranchError` para no confundir.

8. **Posición de la sección:** Colocarla entre `BranchSelectorSection` y `BranchCommitsSection` es correcto — el usuario primero ve las ramas existentes, luego puede crear una nueva, y finalmente ver los commits.

9. **Nombre del botón:** `"⎇ Create & Checkout"` es más descriptivo que solo `"Create"` — deja claro que la acción también cambia a la nueva rama.

10. **Accesibilidad del selector de fuente:** Incluir `aria-label="Source branch"` en el `<select>` y asociar el `<label>` con `htmlFor`.

---

## ⚠️ Riesgos

- **Desincronización de ramas:** Si el usuario crea una rama desde otra ventana/terminal mientras el modal está abierto, la lista de ramas existentes puede estar desactualizada. Mitigación: el backend re-valida con `git rev-parse --verify` antes de crear.

- **Nombres con caracteres especiales de git:** La regex del frontend no cubre todos los caracteres prohibidos por git (ej. `..`, `.lock`, `@{`, etc.). Mitigación: el backend puede agregar `git check-ref-format --branch <name>` como validación adicional en una iteración futura.

- **Rama base eliminada entre selección y creación:** Si el usuario selecciona una rama base y esta es eliminada antes de hacer click en crear, el backend retornará `E_BRANCH_NOT_FOUND`. El mensaje de error es claro.

- **Working directory sucio:** Si hay cambios sin commitear, `git checkout -b` puede fallar. El backend detecta esto con `isDirtyWorkingDir()` y retorna `E_DIRTY_WORKING_DIR` con mensaje claro.

---

## 📝 Notas

- **No se requiere push automático:** La rama se crea solo localmente. El usuario puede hacer push manualmente desde la sección `RemoteChangesSection` o desde la terminal.

- **`allLocalBranches` incluye `main`/`master` como opciones de base:** Es válido crear una rama a partir de `main`. Solo se excluyen de la lista de ramas *destino* (no se puede crear una rama llamada `main`).

- **Reutilizar `checkoutBranch` existente vs. `git checkout -b`:** Se usa `git checkout -b <name> <source>` en un solo comando para atomicidad. No se reutiliza la función `checkoutBranch` existente porque esa asume que la rama ya existe.

- **Preload:** Verificar que el tipo `AgentsFlowBridge` en `bridge.types.ts` (o donde esté definido el tipo del objeto expuesto) incluya `gitCreateBranch`. Si el tipo está en `preload.ts` directamente, actualizar allí también.

---

## 📁 Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/electron/bridge.types.ts` | Agregar `GIT_CREATE_BRANCH` a `IPC_CHANNELS`, tipos `GitCreateBranchRequest`, `GitCreateBranchSuccess`, `GitCreateBranchResponse`, códigos de error nuevos, método en `AgentsFlowBridge` |
| `src/electron/git-branches.ts` | Implementar `createBranch()`, registrar handler IPC |
| `src/electron/preload.ts` | Exponer `gitCreateBranch` en `contextBridge` |
| `src/ui/hooks/useGitBranches.ts` | Agregar estado, acciones, reducer cases y callback `createBranch` |
| `src/ui/components/GitIntegrationModal/GitBranchesPanel.tsx` | Agregar `BranchCreatorSection`, integrarla en `GitBranchesPanel` |
| `src/ui/components/GitIntegrationModal/GitBranchesPanel.css` *(o equivalente)* | Agregar clases CSS nuevas |

---

## 🗂️ Ruta de este documento

```
docs/plans/git-branch-creator-feature.md
```
