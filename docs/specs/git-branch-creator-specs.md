# 📋 Especificaciones Técnicas — BranchCreatorSection

> **Feature:** Creador de Ramas (Branch Creator)  
> **Módulo:** `GitBranchesPanel` — Segunda subsección de la sección Branches del modal Git  
> **Fecha:** 2026-04-27  
> **Autor:** Weight-Planner  
> **Plan de referencia:** `docs/plans/git-branch-creator-feature.md`

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
GitBranchesPanel
├── RemoteChangesSection          (existente)
├── BranchSelectorSection         (existente)
├── <div className="git-branches__divider" />   ← separador nuevo
├── BranchCreatorSection          ← NUEVO
│   ├── <section> (aria-labelledby)
│   │   ├── <header> / <h3>       — título "Create Branch"
│   │   ├── .git-branches__creator-row  — selector "From:"
│   │   │   ├── <label htmlFor="git-branches-source-select">
│   │   │   └── <select id="git-branches-source-select">
│   │   ├── .git-branches__creator-row  — input nombre
│   │   │   ├── <label htmlFor="git-branches-new-name">
│   │   │   └── <input id="git-branches-new-name" type="text">
│   │   ├── <p id="git-branches-name-error">    — error validación inline (condicional)
│   │   ├── .git-branches__creator-actions
│   │   │   └── <button> "⎇ Create & Checkout"
│   │   ├── .git-branches__error-banner         — error de operación (condicional)
│   │   └── .git-branches__success-banner       — éxito (condicional)
└── BranchCommitsSection          (existente)
```

---

### 1.2 Props de `BranchCreatorSection`

```ts
interface BranchCreatorSectionProps {
  /** Nombre de la rama actualmente activa (checked out). */
  currentBranch: string;

  /** Todas las ramas locales (sin filtrar main/master).
   *  Se usan como opciones del selector "From:" y para validar duplicados. */
  allLocalBranches: GitBranch[];

  /** true mientras la operación IPC está en curso. */
  isCreatingBranch: boolean;

  /** Mensaje de error proveniente del backend/hook. null si no hay error. */
  createBranchError: string | null;

  /** Nombre de la última rama creada exitosamente. null si no aplica. */
  lastCreateBranchSuccess: string | null;

  /** Callback que dispara la creación de la rama. */
  onCreateBranch: (newName: string, sourceBranch: string) => void;
}
```

**Restricciones de props:**

| Prop | Tipo | Requerida | Notas |
|------|------|-----------|-------|
| `currentBranch` | `string` | ✅ | Nunca vacío; es la rama activa del repo |
| `allLocalBranches` | `GitBranch[]` | ✅ | Incluye `main`/`master` como opciones de base |
| `isCreatingBranch` | `boolean` | ✅ | Controla disabled de controles y texto del botón |
| `createBranchError` | `string \| null` | ✅ | Mensaje ya mapeado a lenguaje legible |
| `lastCreateBranchSuccess` | `string \| null` | ✅ | Nombre de la rama creada (no mensaje) |
| `onCreateBranch` | `function` | ✅ | Debe ser estable (useCallback en el hook) |

---

### 1.3 Estado interno del componente (`useState`)

```ts
const [newBranchName, setNewBranchName] = useState<string>("");
const [sourceBranch, setSourceBranch]   = useState<string>(props.currentBranch);
const [validationError, setValidationError] = useState<string | null>(null);
```

**Reglas de sincronización de estado interno:**

- `sourceBranch` se inicializa con `props.currentBranch`.
- Si `props.currentBranch` cambia externamente (ej. checkout desde otra sección), `sourceBranch` se resetea via `useEffect`:

```ts
useEffect(() => {
  setSourceBranch(props.currentBranch);
}, [props.currentBranch]);
```

- Tras una creación exitosa (`props.lastCreateBranchSuccess` cambia a no-null), limpiar el input y el error de validación:

```ts
useEffect(() => {
  if (props.lastCreateBranchSuccess) {
    setNewBranchName("");
    setValidationError(null);
  }
}, [props.lastCreateBranchSuccess]);
```

---

### 1.4 Variable derivada `isFormValid`

```ts
const isFormValid = newBranchName.length > 0 && validationError === null;
```

Esta variable controla el estado `disabled` del botón y si `Enter` dispara la acción.

---

## 2. Flujos de Validación y UX

### 2.1 Validación en tiempo real (frontend)

La validación se ejecuta en el handler `onChange` del input. Es **síncrona** (sin debounce), ya que las reglas son puramente computacionales.

```ts
function validateBranchName(
  name: string,
  existingNames: string[]
): string | null {
  if (name.length === 0) return null;                          // vacío → sin error (botón deshabilitado)
  if (/\s/.test(name))
    return "Branch name cannot contain spaces.";
  if (!/^[a-zA-Z0-9\-]+$/.test(name))
    return "Only letters, numbers and hyphens are allowed.";
  if (name.startsWith("-"))
    return "Branch name cannot start with a hyphen.";
  if (name.endsWith("-"))
    return "Branch name cannot end with a hyphen.";
  if (/--/.test(name))
    return "Branch name cannot contain consecutive hyphens.";
  if (["main", "master"].includes(name.toLowerCase()))
    return "Cannot use 'main' or 'master' as branch name.";
  if (existingNames.includes(name))
    return "A branch with this name already exists.";
  return null;
}
```

**Tabla de reglas de validación (orden de evaluación):**

| # | Condición | Mensaje de error |
|---|-----------|-----------------|
| 1 | Campo vacío | `null` — sin mensaje, botón deshabilitado |
| 2 | Contiene espacios | `"Branch name cannot contain spaces."` |
| 3 | Caracteres no permitidos (no `[a-zA-Z0-9\-]`) | `"Only letters, numbers and hyphens are allowed."` |
| 4 | Empieza con guión `-` | `"Branch name cannot start with a hyphen."` |
| 5 | Termina con guión `-` | `"Branch name cannot end with a hyphen."` |
| 6 | Doble guión `--` | `"Branch name cannot contain consecutive hyphens."` |
| 7 | Es `main` o `master` (case-insensitive) | `"Cannot use 'main' or 'master' as branch name."` |
| 8 | Ya existe en ramas locales | `"A branch with this name already exists."` |
| — | Ninguna condición anterior | `null` — válido |

> **Nota:** La regex del frontend no cubre todos los caracteres prohibidos por git (ej. `..`, `.lock`, `@{`). El backend actúa como segunda línea de defensa.

---

### 2.2 Handler `onChange` del input

```ts
const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setNewBranchName(value);
  setValidationError(
    validateBranchName(value, props.allLocalBranches.map(b => b.name))
  );
};
```

---

### 2.3 Handler `handleCreate`

```ts
const handleCreate = () => {
  if (!isFormValid || props.isCreatingBranch) return;
  props.onCreateBranch(newBranchName, sourceBranch);
};
```

---

### 2.4 Flujo de datos completo (end-to-end)

```
Usuario escribe nombre en el input
  → onChange → validateBranchName() → setValidationError()
  → isFormValid = !validationError && newBranchName.length > 0

Usuario hace click en "⎇ Create & Checkout" (o presiona Enter con formulario válido)
  → handleCreate()
  → props.onCreateBranch(newBranchName, sourceBranch)
    → useGitBranches.createBranch(newBranchName, sourceBranch)
      → dispatch({ type: "CREATE_BRANCH_START" })
        → isCreatingBranch = true, controles deshabilitados
      → bridge.gitCreateBranch({ projectDir, newBranchName, sourceBranch })
        → IPC → git-branches.ts → createBranch()
          → ensureGitRepo(projectDir)
          → re-validar nombre (backend)
          → git rev-parse --verify <sourceBranch>
          → git rev-parse --verify <newBranchName>  (debe fallar → rama no existe)
          → git checkout -b <newBranchName> <sourceBranch>
          → return { ok: true, branch: newBranchName, checkedOut: true }
      → dispatch({ type: "CREATE_BRANCH_SUCCESS", branch })
        → lastCreateBranchSuccess = branch
      → loadBranches()   ← recarga lista de ramas
      → loadRemoteDiff() ← recarga diff remoto

  BranchCreatorSection recibe lastCreateBranchSuccess (via props)
    → useEffect limpia input y validationError
    → muestra .git-branches__success-banner
    → GitBranchesPanel auto-limpia el banner tras 3 segundos (clearErrors)
```

---

### 2.5 Reglas de UX

| Regla | Descripción |
|-------|-------------|
| **Validación inmediata** | Validar en `onChange`, no en `onBlur`. El usuario ve el error mientras escribe. |
| **Botón vacío ≠ error** | Cuando el campo está vacío, el botón está deshabilitado pero NO se muestra mensaje de error. |
| **Enter para crear** | `onKeyDown` en el input: si `e.key === "Enter"` y `isFormValid`, disparar `handleCreate()`. |
| **Orden del selector "From"** | La rama actual aparece primero con etiqueta `(current)`, el resto ordenadas alfabéticamente. |
| **Placeholder descriptivo** | Usar `feature/my-branch` como placeholder del input. |
| **Texto del botón en carga** | Cambiar a `"Creating…"` mientras `isCreatingBranch === true`. |
| **Limpiar error de operación al escribir** | Si hay `createBranchError` y el usuario modifica el nombre, el error de operación debe limpiarse para no confundir. Implementar en `handleNameChange` o via `useEffect`. |
| **Auto-limpiar banner de éxito** | El banner de éxito desaparece automáticamente tras 3 segundos (gestionado en `GitBranchesPanel`). |
| **Posición de la sección** | Entre `BranchSelectorSection` y `BranchCommitsSection`, separada por `.git-branches__divider`. |

---

## 3. Lógica de Integración con Git (IPC/Backend)

### 3.1 Contrato IPC — `bridge.types.ts`

#### Canal IPC

```ts
// En IPC_CHANNELS (después de GIT_GET_BRANCH_COMMITS):
GIT_CREATE_BRANCH: "git:create-branch",
```

#### Tipos de request y response

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

#### Nuevos códigos de error

```ts
// Agregar a GitOperationErrorCode:
| "E_BRANCH_ALREADY_EXISTS"
| "E_INVALID_BRANCH_NAME"
```

#### Método en `AgentsFlowBridge`

```ts
gitCreateBranch(req: GitCreateBranchRequest): Promise<GitCreateBranchResponse>;
```

---

### 3.2 Backend — `git-branches.ts`

#### Función `createBranch()`

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

  // 5. Crear la rama y hacer checkout en un solo comando (atómico)
  const createRes = await runGit(projectDir, ["checkout", "-b", trimmed, sourceBranch]);
  if (createRes.exitCode !== 0) {
    return toGitError(createRes, `Failed to create branch '${trimmed}'.`);
  }

  return { ok: true, branch: trimmed, checkedOut: true };
}
```

#### Handler IPC

```ts
ipcMain.handle(
  IPC_CHANNELS.GIT_CREATE_BRANCH,
  async (_event, req: GitCreateBranchRequest) => {
    return createBranch(req.projectDir, req.newBranchName, req.sourceBranch);
  },
);
```

> **Dónde registrar:** Dentro de `registerGitBranchesHandlers()`, junto a los demás handlers de ramas.

---

### 3.3 Preload — `preload.ts`

```ts
// Agregar junto a gitListBranches, gitCheckoutBranch, etc.:
gitCreateBranch: (req: GitCreateBranchRequest) =>
  ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_BRANCH, req),
```

> **Verificar:** Si el tipo `AgentsFlowBridge` está definido en `preload.ts` directamente (y no solo en `bridge.types.ts`), actualizar también allí.

---

### 3.4 Hook — `useGitBranches.ts`

#### Nuevos campos en `GitBranchesState`

```ts
isCreatingBranch: boolean;
createBranchError: string | null;
lastCreateBranchSuccess: string | null;  // nombre de la rama creada
```

#### Nuevas acciones en `GitBranchesAction`

```ts
| { type: "CREATE_BRANCH_START" }
| { type: "CREATE_BRANCH_SUCCESS"; branch: string }
| { type: "CREATE_BRANCH_ERROR"; error: string }
```

#### Nuevos casos en el `reducer`

```ts
case "CREATE_BRANCH_START":
  return {
    ...state,
    isCreatingBranch: true,
    createBranchError: null,
    lastCreateBranchSuccess: null,
  };

case "CREATE_BRANCH_SUCCESS":
  return {
    ...state,
    isCreatingBranch: false,
    createBranchError: null,
    lastCreateBranchSuccess: action.branch,
  };

case "CREATE_BRANCH_ERROR":
  return {
    ...state,
    isCreatingBranch: false,
    createBranchError: action.error,
  };
```

> **Extender `CLEAR_ERRORS`:** Limpiar también `createBranchError` y `lastCreateBranchSuccess` en el case existente.

#### Mapeo de nuevos errores en `mapGitErrorToMessage()`

```ts
case "E_BRANCH_ALREADY_EXISTS":
  return "A branch with that name already exists.";
case "E_INVALID_BRANCH_NAME":
  return error.message || "Invalid branch name.";
```

#### Callback `createBranch` en el hook

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

> **Exponer en el return del hook:** Agregar `createBranch` al objeto retornado por `useGitBranches`.

---

### 3.5 Auto-limpiar mensajes de éxito en `GitBranchesPanel`

```ts
// Extender el useEffect existente que ya limpia lastFetchPullSuccess y lastCheckoutSuccess:
useEffect(() => {
  if (
    !state.lastFetchPullSuccess &&
    !state.lastCheckoutSuccess &&
    !state.lastCreateBranchSuccess
  ) return;
  const timeoutId = window.setTimeout(() => { clearErrors(); }, 3000);
  return () => window.clearTimeout(timeoutId);
}, [
  state.lastFetchPullSuccess,
  state.lastCheckoutSuccess,
  state.lastCreateBranchSuccess,
  clearErrors,
]);
```

---

## 4. Edge Cases y Manejo de Errores

### 4.1 Tabla completa de edge cases

| Caso | Origen | Manejo |
|------|--------|--------|
| Nombre vacío | Frontend | Botón deshabilitado, sin mensaje de error |
| Nombre con espacios | Frontend | Error inline inmediato en el input |
| Caracteres inválidos | Frontend | Error inline inmediato en el input |
| Empieza/termina con guión | Frontend | Error inline inmediato en el input |
| Doble guión `--` | Frontend | Error inline inmediato en el input |
| Nombre = `main` o `master` | Frontend | Error inline inmediato en el input |
| Nombre ya existe (lista local) | Frontend | Error inline inmediato (validado contra `allLocalBranches`) |
| Nombre ya existe (detectado por git) | Backend | Error de operación: `"A branch with that name already exists."` |
| Nombre inválido según git | Backend | Error de operación: `"Invalid branch name."` |
| Rama base no existe | Backend | Error de operación: `"Source branch '...' does not exist."` |
| Working directory sucio | Backend | Error de operación: mensaje de `E_DIRTY_WORKING_DIR` |
| Git no instalado | Backend | Error de operación: mensaje de `E_GIT_NOT_FOUND` |
| Timeout de operación git | Backend | Error de operación: mensaje de `E_TIMEOUT` |
| No es repo git | Backend | Error de operación: mensaje de `E_NOT_A_GIT_REPO` |
| Bridge no disponible | Hook | Error de operación: `"Electron bridge unavailable."` |
| `currentBranch` cambia externamente | Frontend | `sourceBranch` se resetea via `useEffect` |
| Creación exitosa | Hook + UI | Input limpiado, banner de éxito 3s, lista de ramas recargada |
| Lista de ramas desactualizada | Backend | Re-valida con `git rev-parse --verify` antes de crear |
| Rama base eliminada entre selección y creación | Backend | Retorna `E_BRANCH_NOT_FOUND` con mensaje claro |

---

### 4.2 Jerarquía de errores

```
Nivel 1 — Validación frontend (síncrona, inmediata)
  └── Mostrar en: .git-branches__validation-error (inline bajo el input)
      Atributos: role="alert", aria-live="assertive"

Nivel 2 — Error de operación IPC (asíncrono, del backend/hook)
  └── Mostrar en: .git-branches__error-banner
      Atributos: role="alert"
      Limpieza: manual al escribir de nuevo, o al intentar otra operación
```

---

### 4.3 Comportamiento del botón según estado

| Estado | `disabled` | Texto |
|--------|-----------|-------|
| Campo vacío | ✅ | `"⎇ Create & Checkout"` |
| Validación con error | ✅ | `"⎇ Create & Checkout"` |
| Formulario válido | ❌ | `"⎇ Create & Checkout"` |
| Operación en curso | ✅ | `"Creating…"` |

---

## 5. Accesibilidad

### 5.1 Roles y atributos ARIA

| Elemento | Atributo | Valor | Propósito |
|----------|----------|-------|-----------|
| `<section>` | `aria-labelledby` | `"git-branches-creator-title"` | Asocia la sección con su título |
| `<h3>` | `id` | `"git-branches-creator-title"` | Título de la sección para lectores de pantalla |
| `<select>` | `id` | `"git-branches-source-select"` | Asociado con su `<label>` |
| `<select>` | `aria-label` | `"Source branch"` | Descripción adicional para lectores de pantalla |
| `<label>` (From) | `htmlFor` | `"git-branches-source-select"` | Asociación explícita label-control |
| `<input>` | `id` | `"git-branches-new-name"` | Asociado con su `<label>` |
| `<input>` | `aria-describedby` | `"git-branches-name-error"` (condicional) | Apunta al mensaje de error cuando existe |
| `<input>` | `aria-invalid` | `"true"` / `"false"` | Indica estado de validación |
| `<label>` (New branch) | `htmlFor` | `"git-branches-new-name"` | Asociación explícita label-control |
| `<p>` error validación | `id` | `"git-branches-name-error"` | Referenciado por `aria-describedby` del input |
| `<p>` error validación | `role` | `"alert"` | Anuncio inmediato al lector de pantalla |
| `<p>` error validación | `aria-live` | `"assertive"` | Interrumpe para anunciar el error |
| `<button>` | `aria-busy` | `{isCreatingBranch}` | Anuncia estado de carga |
| `.git-branches__error-banner` | `role` | `"alert"` | Anuncio inmediato de error de operación |
| `.git-branches__success-banner` | `role` | `"status"` | Anuncio no-interrumpido de éxito |

---

### 5.2 Navegación por teclado

| Acción | Comportamiento esperado |
|--------|------------------------|
| `Tab` | Navega entre: selector "From" → input nombre → botón |
| `Enter` en el input | Dispara `handleCreate()` si `isFormValid === true` |
| `Space` / `Enter` en el botón | Dispara `handleCreate()` |
| `Escape` | No tiene comportamiento especial en esta sección |

---

### 5.3 Atributos adicionales del input

```tsx
<input
  autoComplete="off"
  spellCheck={false}
  // Evita sugerencias del navegador que no aplican a nombres de ramas
/>
```

---

## 6. Reglas de Estilos / CSS

### 6.1 Convención BEM del módulo

Prefijo base: `.git-branches__`  
Variantes de botón: `.btn.btn--<variante>`

---

### 6.2 Clases nuevas a agregar

| Clase CSS | Propósito | Especificación |
|-----------|-----------|----------------|
| `.git-branches__creator-row` | Fila de label + control | `display: flex; align-items: center; gap: <var-gap>;` |
| `.git-branches__creator-label` | Label de los campos del creador | `font-size: <small>; color: <muted>;` — consistente con otros labels del panel |
| `.git-branches__creator-actions` | Contenedor del botón crear | `margin-top: <var-spacing>;` |
| `.git-branches__input` | Input de texto | Mismo estilo visual que `.git-branches__select` (borde, padding, font, background) |
| `.git-branches__input--error` | Modificador: estado de error | `border-color: <color-error>; outline-color: <color-error>;` |
| `.git-branches__validation-error` | Mensaje de error inline | `color: <color-error>; font-size: <small>; margin-top: <var-spacing-xs>;` |

> **Nota:** Los valores exactos de variables CSS (`<var-gap>`, `<color-error>`, etc.) deben tomarse de las variables ya definidas en el stylesheet existente de `GitBranchesPanel.css` para mantener consistencia visual.

---

### 6.3 Clases reutilizadas (existentes)

| Clase | Uso en BranchCreatorSection |
|-------|-----------------------------|
| `.git-branches__section` | Wrapper `<section>` principal |
| `.git-branches__section-header` | `<header>` con el título |
| `.git-branches__section-title` | `<h3>` "Create Branch" |
| `.git-branches__select` | Referencia visual para `.git-branches__input` |
| `.git-branches__divider` | Separador antes de la sección |
| `.git-branches__error-banner` | Banner de error de operación |
| `.git-branches__success-banner` | Banner de éxito |
| `.btn.btn--primary` | Botón "⎇ Create & Checkout" |

---

### 6.4 Regla de modificador de error en el input

```css
.git-branches__input--error {
  border-color: var(--color-error, #e53e3e);
  outline-color: var(--color-error, #e53e3e);
}
```

El modificador se aplica dinámicamente:

```tsx
className={`git-branches__input${validationError ? " git-branches__input--error" : ""}`}
```

---

## 7. Checklist QA

### 7.1 Validación de nombre de rama

- [ ] Campo vacío → botón deshabilitado, sin mensaje de error visible
- [ ] Nombre con espacio (ej. `"my branch"`) → error inline inmediato
- [ ] Nombre con punto (ej. `"my.branch"`) → error inline inmediato
- [ ] Nombre con carácter especial (ej. `"my@branch"`) → error inline inmediato
- [ ] Nombre que empieza con guión (ej. `"-branch"`) → error inline inmediato
- [ ] Nombre que termina con guión (ej. `"branch-"`) → error inline inmediato
- [ ] Nombre con doble guión (ej. `"my--branch"`) → error inline inmediato
- [ ] Nombre `"main"` → error inline inmediato
- [ ] Nombre `"MASTER"` (case-insensitive) → error inline inmediato
- [ ] Nombre igual a una rama local existente → error inline inmediato
- [ ] Nombre válido (ej. `"feature-123"`) → sin error, botón habilitado
- [ ] Nombre de un solo carácter alfanumérico (ej. `"x"`) → válido, botón habilitado

### 7.2 Selector "From"

- [ ] La rama actual aparece primera con etiqueta `(current)`
- [ ] El resto de ramas locales aparecen ordenadas alfabéticamente
- [ ] `main` y `master` aparecen como opciones válidas de base
- [ ] El selector está deshabilitado mientras `isCreatingBranch === true`
- [ ] Al cambiar la rama activa externamente, el selector se actualiza

### 7.3 Creación exitosa

- [ ] Al crear exitosamente: el input se limpia
- [ ] Al crear exitosamente: el error de validación desaparece
- [ ] Al crear exitosamente: aparece el banner de éxito con el nombre de la rama
- [ ] El banner de éxito desaparece automáticamente tras ~3 segundos
- [ ] La lista de ramas se recarga y muestra la nueva rama
- [ ] La nueva rama aparece como rama activa (checked out) en `BranchSelectorSection`

### 7.4 Manejo de errores de operación

- [ ] Error `E_BRANCH_ALREADY_EXISTS` → banner de error con mensaje legible
- [ ] Error `E_BRANCH_NOT_FOUND` (rama base eliminada) → banner de error con mensaje legible
- [ ] Error `E_DIRTY_WORKING_DIR` → banner de error con mensaje legible
- [ ] Error `E_GIT_NOT_FOUND` → banner de error con mensaje legible
- [ ] Error `E_NOT_A_GIT_REPO` → banner de error con mensaje legible
- [ ] Bridge no disponible → banner de error `"Electron bridge unavailable."`
- [ ] Al escribir en el input después de un error de operación → el banner de error se limpia

### 7.5 Estado de carga

- [ ] Durante la creación: el input está deshabilitado
- [ ] Durante la creación: el selector "From" está deshabilitado
- [ ] Durante la creación: el botón muestra `"Creating…"` y está deshabilitado
- [ ] Durante la creación: `aria-busy="true"` en el botón
- [ ] No es posible disparar múltiples creaciones simultáneas

### 7.6 Accesibilidad

- [ ] El lector de pantalla anuncia el error de validación al aparecer (`role="alert"`, `aria-live="assertive"`)
- [ ] El lector de pantalla anuncia el banner de éxito (`role="status"`)
- [ ] El lector de pantalla anuncia el banner de error de operación (`role="alert"`)
- [ ] `aria-invalid="true"` en el input cuando hay error de validación
- [ ] `aria-describedby` apunta al mensaje de error cuando existe
- [ ] Navegación por Tab funciona en orden: selector → input → botón
- [ ] `Enter` en el input con formulario válido dispara la creación
- [ ] `Enter` en el input con formulario inválido no dispara nada

### 7.7 Integración con el panel

- [ ] `BranchCreatorSection` aparece entre `BranchSelectorSection` y `BranchCommitsSection`
- [ ] Hay un `.git-branches__divider` antes de la sección
- [ ] La sección tiene título visible `"Create Branch"`
- [ ] No hay regresiones en `RemoteChangesSection`, `BranchSelectorSection` ni `BranchCommitsSection`

### 7.8 Archivos modificados — verificación

- [ ] `src/electron/bridge.types.ts` — canal, tipos, códigos de error, método en bridge
- [ ] `src/electron/git-branches.ts` — función `createBranch()`, handler IPC registrado
- [ ] `src/electron/preload.ts` — `gitCreateBranch` expuesto en `contextBridge`
- [ ] `src/ui/hooks/useGitBranches.ts` — estado, acciones, reducer, callback, return
- [ ] `src/ui/components/GitIntegrationModal/GitBranchesPanel.tsx` — `BranchCreatorSection` creado e integrado
- [ ] `src/ui/components/GitIntegrationModal/GitBranchesPanel.css` (o equivalente) — clases CSS nuevas

---

## 📁 Archivos a Modificar (resumen)

| Archivo | Cambio |
|---------|--------|
| `src/electron/bridge.types.ts` | Canal `GIT_CREATE_BRANCH`, tipos request/response, códigos de error, método en `AgentsFlowBridge` |
| `src/electron/git-branches.ts` | Función `createBranch()`, handler IPC en `registerGitBranchesHandlers()` |
| `src/electron/preload.ts` | Exponer `gitCreateBranch` en `contextBridge.exposeInMainWorld` |
| `src/ui/hooks/useGitBranches.ts` | Campos de estado, acciones, reducer cases, mapeo de errores, callback `createBranch` |
| `src/ui/components/GitIntegrationModal/GitBranchesPanel.tsx` | Componente `BranchCreatorSection`, integración en `GitBranchesPanel`, `useEffect` de auto-limpieza |
| `src/ui/components/GitIntegrationModal/GitBranchesPanel.css` *(o equivalente)* | Clases CSS: `__creator-row`, `__creator-label`, `__creator-actions`, `__input`, `__input--error`, `__validation-error` |

---

## 🗂️ Ruta de este documento

```
docs/specs/git-branch-creator-specs.md
```
