# 🧠 Plan: Detección Automática de Repositorio Git y URL del Remoto Origin

**Archivo:** `docs/plans/git-remote-detection.md`  
**Fecha:** 2026-04-22  
**Estado:** Planificado  
**Prioridad:** Media  

---

## 🎯 Objetivo

Detectar automáticamente, al abrir un proyecto en el editor visual, si el directorio raíz del proyecto es un repositorio Git y, de serlo, obtener la URL del remoto `origin` para mostrarla en el header del editor.

**Resultado esperado:** Si el proyecto tiene remoto Git configurado, el header del editor mostrará la URL. Si no tiene Git o no tiene remoto, no se muestra nada. Nunca se muestra un error al usuario.

---

## 🧩 Contexto Técnico

### Stack involucrado

| Capa | Tecnología | Relevancia |
|------|-----------|------------|
| **Renderer** | React 19 + TypeScript | Header del editor, store de estado |
| **State** | Zustand (`projectStore.ts`) | Almacena estado del proyecto |
| **Main Process** | Electron + Node.js | Ejecuta comandos del sistema |
| **IPC Bridge** | `preload.ts` + `ipc-handlers.ts` | Canal seguro Renderer ↔ Main |
| **Filesystem** | Node.js `fs`, `child_process` | Detectar `.git/`, ejecutar `git` CLI |

### Punto de entrada del flujo

La apertura de proyecto ocurre en:

```
ProjectBrowser.tsx 
  → projectStore.openProject(dir) 
    → IPC: loadProject(projectDir) 
      → ipc-handlers.ts 
        → loader engine 
          → BridgeLoadResult
```

Después de este flujo, `App.tsx` detecta `project !== null` y navega a `"editor"`.

### Header actual

El header del editor está definido en `App.tsx` (vista `"editor"`). Actualmente muestra:
- Nombre del proyecto
- Botones: Validation, Assets, Export, Save

---

## 🧭 Estrategia

**Enfoque elegido:** Detección en el **Main Process** (Node.js) ejecutada en paralelo con la carga del proyecto.

**Razones:**
1. El Main Process tiene acceso directo a `fs` y `child_process` — sin restricciones de seguridad del renderer
2. No se requieren paquetes externos: solo `fs.existsSync()` + `child_process.execFile()`
3. El renderer no puede ejecutar comandos del sistema (contextIsolation: true)
4. Ejecutar en Main Process permite hacerlo en un thread separado (async/await no bloquea)

**Enfoque cross-platform:**
- Usar `execFile('git', ['remote', 'get-url', 'origin'])` — funciona en Windows, macOS, Linux
- `git` debe estar disponible en PATH (condición razonable en entornos de desarrollo)
- Si `git` no está en PATH → catch silencioso, no se muestra nada

---

## 🚀 Fases de Implementación

---

### 🔹 Fase 1: Detección en el Main Process

**Descripción:**  
Crear una función utilitaria en el Main Process que detecte `.git/` y obtenga la URL del remoto origin, sin dependencias externas.

**Archivo a crear:** `src/electron/git-detector.ts`

**Algoritmo:**

```typescript
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";

/**
 * Detecta si un directorio es un repositorio Git y retorna
 * la URL del remoto origin si existe.
 *
 * @returns URL del remoto o null si no aplica / hay error
 */
export async function detectGitRemoteOrigin(
  projectDir: string
): Promise<string | null> {
  try {
    // 1. Verificar existencia de .git (sin salir del directorio)
    const gitDir = join(projectDir, ".git");
    if (!existsSync(gitDir)) {
      return null;
    }

    // 2. Ejecutar git CLI para obtener URL del remoto origin
    return await new Promise<string | null>((resolve) => {
      execFile(
        "git",
        ["remote", "get-url", "origin"],
        {
          cwd: projectDir,
          timeout: 3000,         // máximo 3 segundos
          windowsHide: true,     // no mostrar ventana en Windows
        },
        (error, stdout) => {
          if (error || !stdout.trim()) {
            resolve(null);       // sin remoto o git no disponible
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
  } catch {
    // Cualquier error inesperado → silencio total
    return null;
  }
}
```

**Tareas:**

- **Task:** Crear `src/electron/git-detector.ts` con la función `detectGitRemoteOrigin`
  - **Assigned to:** developer
  - **Dependencies:** Ninguna — es archivo nuevo independiente

---

### 🔹 Fase 2: Nuevo IPC Handler

**Descripción:**  
Registrar un nuevo endpoint IPC `GET_GIT_REMOTE_ORIGIN` que el renderer pueda invocar para solicitar la URL del remoto.

**Archivos a modificar:**
- `src/electron/ipc-handlers.ts` — registrar handler
- `src/electron/preload.ts` — exponer función en `window.agentsFlow`
- `src/electron/bridge.types.ts` — declarar tipos del bridge

**Definición del canal:**

```typescript
// Nombre del canal IPC
const CHANNEL = "GET_GIT_REMOTE_ORIGIN";

// Handler en main process
ipcMain.handle(CHANNEL, async (_event, projectDir: string) => {
  return detectGitRemoteOrigin(projectDir);
  // Retorna: string | null
  // Nunca lanza excepción (manejado internamente)
});
```

**Exposición en preload.ts:**

```typescript
// Dentro de window.agentsFlow:
getGitRemoteOrigin: (projectDir: string): Promise<string | null> =>
  ipcRenderer.invoke("GET_GIT_REMOTE_ORIGIN", projectDir),
```

**Tipo en bridge.types.ts:**

```typescript
// En la interfaz AgentsFlowBridge:
getGitRemoteOrigin: (projectDir: string) => Promise<string | null>;
```

**Tareas:**

- **Task:** Agregar `ipcMain.handle("GET_GIT_REMOTE_ORIGIN", ...)` en `ipc-handlers.ts`
  - **Assigned to:** developer
  - **Dependencies:** Fase 1 completada

- **Task:** Exponer `getGitRemoteOrigin` en `preload.ts` via contextBridge
  - **Assigned to:** developer
  - **Dependencies:** Fase 1 completada

- **Task:** Declarar tipo `getGitRemoteOrigin` en `bridge.types.ts`
  - **Assigned to:** developer
  - **Dependencies:** Ninguna (puede hacerse en paralelo con Fase 1)

---

### 🔹 Fase 3: Integración en el Project Store

**Descripción:**  
Extender `projectStore.ts` para almacenar la URL del remoto Git y dispararla automáticamente al abrir un proyecto.

**Archivo a modificar:** `src/ui/store/projectStore.ts`

**Cambios en el estado:**

```typescript
// Agregar al ProjectState:
interface ProjectState {
  // ... campos existentes ...
  gitRemoteOrigin: string | null;  // nueva propiedad
}

// Valor inicial:
gitRemoteOrigin: null,
```

**Cambios en la acción `openProject`:**

```typescript
// Dentro de openProject(dir), DESPUÉS de confirmar success=true:
async openProject(dir: string) {
  // ... lógica existente de carga ...
  
  if (result.success) {
    set({ project: result.project, currentView: "editor" });
    
    // Detectar Git en background (no bloquea la navegación)
    // Fire-and-forget con actualización posterior
    window.agentsFlow
      .getGitRemoteOrigin(dir)
      .then((remoteUrl) => {
        set({ gitRemoteOrigin: remoteUrl ?? null });
      })
      .catch(() => {
        set({ gitRemoteOrigin: null });
      });
  }
}
```

**Tareas:**

- **Task:** Agregar `gitRemoteOrigin: string | null` al estado de `projectStore.ts`
  - **Assigned to:** developer
  - **Dependencies:** Fase 2 completada

- **Task:** Disparar `getGitRemoteOrigin` en `openProject` de forma async (fire-and-forget)
  - **Assigned to:** developer
  - **Dependencies:** Mismo archivo, campo ya agregado

- **Task:** Resetear `gitRemoteOrigin` a `null` en `closeProject` / cuando se cierra el editor
  - **Assigned to:** developer
  - **Dependencies:** Campo agregado

---

### 🔹 Fase 4: Actualización del Header del Editor

**Descripción:**  
Mostrar la URL del remoto Git en el header del editor visual cuando esté disponible.

**Archivo a modificar:** `src/ui/App.tsx` (sección del header de la vista `"editor"`)

**Comportamiento:**
- Si `gitRemoteOrigin` es `null` → no se renderiza nada adicional
- Si `gitRemoteOrigin` tiene valor → se muestra como badge/link discreto en el header
- La URL es solo informativa (no clickeable en MVP, o clickeable para abrir en browser si se desea)

**Implementación del componente:**

```tsx
// En App.tsx, dentro del header del editor:
const { project, gitRemoteOrigin } = useProjectStore();

// En el JSX del header:
{gitRemoteOrigin && (
  <span
    className="git-remote-badge"
    title={gitRemoteOrigin}
    onClick={() => {
      // Opcional: abrir URL en browser externo
      // window.agentsFlow.openExternal?.(gitRemoteOrigin);
    }}
  >
    <GitIcon /> {/* SVG inline o emoji */}
    <span className="git-remote-url">{gitRemoteOrigin}</span>
  </span>
)}
```

**CSS sugerido (en el archivo de estilos correspondiente):**

```css
.git-remote-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted, #888);
  background: var(--bg-subtle, rgba(0,0,0,0.15));
  border-radius: 4px;
  padding: 2px 8px;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

.git-remote-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Tareas:**

- **Task:** Leer `gitRemoteOrigin` desde `projectStore` en el header de `App.tsx`
  - **Assigned to:** developer
  - **Dependencies:** Fase 3 completada

- **Task:** Renderizar badge condicional en el header del editor
  - **Assigned to:** developer
  - **Dependencies:** Campo disponible en store

- **Task:** Agregar estilos CSS para el badge (discreto, no intrusivo)
  - **Assigned to:** developer
  - **Dependencies:** Badge renderizado

---

## ⚠️ Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| `git` no instalado en el sistema del usuario | Media | `catch` silencioso → `null`. No se muestra nada |
| Directorio con `.git/` pero sin remoto configurado | Alta | `git remote get-url origin` retorna error → `null` |
| `git` lento (red lenta, repo grande, etc.) | Baja | `timeout: 3000ms` en `execFile` + fire-and-forget |
| `.git` es un archivo (git worktrees) | Media | `existsSync` retorna `true` igualmente; `git` CLI maneja worktrees |
| URL del remoto muy larga | Alta | CSS `text-overflow: ellipsis` + `max-width` en el badge |
| Ruta con espacios o caracteres especiales en Windows | Media | `execFile` (no `exec`) evita interpolación de shell |
| Proyecto cerrado antes de que resuelva la promesa | Baja | `closeProject` resetea `gitRemoteOrigin: null` en el store |

---

## 🔧 Consideraciones de Performance

### Threading

- **No bloquea la UI:** La llamada IPC es async. El editor navega a la vista inmediatamente.
- **Fire-and-forget:** El store actualiza `gitRemoteOrigin` cuando resuelve (100–500ms típicamente).
- **Timeout duro:** `execFile` tiene `timeout: 3000ms`. Jamás bloqueará más de 3 segundos.
- **Sin polling:** La detección ocurre una sola vez al abrir el proyecto.

### Memoria

- Solo se almacena un string (`string | null`) en el store — overhead negligible.
- No hay listeners persistentes ni watchers del filesystem.

---

## 🌐 Compatibilidad Cross-Platform

| Sistema | Comportamiento esperado |
|---------|------------------------|
| **Linux** | `git` normalmente en PATH. `execFile('git', ...)` funciona directamente |
| **macOS** | `git` incluido con Xcode CLI Tools. Funciona igual |
| **Windows** | `git` en PATH si Git for Windows está instalado. `windowsHide: true` evita ventana CMD |
| **Windows (sin git)** | `execFile` falla silenciosamente → `catch` → `null` |

**Nota Windows:** `execFile` (a diferencia de `exec`) no usa shell, lo que:
1. Evita problemas con espacios en rutas
2. Evita inyección de comandos
3. Funciona correctamente con `git.exe` en PATH

---

## 📦 Dependencias

**Sin dependencias externas.** Uso exclusivo de módulos nativos de Node.js:

| Módulo | Uso |
|--------|-----|
| `node:fs` | `existsSync()` para detectar `.git/` |
| `node:child_process` | `execFile()` para invocar `git` CLI |
| `node:path` | `join()` para construir ruta `.git/` |

---

## 📁 Archivos Involucrados

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `src/electron/git-detector.ts` | Función `detectGitRemoteOrigin()` |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/electron/ipc-handlers.ts` | Registrar handler `GET_GIT_REMOTE_ORIGIN` |
| `src/electron/preload.ts` | Exponer `getGitRemoteOrigin` en `window.agentsFlow` |
| `src/electron/bridge.types.ts` | Declarar tipo del nuevo método bridge |
| `src/ui/store/projectStore.ts` | Agregar `gitRemoteOrigin` al estado + lógica en `openProject` |
| `src/ui/App.tsx` | Mostrar badge en header del editor |
| `src/ui/styles/*.css` | Agregar estilos para `.git-remote-badge` |

---

## 📝 Notas Adicionales

1. **No usar `simplegit` ni `isomorphic-git`:** El requerimiento es sin dependencias de terceros. El approach con `execFile` + `git` CLI nativo cumple el objetivo con menor superficie de falla.

2. **Seguridad IPC:** El `projectDir` recibido en el handler IPC ya fue validado en la carga del proyecto. El riesgo de path traversal es mínimo, pero el handler solo ejecuta `git remote get-url origin` (comando de solo lectura).

3. **MVP primero:** En la primera iteración, el badge muestra la URL como texto plano. En iteraciones futuras se puede agregar:
   - Click para abrir en browser (`shell.openExternal`)
   - Icono de GitHub/GitLab detectado por URL
   - Indicador de rama actual (`git branch --show-current`)

4. **Reset al cerrar proyecto:** Cuando el usuario regresa a la vista `"browser"`, el store debe limpiar `gitRemoteOrigin: null` para evitar que un proyecto anterior "contamine" el estado.

5. **Proyectos clonados desde Git:** El flujo de "Clone from Git" ya abre el proyecto desde un repo Git, por lo que la detección automática funcionará correctamente también en ese caso.

---

## ✅ Criterios de Aceptación

- [ ] Al abrir un proyecto con `.git/` y remoto `origin` configurado → el header muestra la URL
- [ ] Al abrir un proyecto sin `.git/` → el header no muestra nada adicional
- [ ] Al abrir un proyecto con `.git/` pero sin remoto → el header no muestra nada
- [ ] La apertura del editor no se demora por la detección (es async / fire-and-forget)
- [ ] En sistemas sin `git` instalado → no hay errores visibles, no hay crashes
- [ ] La URL se trunca correctamente si es muy larga (CSS ellipsis)
- [ ] Al cerrar el proyecto y abrir otro, el estado anterior no persiste
- [ ] Funciona en Linux, macOS y Windows

---

*Plan generado por Weight-Planner · AgentsFlow · 2026-04-22*
