# 🧠 Plan: Detección de Visibilidad de Repositorio en Modal de Clonación

**Archivo:** `docs/plans/repo-visibility-detection.md`  
**Fecha:** 2026-04-22  
**Estado:** Pendiente de implementación

---

## 🎯 Objetivo

Al perder el foco el campo de URL del repositorio en `CloneFromGitModal.tsx`, consultar la API pública del proveedor Git correspondiente (GitHub, GitLab, Bitbucket) para detectar si el repositorio es público o privado, mostrando feedback visual inmediato al usuario:

- 🟢 **Verde** → "Repositorio público detectado"
- 🔴 **Rojo** → "Repositorio privado, debes ingresar credenciales"

---

## 🧩 Contexto y Restricciones

| Aspecto | Detalle |
|---------|---------|
| Archivo principal | `src/ui/components/CloneFromGitModal.tsx` (445 líneas) |
| Utilidad de URLs | `src/ui/utils/gitUrlUtils.ts` (validateGitUrl, isValidGitUrl) |
| Stack | React 19 + Electron 41 + TypeScript + Zustand |
| Red | Solo `fetch` nativo (sin librerías externas) |
| Scope | Solo renderer/UI — no se toca el main process |
| URLs soportadas | HTTPS únicamente (SSH no es consultable via API REST pública) |
| Proveedores | GitHub, GitLab, Bitbucket (detección por hostname) |

---

## 🧭 Estrategia General

1. **Parseo de URL** → extraer proveedor, owner y repo del campo de texto
2. **Consulta API** → llamada `fetch` sin token a la API pública del proveedor
3. **Interpretación de respuesta** → 200 = público, 404/401/403 = privado/no encontrado
4. **Feedback visual** → estado local en el modal con mensaje color-coded
5. **Edge-cases** → URL inválida, proveedor desconocido, error de red, timeout

---

## 🚀 Fases de Implementación

---

### 🔹 Fase 1: Utilidad de Parseo y Consulta API

**Descripción:**  
Crear el archivo `src/ui/utils/repoVisibility.ts` con toda la lógica pura de detección. Sin efectos de UI, sin estado React. Solo funciones puras y fetch.

**Archivo a crear:** `src/ui/utils/repoVisibility.ts`

#### 1.1 — Parsear la URL y extraer componentes

```typescript
export type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown";

export interface ParsedRepoUrl {
  provider: GitProvider;
  owner: string;
  repo: string;         // sin .git
  rawUrl: string;
}

export function parseRepoUrl(url: string): ParsedRepoUrl | null
```

**Lógica de parseo:**

| Patrón de URL | Proveedor |
|---------------|-----------|
| `github.com` en hostname | `"github"` |
| `gitlab.com` en hostname | `"gitlab"` |
| `bitbucket.org` en hostname | `"bitbucket"` |
| Cualquier otro hostname | `"unknown"` |

- Solo procesar URLs con esquema `https://` o `http://`
- URLs SSH (`git@`, `git://`, `ssh://`) → retornar `null` (no consultables)
- Extraer path: `/owner/repo` o `/owner/repo.git`
- Strippear `.git` del nombre del repo
- Si path no tiene exactamente 2 segmentos no vacíos → `null`

#### 1.2 — Construir endpoint de API según proveedor

```typescript
function buildApiUrl(parsed: ParsedRepoUrl): string
```

| Proveedor | Endpoint |
|-----------|----------|
| GitHub | `https://api.github.com/repos/{owner}/{repo}` |
| GitLab | `https://gitlab.com/api/v4/projects/{owner}%2F{repo}` |
| Bitbucket | `https://api.bitbucket.org/2.0/repositories/{owner}/{repo}` |

#### 1.3 — Resultado de la consulta

```typescript
export type RepoVisibility =
  | "public"       // Accesible sin autenticación
  | "private"      // Existe pero requiere credenciales (401/403)
  | "not_found"    // No existe (404) — tratar como privado en UI
  | "unknown_provider"  // No es GitHub/GitLab/Bitbucket
  | "ssh_url"      // URL SSH, no consultable
  | "network_error"     // Sin conexión o timeout
  | "invalid_url"; // URL no parseada
```

#### 1.4 — Función principal con timeout y abort

```typescript
export async function detectRepoVisibility(
  url: string,
  timeoutMs = 5000
): Promise<RepoVisibility>
```

**Implementación con AbortController:**

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      // GitHub recomienda incluir Accept: application/vnd.github+json
    },
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (response.ok) return "public";           // 200
  if (response.status === 401) return "private"; // Unauthorized
  if (response.status === 403) return "private"; // Forbidden
  if (response.status === 404) return "not_found";
  return "private"; // Cualquier otro status no-ok
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "network_error"; // timeout
  }
  return "network_error"; // sin conexión u otro error fetch
}
```

**Headers por proveedor:**
- GitHub: `Accept: application/vnd.github+json`
- GitLab: `Accept: application/json`
- Bitbucket: `Accept: application/json`

---

### 🔹 Fase 2: Estado y Lógica en CloneFromGitModal

**Descripción:**  
Agregar estado de visibilidad al modal y disparar la detección en el evento `onBlur` del input de URL.

**Archivo a modificar:** `src/ui/components/CloneFromGitModal.tsx`

#### 2.1 — Nuevo tipo de estado

```typescript
type VisibilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "public" }
  | { status: "private" }
  | { status: "ssh_url" }
  | { status: "unknown_provider" }
  | { status: "network_error" }
  | { status: "invalid_url" };
```

#### 2.2 — useState para visibilidad

```typescript
const [visibility, setVisibility] = useState<VisibilityState>({ status: "idle" });
```

Resetear junto con el resto del estado cuando el modal se abre/cierra:
```typescript
setVisibility({ status: "idle" });
```

#### 2.3 — Handler onBlur en el input de URL

```typescript
const handleUrlBlur = useCallback(async () => {
  // 1. Marcar campo como tocado (ya existe urlTouched)
  setUrlTouched(true);

  // 2. Si URL vacía o inválida, no consultar
  if (!repoUrl.trim() || !isValidGitUrl(repoUrl)) {
    setVisibility({ status: "idle" });
    return;
  }

  // 3. Indicar que estamos consultando
  setVisibility({ status: "checking" });

  // 4. Llamar a detectRepoVisibility
  const result = await detectRepoVisibility(repoUrl);

  // 5. Mapear resultado a estado
  setVisibility({ status: result === "not_found" ? "private" : result });
}, [repoUrl]);
```

> **Nota:** `not_found` (404) se trata igual que `private` en la UI, ya que el repositorio puede existir pero ser privado (GitHub retorna 404 para repos privados sin token, no 403).

#### 2.4 — Cancelar detección si el modal se cierra

Usar `useRef` para el AbortController o simplemente ignorar el resultado si el componente está desmontado:

```typescript
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;
  return () => { mountedRef.current = false; };
}, []);

// En handleUrlBlur, antes de setVisibility:
if (!mountedRef.current) return;
```

#### 2.5 — Reset al cambiar la URL

Cuando el usuario modifica el campo (`onChange`), resetear la visibilidad:
```typescript
onChange={(e) => {
  setRepoUrl(e.target.value);
  setVisibility({ status: "idle" }); // ← agregar esto
}}
```

---

### 🔹 Fase 3: Componente de Feedback Visual

**Descripción:**  
Crear el componente `RepoVisibilityBadge` que renderiza el mensaje color-coded según el estado.

**Archivo a crear:** `src/ui/components/RepoVisibilityBadge.tsx`

#### 3.1 — Props

```typescript
interface RepoVisibilityBadgeProps {
  status: VisibilityState["status"];
}
```

#### 3.2 — Mapa de mensajes y estilos

| Status | Color | Mensaje |
|--------|-------|---------|
| `"idle"` | — | *(no renderizar nada)* |
| `"checking"` | Gris/neutro | "Verificando repositorio…" |
| `"public"` | Verde (#22c55e) | "✓ Repositorio público detectado" |
| `"private"` | Rojo (#ef4444) | "✗ Repositorio privado, debes ingresar credenciales" |
| `"ssh_url"` | Amarillo (#f59e0b) | "⚠ URL SSH detectada, no se puede verificar visibilidad" |
| `"unknown_provider"` | Amarillo (#f59e0b) | "⚠ Proveedor no reconocido, no se puede verificar" |
| `"network_error"` | Naranja (#f97316) | "⚠ No se pudo verificar (error de red o timeout)" |
| `"invalid_url"` | — | *(no renderizar — el validador de URL ya muestra error)* |

#### 3.3 — Estructura del componente

```tsx
export function RepoVisibilityBadge({ status }: RepoVisibilityBadgeProps) {
  if (status === "idle" || status === "invalid_url") return null;

  const config = VISIBILITY_CONFIG[status];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ color: config.color, fontSize: "0.85rem", marginTop: "4px" }}
    >
      {config.message}
    </div>
  );
}
```

#### 3.4 — Indicador de carga (checking)

Para `"checking"`, mostrar un spinner simple CSS (sin librería):
```tsx
// Spinner inline con CSS animation
<span className="repo-checking-spinner" aria-hidden="true" />
<span> Verificando repositorio…</span>
```

CSS en el stylesheet existente o inline:
```css
@keyframes spin { to { transform: rotate(360deg); } }
.repo-checking-spinner {
  display: inline-block;
  width: 10px; height: 10px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}
```

---

### 🔹 Fase 4: Integración en el JSX del Modal

**Descripción:**  
Conectar el handler `onBlur`, el estado y el badge en el JSX de `CloneFromGitModal.tsx`.

#### 4.1 — Input URL actualizado

```tsx
<input
  type="text"
  value={repoUrl}
  onChange={(e) => {
    setRepoUrl(e.target.value);
    setVisibility({ status: "idle" }); // ← nuevo
  }}
  onBlur={handleUrlBlur}   // ← nuevo (antes solo setUrlTouched(true))
  placeholder="https://github.com/owner/repo.git"
  aria-label="Repository URL"
  autoFocus
  disabled={phase === "cloning"}
/>
```

#### 4.2 — Badge posicionado bajo el input de URL

```tsx
{/* Mensaje de validación de formato (ya existente) */}
{urlTouched && urlValidation.error && (
  <span className="field-error">{urlValidation.error}</span>
)}

{/* Nuevo badge de visibilidad */}
<RepoVisibilityBadge status={visibility.status} />
```

---

### 🔹 Fase 5: Edge Cases y Manejo de Errores

**Descripción:**  
Cubrir todos los casos no estándar que pueden ocurrir.

| Edge Case | Comportamiento esperado |
|-----------|------------------------|
| Campo URL vacío al perder foco | No consultar, `status: "idle"` |
| URL con formato inválido | No consultar, dejar que `urlValidation.error` lo maneje |
| URL SSH (`git@github.com:...`) | `status: "ssh_url"` con mensaje amarillo |
| URL de servidor self-hosted (ej. GitLab interno) | `status: "unknown_provider"` |
| Timeout (>5s sin respuesta) | `status: "network_error"` |
| Sin acceso a internet | `status: "network_error"` |
| GitHub retorna 404 para repo privado | Tratar como `"private"` |
| GitLab retorna 404 para repo privado | Tratar como `"private"` |
| Bitbucket retorna 404 para repo privado | Tratar como `"private"` |
| Modal cerrado durante la consulta | Ignorar resultado (`mountedRef`) |
| Usuario escribe URL, borra, reescribe | Cada blur dispara nueva consulta; onChange resetea a `idle` |
| URL con query params o anchors | Parsear solo el path base, ignorar `?` y `#` |
| Repo name con caracteres especiales | Encodear en la URL de la API (`encodeURIComponent`) |
| Rate limiting de GitHub API (429) | Tratar como `"network_error"` o `"private"` |

---

### 🔹 Fase 6: Tipos Compartidos

**Descripción:**  
Mover el tipo `VisibilityState` a un lugar compartido para evitar duplicación entre `CloneFromGitModal.tsx` y `RepoVisibilityBadge.tsx`.

**Opción A** — Exportar desde `repoVisibility.ts`:
```typescript
// src/ui/utils/repoVisibility.ts
export type VisibilityStatus = RepoVisibility | "checking" | "idle";
```

**Opción B** — Definir en `RepoVisibilityBadge.tsx` y re-exportar.

→ **Recomendación:** Opción A. Centraliza en la utilidad, el componente importa desde ahí.

---

## 📁 Árbol de Archivos Afectados

```
src/
├── ui/
│   ├── components/
│   │   ├── CloneFromGitModal.tsx        ← MODIFICAR
│   │   └── RepoVisibilityBadge.tsx      ← CREAR NUEVO
│   └── utils/
│       ├── gitUrlUtils.ts               ← SOLO LECTURA (ya existe)
│       └── repoVisibility.ts            ← CREAR NUEVO
```

**Total:** 1 archivo modificado, 2 archivos nuevos.

---

## ⚠️ Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| CORS bloqueando fetch desde Electron | Electron renderer tiene acceso completo a red; CORS no aplica en `BrowserWindow` con `webSecurity` estándar. Verificar si `webSecurity: false` es necesario (generalmente no). |
| Rate limiting de GitHub (60 req/hora sin token) | Aceptable para uso típico; documentar limitación. No implementar caché en esta fase. |
| Falso positivo: repo público que da 404 por typo en URL | La UI muestra "privado o no encontrado" — el usuario puede corregir la URL. |
| Electron `net` module vs `fetch` global | React 19 + Electron 41: `fetch` global está disponible en el renderer. Usar directamente. |
| Incompatibilidad de `AbortController` en Electron | Electron 41 usa Chromium moderno; `AbortController` es totalmente soportado. |

---

## 📝 Notas Adicionales

1. **No se modifica el main process** — toda la lógica es en el renderer (React). No se agrega ningún IPC channel nuevo.

2. **Sin token de autenticación** — la detección es deliberadamente sin autenticación. Si el repo es privado, el usuario ingresará credenciales en el flujo de clonación existente.

3. **GitLab self-hosted** — URLs como `https://gitlab.empresa.com/...` caerán en `unknown_provider`. Solo `gitlab.com` es soportado.

4. **La detección no bloquea el botón Clone** — es feedback informativo. El usuario puede clonar igualmente.

5. **Accesibilidad** — usar `role="status"` y `aria-live="polite"` en el badge para screen readers.

6. **i18n** — el proyecto tiene `src/ui/i18n/`. Los mensajes del badge deben agregarse ahí si el sistema de i18n ya está activo en el modal. Si no, usar strings directos por ahora.

---

## ✅ Criterios de Aceptación

- [ ] Al perder el foco en el campo URL con una URL HTTPS válida de GitHub/GitLab/Bitbucket, se dispara la consulta
- [ ] Mientras se consulta, se muestra "Verificando repositorio…" con spinner
- [ ] Repo público → mensaje verde "✓ Repositorio público detectado"
- [ ] Repo privado/no encontrado → mensaje rojo "✗ Repositorio privado, debes ingresar credenciales"
- [ ] URL SSH → mensaje amarillo de advertencia
- [ ] Proveedor no reconocido → mensaje amarillo de advertencia
- [ ] Error de red/timeout → mensaje naranja
- [ ] Cambiar el texto del campo resetea el badge a vacío
- [ ] Cerrar el modal mientras se consulta no produce errores ni state updates en componente desmontado
- [ ] No se usan librerías externas (solo `fetch` nativo)
- [ ] No se agrega ningún IPC channel ni se modifica el main process

---

*Plan generado por Weight-Planner — AgentsFlow Project*
