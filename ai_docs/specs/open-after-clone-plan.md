```markdown
# 🧠 Plan: Apertura de Proyecto tras Clonación desde Git

> **Archivo:** `ai_docs/specs/open-after-clone-plan.md`  
> **Fecha:** 2026-04-22  
> **Estado:** Listo para implementación  
> **Área afectada:** `CloneFromGitModal.tsx`, `ProjectBrowser.tsx`, `projectStore.ts`

---

## 🎯 Objetivo

Mejorar el flujo post-clonación para que, una vez que el proceso de clonar un repositorio Git finalice con éxito, el usuario tenga la opción directa de abrir el proyecto recién clonado en el editor visual, con protección si ya hay un proyecto abierto.

---

## 🧩 Contexto y Estado Actual

### Lo que ya existe
| Componente | Archivo | Estado |
|---|---|---|
| Modal de clonación | `src/ui/components/CloneFromGitModal.tsx` | ✅ Implementado |
| Validación de URLs | `src/ui/utils/gitUrlUtils.ts` | ✅ Implementado |
| IPC handler git clone | `src/electron/ipc-handlers.ts` | ✅ Implementado |
| Bridge types (GIT_CLONE) | `src/electron/bridge.types.ts` | ✅ Implementado |
| Acción `openProject(path)` | `src/ui/store/projectStore.ts` | ✅ Implementado |
| Integración en ProjectBrowser | `src/ui/components/ProjectBrowser.tsx` | ✅ Integrado |

### El problema
El prop `onCloned?(clonedPath: string)` **existe** en `CloneFromGitModal` pero **no se usa** en `ProjectBrowser`. Una vez clonado el repo, no ocurre nada automáticamente — el usuario queda en el modal con estado `success` pero sin forma de abrir el proyecto.

---

## 🧭 Estrategia

Modificar exclusivamente la **capa de UI** (componentes y store). No se toca el proceso de clonación (IPC, Electron, bridge types) porque ya funciona correctamente.

El flujo añadido es:
1. Clonación exitosa → modal muestra botón **Done** (reemplaza Clone + Cancel)
2. Usuario pulsa Done → modal cierra → se invoca `openProject(clonedPath)`
3. Si hay proyecto abierto → diálogo de confirmación nativo antes de abrir
4. Si usuario cierra modal sin pulsar Done → no se abre nada (comportamiento neutral)

---

## 🚀 Fases

---

### 🔹 Phase 1 — Modificar `CloneFromGitModal.tsx`

**Objetivo:** Cambiar los botones del modal en estado `success` y exponer la ruta clonada hacia el padre.

**Cambios:**

#### 1.1 — Botones condicionales por estado
- Estado `idle` / `cloning` / `error`: mostrar botones actuales (`Clone` + `Cancel`)
- Estado `success`: ocultar `Clone` y `Cancel`, mostrar solo botón `Done`

```tsx
// Lógica de botones según estado
{cloneState === 'success' ? (
  <button className="btn btn-primary" onClick={handleDone}>
    Done
  </button>
) : (
  <>
    <button className="btn btn-secondary" onClick={onClose} disabled={cloneState === 'cloning'}>
      Cancel
    </button>
    <button className="btn btn-primary" onClick={handleClone} disabled={!isFormValid || cloneState === 'cloning'}>
      {cloneState === 'cloning' ? 'Cloning…' : 'Clone'}
    </button>
  </>
)}
```

#### 1.2 — Handler `handleDone`
- Llama a `onCloned(clonedPath)` si el prop existe
- Luego llama a `onClose()`

```tsx
const handleDone = () => {
  if (clonedPath && onCloned) {
    onCloned(clonedPath);
  }
  onClose();
};
```

#### 1.3 — Asegurar que `clonedPath` persiste en estado local
- Ya existe como `clonedPath` en el estado de la clonación. Verificar que se guarda correctamente desde el resultado del IPC (`result.clonedPath`).

**Tasks:**
- [ ] Revisar estado interno del componente y confirmar que `clonedPath` se asigna en éxito
- [ ] Implementar renderizado condicional de botones
- [ ] Implementar `handleDone`
- [ ] Asegurar que `onClose()` cierra el modal limpiamente desde Done

**Asignado a:** `developer`  
**Dependencias:** Ninguna (cambio aislado al componente)

---

### 🔹 Phase 2 — Modificar `projectStore.ts`

**Objetivo:** Añadir lógica que detecte si hay un proyecto abierto y, si es así, muestre un diálogo de confirmación antes de abrir el nuevo.

**Cambios:**

#### 2.1 — Nueva acción `openProjectAfterClone(clonedPath: string)`

```typescript
openProjectAfterClone: async (clonedPath: string) => {
  const { project } = get();

  if (project !== null) {
    // Hay proyecto abierto → pedir confirmación
    const confirmed = await window.agentsFlow.showConfirmDialog({
      title: 'Open cloned project?',
      message: 'A project is already open. Close it and open the cloned project?',
      confirmLabel: 'Open',
      cancelLabel: 'Keep current',
    });

    if (!confirmed) return; // Usuario eligió no abrir
  }

  // Sin proyecto abierto, o confirmado → abrir directamente
  await get().openProject(clonedPath);
},
```

> **Nota:** Si `showConfirmDialog` no existe en el bridge, usar `window.confirm()` nativo como fallback (ver Phase 2.2).

#### 2.2 — Fallback con `window.confirm()` si el bridge no tiene confirmación nativa

```typescript
const confirmed = typeof window !== 'undefined'
  ? window.confirm('A project is already open. Close it and open the cloned project?')
  : true;
```

**Decisión:** Usar `window.confirm()` como implementación inicial. Es sincrónico, nativo del sistema operativo en Electron, y suficiente para el requerimiento. No requiere cambios en el bridge.

**Tasks:**
- [ ] Revisar si `window.agentsFlow.showConfirmDialog` existe en `bridge.types.ts`
- [ ] Si no existe, implementar con `window.confirm()` directamente
- [ ] Añadir la acción `openProjectAfterClone` al store
- [ ] Asegurar que `openProject` ya limpia el estado del proyecto anterior (verificar `closeProject` flow)

**Asignado a:** `developer`  
**Dependencias:** Phase 1 completada (necesitamos conocer el path para abrir)

---

### 🔹 Phase 3 — Conectar en `ProjectBrowser.tsx`

**Objetivo:** Pasar el callback `onCloned` al componente modal, conectado a la acción del store.

**Cambios:**

#### 3.1 — Importar acción del store
```tsx
const { openProjectAfterClone } = useProjectStore();
```

#### 3.2 — Pasar callback al modal
```tsx
<CloneFromGitModal
  isOpen={showCloneGitModal}
  onClose={() => setShowCloneGitModal(false)}
  onCloned={(clonedPath) => openProjectAfterClone(clonedPath)}
/
>
```

**Tasks:**
- [ ] Importar `openProjectAfterClone` del store en ProjectBrowser
- [ ] Pasar `onCloned` al modal
- [ ] Verificar que `setShowCloneGitModal(false)` en `onClose` y en `handleDone` (dentro del modal) no generan doble cierre

**Asignado a:** `developer`  
**Dependencias:** Phase 1 y Phase 2 completadas

---

### 🔹 Phase 4 — Validación y QA

**Objetivo:** Verificar que el flujo completo funciona correctamente en todos los casos.

**Casos a validar:**

| ID | Escenario | Resultado esperado |
|---|---|---|
| QA-01 | Clonar exitoso, NO hay proyecto abierto | Modal cierra, proyecto abre en editor |
| QA-02 | Clonar exitoso, HAY proyecto abierto, usuario confirma | Modal cierra, proyecto anterior reemplazado, nuevo abre |
| QA-03 | Clonar exitoso, HAY proyecto abierto, usuario cancela diálogo | Modal cierra, proyecto anterior permanece, nada cambia |
| QA-04 | Clonar exitoso, usuario cierra modal con X en vez de Done | Modal cierra, proyecto NO se abre |
| QA-05 | Clonar fallido | Botón Done nunca aparece, Clone + Cancel se mantienen |
| QA-06 | Clonar en curso (cloning) | Botón Cancel deshabilitado, Clone deshabilitado, Done oculto |
| QA-07 | Usuario presiona Done y el store falla al cargar el proyecto | Error manejado por el store (lastError), modal ya cerrado |

**Asignado a:** `qa`  
**Dependencias:** Phases 1–3 completadas

---

## ⚠️ Riesgos y Edge Cases

### Riesgo 1 — Doble cierre del modal
- **Descripción:** `handleDone` llama a `onClose()` y `onCloned()`. Si `onCloned` también dispara algún efecto que intenta cerrar el modal, puede haber render doble.
- **Mitigación:** `handleDone` llama `onClose()` **después** de `onCloned()`. El estado del modal en `ProjectBrowser` (`showCloneGitModal`) es lo único que controla su visibilidad.

### Riesgo 2 — `window.confirm()` bloqueante
- **Descripción:** `window.confirm()` es sincrónico y bloquea el event loop del renderer temporalmente.
- **Impacto:** Bajo. En Electron esto es aceptable para diálogos de confirmación cortos.
- **Mitigación:** Si en el futuro se necesita un diálogo más elaborado, se puede reemplazar con un modal personalizado. Por ahora, `window.confirm()` cumple el requerimiento sin complejidad adicional.

### Riesgo 3 — `clonedPath` vacío o undefined en estado de éxito
- **Descripción:** Si el IPC retorna `success: true` pero `clonedPath` es undefined, `handleDone` llamaría `onCloned(undefined)`.
- **Mitigación:** Guardar `clonedPath` en el estado local **solo si es truthy**. Guard en `handleDone`:
  ```tsx
  if (clonedPath && onCloned) onCloned(clonedPath);
  ```

### Riesgo 4 — `openProject` no cierra el proyecto anterior
- **Descripción:** La acción `openProject` en el store podría no limpiar el estado previo antes de cargar el nuevo.
- **Mitigación:** Verificar en `projectStore.ts` que `openProject` hace reset de `project`, `lastLoadResult`, `lastError` antes de invocar el bridge. Si no, hacer el reset explícito en `openProjectAfterClone` antes de llamar a `openProject`.

### Riesgo 5 — Usuario presiona X del modal en estado success
- **Descripción:** La X (o click en backdrop) llama a `onClose` directamente, sin pasar por `handleDone`.
- **Comportamiento esperado:** Modal cierra, proyecto NO se abre. ✅ Esto es correcto según el requerimiento.
- **Acción:** No requiere cambio. Es el comportamiento deseado.

---

## ✅ Criterios de Éxito

- [ ] En estado `success`, solo aparece el botón `Done` (Clone y Cancel desaparecen)
- [ ] Presionar `Done` cierra el modal y abre el proyecto clonado en el editor
- [ ] Si hay proyecto abierto, aparece `window.confirm()` antes de abrir el nuevo
- [ ] Confirmar en el diálogo → proyecto anterior reemplazado, nuevo abierto
- [ ] Cancelar en el diálogo → modal cerrado, nada cambia en el editor
- [ ] Cerrar modal con X o backdrop → proyecto no se abre
- [ ] En estado `error`, los botones originales permanecen (Clone + Cancel)
- [ ] El flujo no introduce regresiones en NewProjectModal ni en Open Project

---

## 📁 Archivos a Modificar

| Archivo | Tipo de cambio |
|---|---|
| `src/ui/components/CloneFromGitModal.tsx` | Botones condicionales + handler Done |
| `src/ui/store/projectStore.ts` | Nueva acción `openProjectAfterClone` |
| `src/ui/components/ProjectBrowser.tsx` | Pasar `onCloned` callback al modal |

### Archivos que NO se tocan
- `src/electron/ipc-handlers.ts` — El proceso de clonación no cambia
- `src/electron/bridge.types.ts` — No se añaden canales IPC
- `src/electron/preload.ts` — No se modifican métodos del bridge
- `src/ui/utils/gitUrlUtils.ts` — Validación ya correcta

---

## 📝 Notas Finales

- El requerimiento es **no configurable**: el botón Done siempre aparece en éxito, el diálogo de confirmación siempre aparece si hay proyecto abierto.
- No se requiere feedback visual extra (toasts, animaciones, loaders post-Done).
- La complejidad total es **baja**: ~30-50 líneas de cambio neto en 3 archivos.
- El comportamiento se alinea con el patrón ya establecido por `NewProjectModal` (que al crear un proyecto llama internamente a `loadProject` y navega al editor).
```
