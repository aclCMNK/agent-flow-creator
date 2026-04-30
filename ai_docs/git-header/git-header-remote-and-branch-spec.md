# Spec: Header — Remote URL y Rama Activa al Integrar Git desde el Editor

**Ruta:** `ai_docs/git-header/git-header-remote-and-branch-spec.md`  
**Fecha:** 2026-04-29  
**Estado:** Pendiente de implementación  
**Prioridad:** Alta  

---

## 🎯 Objetivo

Garantizar que el header del editor muestre correctamente:

1. **El nombre del repositorio remoto** (`gitRemoteOrigin`) — la URL del remote `origin`
2. **La rama activa** (`gitActiveBranch`) — la rama en la que está parado el usuario

…tanto cuando el proyecto se **abre/importa desde Git** (flujo ya funcional), como cuando el usuario **integra un repositorio remoto desde el editor** (flujo actualmente roto).

---

## 🧩 Contexto Actual

### Flujo de apertura/importación (funciona correctamente)

Cuando el usuario abre o importa un proyecto desde Git, el flujo es:

```
openProject(dir)
  → bridge.loadProject()
  → bridge.getGitRemoteOrigin(dir)   ← fire-and-forget
    → set({ gitRemoteOrigin })       ← actualiza projectStore
```

El header en `App.tsx` lee `gitRemoteOrigin` desde `projectStore` y lo muestra.

**Problema:** `gitActiveBranch` **no existe aún** en el store. El header solo muestra la URL del remote, no la rama activa.

---

### Flujo de integración desde el editor (roto)

Cuando el usuario ya tiene el proyecto abierto y conecta un repositorio remoto desde el modal de Git Integration (`GitIntegrationModal` → `GitConfigPanel` → `RemoteConnectForm`), el flujo es:

```
useGitConfig.connect(params)
  → bridge.gitSetRemote()
  → bridge.gitSaveCredentials()
  → bridge.gitSetIdentity()
  → bridge.gitDetectMainBranch()
  → bridge.gitHandleDivergence()
  → dispatch({ type: "CONNECT_SUCCESS", remoteUrl })  ← solo actualiza estado LOCAL del hook
```

El `useGitConfig` hook tiene su propio estado local (`GitConfigState.remoteUrl`, `GitConfigState.protectedBranch`). **Nunca escribe en `projectStore`.**

**Consecuencia:** Después de conectar un remote desde el editor:
- `projectStore.gitRemoteOrigin` sigue siendo `null`
- `projectStore.gitActiveBranch` no existe
- El header **no muestra nada** — como si el proyecto no tuviera Git

---

### Diferencia clave entre flujos

| Aspecto | Apertura/Importación | Integración desde editor |
|---------|---------------------|--------------------------|
| Quién actualiza el store | `openProject()` en `projectStore.ts` | Nadie — solo `useGitConfig` local |
| `gitRemoteOrigin` en store | ✅ Se actualiza | ❌ No se actualiza |
| `gitActiveBranch` en store | ❌ No existe aún | ❌ No existe aún |
| Header muestra remote | ✅ Sí | ❌ No |
| Header muestra rama | ❌ No (campo no existe) | ❌ No |

---

## 🧭 Estrategia

**Enfoque:** Extender `projectStore` con `gitActiveBranch` y crear un mecanismo para que `useGitConfig` sincronice ambos campos al store global después de operaciones exitosas.

**Principios:**
- El `projectStore` es la única fuente de verdad para el header
- `useGitConfig` sigue siendo el orquestador de operaciones Git, pero debe notificar al store cuando cambia el estado relevante para el header
- No se rompe el flujo existente de apertura/importación
- Todas las actualizaciones son async / fire-and-forget — nunca bloquean la UI

---

## 🚀 Pasos Detallados de Implementación

---

### Paso 1 — Agregar `gitActiveBranch` al `projectStore`

**Archivo:** `src/ui/store/projectStore.ts`

**Cambios en `ProjectState`:**

```typescript
// Agregar junto a gitRemoteOrigin:
gitActiveBranch: string | null;
```

**Cambios en `initialState`:**

```typescript
gitActiveBranch: null,
```

**Cambios en `closeProject()`:**

```typescript
closeProject() {
  set({
    // ... campos existentes ...
    gitRemoteOrigin: null,
    gitActiveBranch: null,   // ← agregar
    currentView: "browser",
  });
}
```

**Cambios en `openProject()` — detectar rama activa en background:**

Después de la llamada existente a `bridge.getGitRemoteOrigin(projectDir)`, agregar en paralelo:

```typescript
// Detectar rama activa en background (fire-and-forget)
bridge
  .gitListBranches({ projectDir })
  .then((result) => {
    const activeProject = get().project;
    if (activeProject?.projectDir === requestedDir && result.ok) {
      set({ gitActiveBranch: result.currentBranch ?? null });
    }
  })
  .catch(() => {
    const activeProject = get().project;
    if (activeProject?.projectDir === requestedDir) {
      set({ gitActiveBranch: null });
    }
  });
```

**Agregar acción pública para sincronización desde hooks externos:**

```typescript
// En ProjectActions:
syncGitHeaderState(remote: string | null, branch: string | null): void;

// Implementación:
syncGitHeaderState(remote, branch) {
  set({ gitRemoteOrigin: remote, gitActiveBranch: branch });
},
```

> Esta acción es el contrato público que `useGitConfig` usará para notificar al store.

**Stub en `_stub`:**

```typescript
// No aplica — syncGitHeaderState es una acción del store, no del bridge
```

---

### Paso 2 — Sincronizar desde `useGitConfig` al store global

**Archivo:** `src/ui/hooks/useGitConfig.ts`

El hook debe llamar a `useProjectStore.getState().syncGitHeaderState(...)` en los puntos donde el estado Git cambia de forma relevante para el header.

**Puntos de sincronización:**

#### 2a. Después de `CONNECT_SUCCESS` (remote integrado exitosamente)

En la función `connect()`, después del dispatch de `CONNECT_SUCCESS`:

```typescript
// Después de: dispatch({ type: "CONNECT_SUCCESS", remoteUrl: params.url });

// Obtener rama activa y sincronizar al store global
const bridge = getBridge();
if (bridge && projectDir) {
  bridge.gitListBranches({ projectDir })
    .then((result) => {
      useProjectStore.getState().syncGitHeaderState(
        params.url,
        result.ok ? (result.currentBranch ?? null) : null
      );
    })
    .catch(() => {
      useProjectStore.getState().syncGitHeaderState(params.url, null);
    });
}
```

#### 2b. Después de `LOAD_CONFIG_SUCCESS` (modal abierto con config existente)

En `loadConfig()`, después del dispatch de `LOAD_CONFIG_SUCCESS`:

```typescript
// Después de: dispatch({ type: "LOAD_CONFIG_SUCCESS", ... });

if (result.remoteUrl !== null && projectDir) {
  const bridge = getBridge();
  if (bridge) {
    bridge.gitListBranches({ projectDir })
      .then((branchResult) => {
        useProjectStore.getState().syncGitHeaderState(
          result.remoteUrl,
          branchResult.ok ? (branchResult.currentBranch ?? null) : null
        );
      })
      .catch(() => {
        useProjectStore.getState().syncGitHeaderState(result.remoteUrl, null);
      });
  }
}
```

> **Nota:** Este punto cubre el caso donde el usuario abre el modal de Git y ya tiene un remote configurado. Garantiza que el store esté sincronizado incluso si `openProject` no lo detectó (ej: el remote fue configurado manualmente fuera del editor).

#### 2c. Después de `gitCheckoutBranch` (cambio de rama desde `GitBranchesPanel`)

Si existe lógica de checkout en el hook o en `GitBranchesPanel`, agregar sincronización de `gitActiveBranch` después de un checkout exitoso:

```typescript
useProjectStore.getState().syncGitHeaderState(
  useProjectStore.getState().gitRemoteOrigin,  // mantener remote actual
  newBranchName
);
```

---

### Paso 3 — Actualizar el header en `App.tsx`

**Archivo:** `src/ui/App.tsx`

**Cambio en `EditorView`:**

```typescript
const {
  project,
  navigate,
  lastLoadResult,
  lastError,
  clearError,
  gitRemoteOrigin,
  gitActiveBranch,   // ← agregar
} = useProjectStore();
```

**Cambio en el JSX del header:**

Reemplazar el badge actual:

```tsx
// ANTES:
{gitRemoteOrigin && (
  <span className="git-remote-badge" title={gitRemoteOrigin}>
    <span aria-hidden="true">⎇</span>
    <span className="git-remote-url">{gitRemoteOrigin}</span>
  </span>
)}

// DESPUÉS:
{(gitRemoteOrigin || gitActiveBranch) && (
  <span className="git-remote-badge" title={gitRemoteOrigin ?? undefined}>
    <span aria-hidden="true">⎇</span>
    {gitRemoteOrigin && (
      <span className="git-remote-url">{gitRemoteOrigin}</span>
    )}
    {gitActiveBranch && (
      <>
        {gitRemoteOrigin && <span className="git-remote-separator" aria-hidden="true">·</span>}
        <span className="git-active-branch">{gitActiveBranch}</span>
      </>
    )}
  </span>
)}
```

**Comportamiento visual:**
- Solo remote → `⎇ https://github.com/org/repo.git`
- Solo rama → `⎇ main`
- Ambos → `⎇ https://github.com/org/repo.git · main`
- Ninguno → no se renderiza nada

---

### Paso 4 — Agregar `syncGitHeaderState` al tipo `ProjectActions`

**Archivo:** `src/ui/store/projectStore.ts`

```typescript
export interface ProjectActions {
  // ... acciones existentes ...

  /**
   * Sincroniza el estado del header Git desde hooks externos (ej: useGitConfig).
   * Llamar después de operaciones que cambian el remote o la rama activa.
   */
  syncGitHeaderState(remote: string | null, branch: string | null): void;
}
```

---

## 📁 Archivos Involucrados

| Archivo | Tipo de cambio | Descripción |
|---------|---------------|-------------|
| `src/ui/store/projectStore.ts` | Modificar | Agregar `gitActiveBranch`, `syncGitHeaderState`, actualizar `openProject` y `closeProject` |
| `src/ui/hooks/useGitConfig.ts` | Modificar | Sincronizar al store en `connect()`, `loadConfig()`, y checkout |
| `src/ui/App.tsx` | Modificar | Leer `gitActiveBranch` y actualizar JSX del badge en el header |
| `src/ui/components/GitIntegrationModal/GitBranchesPanel.tsx` | Revisar | Verificar si hay checkout y agregar sincronización si aplica |

---

## ✅ Criterios de Aceptación

### CA-1: Remote integrado desde el editor aparece en el header

**Dado** que el usuario tiene un proyecto abierto sin remote configurado  
**Cuando** abre el modal de Git Integration y conecta un remote exitosamente  
**Entonces** el header muestra la URL del remote dentro de los 2 segundos siguientes al cierre del modal

---

### CA-2: Rama activa aparece en el header al abrir un proyecto

**Dado** que el usuario abre un proyecto que es un repositorio Git  
**Cuando** el proyecto carga exitosamente  
**Entonces** el header muestra la rama activa (ej: `main`, `develop`) junto al remote (si existe)

---

### CA-3: Rama activa aparece en el header al integrar remote desde el editor

**Dado** que el usuario conecta un remote desde el editor  
**Cuando** la conexión es exitosa  
**Entonces** el header muestra tanto la URL del remote como la rama activa actual

---

### CA-4: El header se actualiza al cambiar de rama

**Dado** que el usuario cambia de rama desde el panel de Git Integration  
**Cuando** el checkout es exitoso  
**Entonces** el header actualiza la rama mostrada a la nueva rama activa

---

### CA-5: El header se limpia al cerrar el proyecto

**Dado** que el usuario cierra el proyecto y vuelve al browser  
**Cuando** navega de vuelta al editor con otro proyecto  
**Entonces** el header no muestra datos del proyecto anterior

---

### CA-6: Sin Git → header sin badge

**Dado** que el proyecto no tiene `.git`  
**Cuando** el proyecto carga  
**Entonces** el header no muestra ningún badge de Git

---

### CA-7: Con Git pero sin remote → solo rama en header

**Dado** que el proyecto tiene `.git` pero no tiene remote configurado  
**Cuando** el proyecto carga  
**Entonces** el header muestra solo la rama activa (sin URL de remote)

---

### CA-8: No bloquea la UI

**Dado** cualquier escenario de apertura o integración  
**Cuando** se detecta el remote o la rama  
**Entonces** la navegación al editor ocurre inmediatamente; el badge aparece de forma asíncrona sin bloquear la interacción

---

## ⚠️ Edge Cases

### EC-1: Race condition al cambiar de proyecto rápidamente

**Escenario:** El usuario abre proyecto A, luego inmediatamente abre proyecto B antes de que resuelva la detección de A.

**Mitigación:** El guard existente en `openProject` (`activeProject?.projectDir === requestedDir`) previene que la respuesta de A sobreescriba el estado de B. Aplicar el mismo patrón para `gitActiveBranch`.

---

### EC-2: `gitListBranches` falla o no hay ramas

**Escenario:** El repo es nuevo (sin commits), `git branch` no retorna nada.

**Comportamiento esperado:** `gitActiveBranch` queda en `null`. El header muestra solo el remote si existe. No hay error visible.

---

### EC-3: Remote configurado manualmente fuera del editor

**Escenario:** El usuario configura el remote con `git remote add origin ...` en terminal mientras el proyecto está abierto.

**Comportamiento esperado:** El header no se actualiza automáticamente (no hay watcher). Se actualiza la próxima vez que el usuario abra el modal de Git Integration (CA-2b via `loadConfig`).

**Nota:** Este es comportamiento aceptable para MVP. Un watcher de filesystem queda fuera de scope.

---

### EC-4: `syncGitHeaderState` llamado con proyecto ya cerrado

**Escenario:** El usuario cierra el proyecto mientras una promesa de `gitListBranches` está en vuelo.

**Mitigación:** `closeProject()` resetea `gitRemoteOrigin` y `gitActiveBranch` a `null`. Si la promesa resuelve después, `syncGitHeaderState` sobreescribirá con datos del proyecto cerrado.

**Solución:** En `useGitConfig`, verificar que el `projectDir` del store sigue siendo el mismo antes de llamar `syncGitHeaderState`:

```typescript
const currentProject = useProjectStore.getState().project;
if (currentProject?.projectDir === projectDir) {
  useProjectStore.getState().syncGitHeaderState(remote, branch);
}
```

---

### EC-5: Múltiples aperturas del modal de Git Integration

**Escenario:** El usuario abre y cierra el modal varias veces. `loadConfig` se llama en cada apertura.

**Comportamiento esperado:** Cada `loadConfig` exitoso sincroniza el store con el estado actual. No hay duplicación ni estado inconsistente porque `syncGitHeaderState` es un set directo (idempotente).

---

### EC-6: Proyecto sin commits (repo vacío)

**Escenario:** `git init` recién ejecutado, sin commits. `gitListBranches` puede retornar `currentBranch: null` o `""`.

**Comportamiento esperado:** `gitActiveBranch` queda en `null`. El header no muestra rama. No hay crash.

---

### EC-7: URL de remote muy larga

**Escenario:** URL del remote supera el ancho disponible en el header.

**Mitigación:** CSS existente con `text-overflow: ellipsis` y `max-width` en `.git-remote-badge`. Verificar que el nuevo elemento `.git-active-branch` también tenga `overflow: hidden`.

---

## 📝 Notas Adicionales

1. **`useProjectStore.getState()` fuera de React:** Es válido llamar `useProjectStore.getState()` desde fuera de un componente React (ej: dentro de `useGitConfig`). Zustand expone `getState()` en el store directamente. No requiere hook.

2. **No usar `useProjectStore()` como hook en `useGitConfig`:** `useGitConfig` es un hook de React, pero llamar `useProjectStore()` dentro de él crearía una suscripción innecesaria. Usar `useProjectStore.getState()` para acceso puntual y `useProjectStore.getState().syncGitHeaderState()` para escritura.

3. **`gitListBranches` ya existe en el bridge:** El método `bridge.gitListBranches({ projectDir })` ya está declarado en `bridge.types.ts` y en el stub de `projectStore.ts`. No requiere nuevo IPC handler.

4. **Compatibilidad con el flujo de clone:** `openProjectAfterClone` llama a `openProject`, que ya incluirá la detección de rama activa después de este cambio. No requiere modificación adicional.

5. **Stub del bridge:** `gitListBranches` en `_stub` ya lanza `notAvailable`. No requiere cambio. La detección en `openProject` usa `.catch()` que maneja el error silenciosamente.

---

## 🔗 Referencias

- Plan de detección de remote: `docs/plans/git-remote-detection.md`
- Contexto de ciclo cerrado: `ai_docs/context/git-remote-detection-cycle.md`
- Store actual: `src/ui/store/projectStore.ts`
- Hook Git: `src/ui/hooks/useGitConfig.ts`
- Header actual: `src/ui/App.tsx` (función `EditorView`, líneas ~110–270)

---

*Spec generada por Weight-Planner · AgentsFlow · 2026-04-29*
