## Exploration: Falta de persistencia de permissions.task en delegación

**Date**: 2026-04-20  
**Status**: Ready for Proposal  
**Scope**: Bug Fix / Architecture  

---

### Current State

#### Cómo debería funcionar

Por especificación, toda delegación entre agentes debe crear o actualizar automáticamente la relación `permissions.task.[nombre_agente_delegado]=allow` en el `.adata` del agente delegante. Esta relación debería generarse:

- Al crear un vínculo de delegación en el canvas (link con `metadata.relationType === "Delegation"`)
- Al eliminar un vínculo de delegación
- Al guardar el grafo de agentes
- En cualquier tipo de delegación (task-based, independientemente del tipo de agente)

#### Qué ocurre en la práctica

- **Hoy**: NO se genera `permissions.task` automáticamente cuando se crean o modifican delegaciones
- **Flujo actual**: 
  1. Usuario agrega vínculo de delegación → `addLink()` crea el link en memoria, marca `isDirty=true`
  2. Usuario guarda → `saveAgentGraph()` actualiza `.afproj` y `.adata` en disco
  3. **AQUÍ FALTA EL GUARD**: `saveAgentGraph` retorna sin sincronizar permisos
  4. Usuario DEBE hacer clic manual en "Sync Delegations" → `syncTaskPermissions()` → `handleSyncTasks()` → finalmente escribe `permissions.task` en disco

**Problema detectado**: El handler `SAVE_AGENT_GRAPH` completa exitosamente pero NO invoca automáticamente `handleSyncTasks()`.

---

### Affected Areas

#### Archivos y rutas críticas

1. **`src/electron/ipc-handlers.ts`** (líneas 649-805)
   - Handler `SAVE_AGENT_GRAPH` lee grafo, actualiza `.afproj` y `.adata`
   - **Línea 798**: `return { success: true };` — **retorna sin sincronizar permisos**
   - No hay llamada a `handleSyncTasks()` después de escribir `.adata`

2. **`src/ui/components/AgentGraphSaveButton.tsx`** (líneas 66-123)
   - Handler `handleSave()` invoca `bridge.saveAgentGraph()`
   - **Línea 112**: Si resulta exitoso, sólo hace `markClean()` y muestra toast
   - **Falta**: `await syncTaskPermissions(project.projectDir)` después del save

3. **`src/ui/store/agentFlowStore.ts`** (líneas 537-565, 746-791)
   - `addLink()` crea delegación pero no invoca sync
   - `deleteLink()` elimina vínculo pero no invoca sync
   - `syncTaskPermissions()` existe pero requiere invocación **manual** (no automática)
   - Línea 768: `if (link.metadata?.relationType !== "Delegation") continue;` — lógica correcta pero nunca se dispara automáticamente

4. **`src/electron/permissions-handlers.ts`** (líneas 196-257)
   - `handleSyncTasks()` es una función **pura** que funciona correctamente cuando se llama
   - Genera `permissions.task` como objeto con agentes delegados y valores preservados
   - **NUNCA se invoca automáticamente** durante mutaciones del grafo

#### Canales IPC

- `SYNC_TASKS` (línea 1418 en ipc-handlers) — existe pero requiere acción manual del usuario
- `SAVE_AGENT_GRAPH` — NO dispara `SYNC_TASKS` internamente

#### Tests existentes

- `tests/ui/sync-tasks-delegation-filter.test.ts` — valida la **lógica de cálculo** (qué links contar)
- `tests/electron/permissions-handlers.test.ts` — valida la **persistencia** cuando `handleSyncTasks()` es llamada manualmente
- **FALTA**: Test de integración que valide que `permissions.task` se persista automáticamente tras `saveAgentGraph`

---

### Root Causes (Identified)

#### Causa 1: No hay guard en el handler SAVE_AGENT_GRAPH

- **Ubicación**: `src/electron/ipc-handlers.ts`, línea 798
- **Problema**: Después de escribir exitosamente los archivos `.adata` para todos los agentes, el handler retorna sin:
  - Calcular qué agentes tienen links de Delegation salientes
  - Invocar `handleSyncTasks()` con el payload correcto
- **Prueba**: En el flujo, nunca se ve un log de "SYNC_TASKS" después de "SAVE_AGENT_GRAPH" en la consola

#### Causa 2: Falta de automación en el UI handler

- **Ubicación**: `src/ui/components/AgentGraphSaveButton.tsx`, líneas 109-123
- **Problema**: El código actualmente es:
  ```typescript
  if (result.success) {
    markClean();
    setToast({ kind: "success", message: "Project saved!" });
  }
  ```
  Debería ser:
  ```typescript
  if (result.success) {
    markClean();
    await syncTaskPermissions(project.projectDir);  // ← FALTA
    setToast({ kind: "success", message: "Project saved!" });
  }
  ```

#### Causa 3: Mutaciones de links no disparan sync

- **Ubicación**: `src/ui/store/agentFlowStore.ts`, líneas 537-565
- **Problema**: `addLink()`, `deleteLink()` marcan `isDirty=true` pero no invocan sincronización
- **Impacto**: Flujos ágiles donde se crean/eliminan links rápidamente resultan en `.adata` sin actualizar

#### Causa 4: Desacoplamiento completo entre saveAgentGraph y syncTasks

- **Raíz**: La persistencia de delegaciones y permisos son operaciones **completamente independientes**
- **Debería ser**: Operaciones **acopladas** o **atómicas** — guardar grafo = guardar grafo + actualizar permisos
- **Hoy**: Requieren dos clicks de usuario separados (Save + Sync Delegations)

#### Causa 5: Falta de cobertura de test para trigger point

- **Problema**: Existen tests para:
  - Calcular qué agentes incluir en sync (sync-tasks-delegation-filter.test.ts)
  - Persistir permisos cuando `handleSyncTasks()` es llamada (permissions-handlers.test.ts)
- **Falta**: Test que valide que crear un vínculo + guardar = actualización automática de `.adata`

---

### Approaches/fixes

#### Enfoque A: Agregar guard en el handler SAVE_AGENT_GRAPH (RECOMENDADO)

**Esfuerzo**: Bajo | **Riesgo**: Bajo

**Pasos**:
1. Después de línea 765 (tras escribir `.adata` para cada agente), analizar edges del payload
2. Construir mapa de delegaciones: fromAgentId → Set<toAgentId>
3. Crear `SyncTasksRequest` entries con todos los agentes (delegadores con targets, no-delegadores con [])
4. Llamar a `handleSyncTasks()` antes de retornar éxito
5. Loguear resultados (e.g., "Updated permissions for 3 agents")

**Ventajas**:
- Punto único de autoridad (handler controla grafo + permisos)
- Atómico: grafo y permisos siempre sincronizados post-save
- No requiere cambios en renderer
- Funciona para CUALQUIER tipo de delegador, no sólo UI

**Desventajas**:
- Handler se vuelve ligeramente más pesado (+ lógica de análisis)
- Debe manejar ambos casos: agentes con/sin delegación

#### Enfoque B: Agregar llamada en el UI handler

**Esfuerzo**: Bajo | **Riesgo**: Medio

**Pasos**:
1. Después de `bridge.saveAgentGraph()` exitoso, llamar `await syncTaskPermissions(project.projectDir)`
2. Mostrar resultado combinado ("Saved + Synced X agents")

**Ventajas**:
- Cambios sólo en renderer
- Reutiliza lógica existente

**Desventajas**:
- Dos round trips IPC (save + sync)
- Sólo funciona con save por UI, no programático
- Viola single-responsibility

#### Enfoque C: Hook en addLink/deleteLink con debounce

**Esfuerzo**: Medio | **Riesgo**: Medio-Alto

**Pasos**:
1. Después de cada mutación de link, recalcular e invocar sync
2. Debounce la persistencia real (500ms tras última mutación)

**Ventajas**:
- Feedback inmediato al usuario

**Desventajas**:
- Múltiples IPC calls para edits rápidos
- Lógica de debounce compleja
- Race conditions si user guarda antes de debounce

#### Enfoque D: Guard universal en writeAdataRaw

**Esfuerzo**: Medio-Alto | **Riesgo**: Alto

**Idea**: Garantizar que cualquier `.adata` escrito siempre tenga `permissions.task` como objeto

**Desventajas**:
- Refactor arquitectónico mayor
- Requiere pasar info de links a función de bajo nivel
- Viola separación de responsabilidades

---

### Recommendation

**Implementar Enfoque A + tests de integración**:

1. **Modificar handler SAVE_AGENT_GRAPH**:
   - Extraer lógica de análisis de delegaciones de `agentFlowStore.ts` a función compartida
   - Después de escribir `.adata`, invocar `handleSyncTasks()` con payload construido del grafo actual
   - Retornar con éxito sólo si ambos (save + sync) completan

2. **Agregar cobertura de test**:
   - Test de integración: create agents + delegation → saveAgentGraph → verify permissions.task
   - Test UI: add link → click Save → verify `.adata` file has permissions.task
   - Test de regresión: delete all delegations → save → verify permissions.task is cleared ({})

3. **Mantener botón "Sync Delegations" como fallback**:
   - Para casos edge donde user necesite forzar resync manual
   - Documentar claramente que es backup, no flow principal

---

### Risks

1. **Performance**: `handleSyncTasks` lee/escribe N archivos `.adata`. Aceptable para grafos < 100 agentes. Para grafos mayores, optimizar.

2. **Atomicidad**: Si save exitoso pero sync falla, grafo guardado pero permisos stale. Necesita semántica de transacción o al menos error reporting claro.

3. **Backward compatibility**: Proyectos existentes con `.adata` stale no se auto-reparan. Considerar herramienta de migración.

4. **Regresión**: Remover botón "Sync Delegations" muy pronto puede romper workflows existentes. Recomendar período de deprecación.

5. **Entropía de permisos**: Si user modifica `permissions.task` manualmente en `.adata` y luego guarda grafo, cambios pueden ser sobrescritos. Documentar este comportamiento.

---

### Ready for Proposal

**SÍ.**

Este análisis de exploración está listo para convertirse en propuesta. Las causas son claras, reproducibles, y el enfoque recomendado (A) es bajo-riesgo con impacto alto. Se puede proceder a:

- Crear Change Proposal con Enfoque A
- Definir especificaciones detalladas
- Estimar esfuerzo (3-4 horas para A + tests)
- Planificar rollout
