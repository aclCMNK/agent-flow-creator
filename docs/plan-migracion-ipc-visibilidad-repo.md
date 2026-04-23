---
# 🧠 Plan de Migración: Detección de Visibilidad de Repositorio vía Proxy IPC

## 🎯 Objetivo
Migrar toda la detección de visibilidad de repositorio (público/privado) en el modal de clonación para que use exclusivamente el proxy IPC `window.agentsFlow.githubFetch`, eliminando cualquier `fetch` directo desde el renderer a dominios externos, cumpliendo así la Content Security Policy (CSP).

---

## 🧩 Contexto

El modal de clonación actualmente realiza llamadas directas a `https://api.github.com/repos/{owner}/{repo}` desde el proceso renderer para determinar si un repositorio es público o privado. Esto viola la CSP del proyecto, que prohíbe conexiones de red directas desde el renderer a dominios externos.

El proyecto ya cuenta con un canal IPC expuesto como `window.agentsFlow.githubFetch` que actúa como proxy: el renderer le delega la petición al proceso main de Electron, que sí tiene permisos para hacer fetch externo.

---

## 🗂️ Funciones y Utilidades a Migrar

### Renderer (proceso que debe cambiar)

| Función / Utilidad | Archivo probable | Acción |
|---|---|---|
| `checkRepoVisibility(url)` o similar | `src/components/CloneModal.*` o `src/utils/github.*` | Reemplazar `fetch(...)` por `window.agentsFlow.githubFetch(...)` |
| `getRepoInfo(owner, repo)` | `src/utils/githubApi.*` o similar | Migrar a IPC |
| Cualquier `fetch('https://api.github.com/...')` en el renderer | Cualquier archivo en `src/` | Eliminar y reemplazar |

### Main Process (sin cambios si ya existe el handler)

| Handler IPC | Archivo probable | Estado |
|---|---|---|
| `githubFetch` handler | `electron/main.*` o `electron/ipc.*` | Verificar que acepta endpoint + opciones y retorna JSON |

---

## 🔄 Cambios en el Flujo de Datos

### Flujo ACTUAL (a eliminar)
```
Renderer
  └─► fetch('https://api.github.com/repos/{owner}/{repo}')
        └─► Response JSON → extrae `private: boolean`
```

### Flujo OBJETIVO (post-migración)
```
Renderer
  └─► window.agentsFlow.githubFetch('/repos/{owner}/{repo}', { method: 'GET', token? })
        └─► IPC channel → Main Process
              └─► fetch('https://api.github.com/repos/{owner}/{repo}')
                    └─► Response JSON → IPC reply → Renderer
                          └─► extrae `private: boolean`
```

---

## 🚀 Fases de Ejecución

### 🔹 Fase 1: Auditoría y Mapeo
**Descripción:** Identificar todos los puntos exactos donde el renderer hace fetch directo a GitHub para visibilidad.

**Tasks:**
- **Task:** Buscar con grep todos los `fetch(` en `src/` que apunten a `github.com` o `api.github.com`
  - **Assigned to:** explorer
  - **Dependencies:** ninguna

- **Task:** Identificar la firma exacta de `window.agentsFlow.githubFetch` (parámetros, retorno, manejo de errores)
  - **Assigned to:** explorer
  - **Dependencies:** ninguna

- **Task:** Listar tests existentes que cubran el modal de clonación o detección de visibilidad
  - **Assigned to:** explorer
  - **Dependencies:** ninguna

---

### 🔹 Fase 2: Adaptación de Tipos TypeScript
**Descripción:** Asegurar que los tipos reflejen el nuevo flujo IPC.

**Tasks:**
- **Task:** Verificar/crear tipo `GithubFetchOptions` con campos: `method`, `token`, `headers`, `body`
  - **Assigned to:** design-code
  - **Dependencies:** Fase 1 completada

- **Task:** Verificar/crear tipo `RepoVisibilityResult` con campos: `isPrivate: boolean`, `name: string`, `fullName: string`, `error?: string`
  - **Assigned to:** design-code
  - **Dependencies:** Fase 1 completada

- **Task:** Actualizar declaración de `window.agentsFlow` en `src/types/` o `electron.d.ts` si `githubFetch` no está tipado
  - **Assigned to:** design-code
  - **Dependencies:** tipos anteriores definidos

---

### 🔹 Fase 3: Migración del Renderer
**Descripción:** Reemplazar fetch directo por llamadas al proxy IPC en todas las funciones identificadas.

**Tasks:**
- **Task:** Crear/actualizar utilidad `getRepoVisibility(owner: string, repo: string, token?: string): Promise<RepoVisibilityResult>` que use `window.agentsFlow.githubFetch`
  - **Assigned to:** design-code
  - **Dependencies:** Fase 2 completada

- **Task:** Reemplazar en el modal de clonación todos los `fetch(` directos por la nueva utilidad
  - **Assigned to:** design-code
  - **Dependencies:** utilidad creada

- **Task:** Eliminar imports o referencias a fetch nativo para llamadas GitHub en el renderer
  - **Assigned to:** design-code
  - **Dependencies:** reemplazos completados

---

### 🔹 Fase 4: Manejo de Errores y Asincronía
**Descripción:** Garantizar robustez ante fallos de red, tokens inválidos y repos inexistentes.

**Tasks:**
- **Task:** Implementar manejo de errores en la utilidad IPC:
  - 401 Unauthorized → token inválido o ausente
  - 403 Forbidden → sin permisos (repo privado sin acceso)
  - 404 Not Found → repo inexistente o privado sin token
  - Network error → IPC no disponible o main process caído
  - **Assigned to:** design-code
  - **Dependencies:** Fase 3 completada

- **Task:** Asegurar que el modal de clonación maneje estados de carga (loading), error y éxito de forma asíncrona sin bloquear la UI
  - **Assigned to:** design-code
  - **Dependencies:** manejo de errores implementado

---

### 🔹 Fase 5: Verificación del Main Process
**Descripción:** Confirmar que el handler IPC en el main process es suficiente o adaptarlo.

**Tasks:**
- **Task:** Verificar que el handler `githubFetch` en main:
  - Acepta endpoint relativo (e.g. `/repos/owner/repo`) y construye la URL completa
  - Acepta token opcional en headers
  - Retorna el JSON parseado o un objeto de error estructurado
  - **Assigned to:** design-code
  - **Dependencies:** Fase 1 completada

- **Task:** Si el handler no existe o es insuficiente, implementarlo/extenderlo en el proceso main
  - **Assigned to:** design-code
  - **Dependencies:** verificación anterior

---

### 🔹 Fase 6: Tests
**Descripción:** Actualizar y crear tests que validen el nuevo flujo IPC.

**Tasks:**
- **Task:** Mockear `window.agentsFlow.githubFetch` en tests del renderer (jest/vitest)
  - **Assigned to:** design-code
  - **Dependencies:** Fase 3 completada

- **Task:** Crear tests unitarios para `getRepoVisibility`:
  - repo público → `isPrivate: false`
  - repo privado con token válido → `isPrivate: true`
  - repo privado sin token → error 404/403
  - token inválido → error 401
  - IPC no disponible → error de red
  - **Assigned to:** design-code
  - **Dependencies:** mock configurado

- **Task:** Actualizar tests de integración del modal de clonación para usar el nuevo flujo
  - **Assigned to:** design-code
  - **Dependencies:** tests unitarios pasando

---

### 🔹 Fase 7: Validación CSP
**Descripción:** Confirmar que ningún fetch directo a dominios externos queda en el renderer.

**Tasks:**
- **Task:** Ejecutar grep final en `src/` buscando `fetch(` con URLs de github.com — resultado debe ser cero
  - **Assigned to:** explorer
  - **Dependencies:** Fase 3 completada

- **Task:** Revisar configuración CSP en `electron/` o `index.html` y confirmar que `connect-src` no incluye `api.github.com` para el renderer
  - **Assigned to:** explorer
  - **Dependencies:** ninguna

---

## ✅ Criterios de Aceptación

1. **Cero fetch directos:** `grep -r "fetch(" src/` no debe retornar ninguna llamada a `github.com` o `api.github.com`
2. **Proxy funcional:** `window.agentsFlow.githubFetch` es el único punto de salida para llamadas GitHub desde el renderer
3. **Tipos completos:** Todas las funciones migradas tienen tipos TypeScript explícitos, sin `any`
4. **Errores manejados:** Los casos 401, 403, 404 y error de red tienen manejo explícito y mensajes de error claros en la UI
5. **Tests verdes:** Todos los tests existentes pasan; los nuevos tests de `getRepoVisibility` cubren los 5 casos descritos
6. **UI no bloqueante:** El modal muestra estado de carga mientras espera la respuesta IPC
7. **CSP válida:** La aplicación no genera errores CSP en la consola del renderer al detectar visibilidad

---

## ⚠️ Edge Cases

| Caso | Comportamiento esperado |
|---|---|
| Repo privado sin token | Tratar como "no se puede determinar visibilidad" → mostrar advertencia, no bloquear clonación |
| Token con scopes insuficientes | Error 403 → mensaje específico "Token sin permisos suficientes" |
| URL de repo malformada | Validar antes de llamar al IPC → error de validación en UI |
| Main process no responde al IPC | Timeout configurable (ej. 10s) → error "Servicio no disponible" |
| Rate limit de GitHub API (429) | Detectar y mostrar "Límite de peticiones alcanzado, intenta más tarde" |
| Repo de organización privada | Mismo flujo que repo privado de usuario |
| `window.agentsFlow` no definido | Guard check al inicio → fallback o error claro (no debe ocurrir en Electron, pero defensivo) |

---

## 📝 Notas Técnicas

- El proxy IPC debe construir la URL base `https://api.github.com` en el main process, nunca en el renderer
- El token de autenticación debe pasarse como parámetro opcional; nunca hardcodeado
- Si el proyecto usa un store (Redux/Zustand/Context) para el token de GitHub, la utilidad debe recibirlo como parámetro, no acceder al store directamente
- La utilidad `getRepoVisibility` debe ser pura y testeable de forma aislada
- Considerar debounce si la detección se dispara en cada keystroke del input de URL

---

## ⚠️ Riesgos

- El handler IPC `githubFetch` puede no existir aún o tener una firma diferente → requiere verificación en Fase 1
- Tests existentes pueden estar mockeando `fetch` global → necesitan actualización para mockear `window.agentsFlow.githubFetch`
- Si el token se maneja en el renderer store, extraerlo para pasarlo como parámetro puede requerir refactor adicional

---

*Documento generado: 2026-04-23*
*Proyecto: drassMemorIA / agentsFlow*

---
