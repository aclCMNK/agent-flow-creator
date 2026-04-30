# Diseño de autenticación para repositorios privados (GitLab / Bitbucket)

Ruta: /home/kamiloid/projs/drassMemorIA/editors/agentsFlow/docs/auth-private-repos.md

1. Contexto del proyecto
------------------------

- Aplicación: Electron con contextIsolation: true y nodeIntegration: false.
- Todo acceso a red y filesystem ocurre en el main process.
- El renderer comunica con main exclusivamente vía contextBridge → ipcRenderer.invoke().
- Tokens NUNCA se loguean.
- Se fuerza comportamiento no interactivo en git: GIT_TERMINAL_PROMPT: "0".
- Infraestructura previa para GitHub PAT existe (ej.: GitHubFetchRequest.token?: string, detectRepoVisibility(url, token?)).
- No hay almacenamiento persistente de credenciales: las credenciales son efímeras y viven en el estado local del renderer mientras el modal está abierto.

2. Objetivo
-----------

Documentar el diseño completo para detectar plataforma desde una URL, validar credenciales contra la API de la plataforma y ejecutar clones autenticados para repos privados en GitLab (incluido self-hosted) y Bitbucket.

3. Tipos y estructuras principales
---------------------------------

```ts
type Platform = "github" | "gitlab" | "gitlab-self-hosted" | "bitbucket" | "unknown"
type CredentialType = "pat" | "basic" | "none"

interface PlatformInfo {
  platform: Platform
  credentialType: CredentialType
  apiBase: string        // e.g. "https://gitlab.com/api/v4"
  host: string
  repoPath: string       // e.g. "user/repo" o "group/subgroup/repo"
}
```

4. Detección de plataforma desde URL
------------------------------------

Reglas (aplicar en orden de prioridad):

1. hostname === "github.com" → GITHUB
2. hostname === "gitlab.com" → GITLAB
3. hostname === "bitbucket.org" → BITBUCKET
4. hostname.includes("gitlab") → GITLAB_SELF_HOSTED
5. API probe: GET https://{host}/api/v4/version → si 200, GITLAB_SELF_HOSTED
6. fallback → UNKNOWN

Notas:
- El probe a instancias self-hosted debe usar timeout corto (3s) y no bloquear UI.
- Preservar host:port si la URL incluye puerto no estándar.
- Normalizar URL: añadir sufijo `.git` si hace falta para la etapa de git clone.

Ejemplo de función (sólo firma / pseudocódigo):

```ts
async function detectPlatform(url: string): Promise<PlatformInfo> { /* ... */ }
```

5. Credenciales por plataforma
------------------------------

| Plataforma | Tipo | Campos UI | Header de autenticación |
|---|---:|---|---|
| GitHub | PAT | token | Authorization: Bearer {token} |
| GitLab | PAT (scope: read_repository) | token | PRIVATE-TOKEN: {token} |
| GitLab Self-Hosted | PAT | token + host detectado | PRIVATE-TOKEN: {token} |
| Bitbucket | App Password | username + appPassword | Authorization: Basic base64(user:pass) |

6. Flujo seguro por plataforma (resumen)
---------------------------------------

Flujo general:

```text
Renderer: captura credenciales en formulario local
    ↓ ipcRenderer.invoke("VALIDATE_CREDENTIALS", { platform, url, credentials })
Main: valida contra API de la plataforma
    ↓ retorna { valid, repoName, isPrivate, error }
Renderer: si válido, invoca clone
    ↓ ipcRenderer.invoke("git:clone", { url, destDir, credentials })
Main: construye URL autenticada → spawn git clone → NUNCA loguea URL con token
    ↓ retorna { success, errorCode? }
Renderer: muestra resultado (sin credenciales)
```

7. Validación por plataforma (detalles)
--------------------------------------

GitLab (incl. self-hosted):

```ts
// GET {apiBase}/projects/{encodeURIComponent(repoPath)}
// Headers: { "PRIVATE-TOKEN": token }
// 200 → válido
// 401 → token inválido
// 404 → repo no encontrado o sin acceso
async function validateGitLabCredentials(apiBase: string, repoPath: string, token: string) {
  // fetch(`${apiBase}/projects/${encodeURIComponent(repoPath)}`, { headers: { 'PRIVATE-TOKEN': token }, timeout: 3000 })
}
```

Bitbucket:

```ts
// GET https://api.bitbucket.org/2.0/repositories/{workspace}/{slug}
// Headers: { "Authorization": `Basic ${base64(username:appPassword)}` }
// 200 → válido
// 401 → credenciales inválidas
// 403 → App Password sin scope "repository:read"
async function validateBitbucketCredentials(workspace: string, slug: string, username: string, appPassword: string) {
  // fetch(`https://api.bitbucket.org/2.0/repositories/${workspace}/${slug}`, { headers: { 'Authorization': `Basic ${base64}` } })
}
```

Observaciones:
- La respuesta al renderer NO debe incluir las credenciales ni el token.
- Validaciones deben distinguir 401 vs 403 cuando la API lo permita para dar mensajes más claros.

8. Inyección de credenciales en git clone
----------------------------------------

Método elegido: URL embedding (no usar archivos temporales en disco).

Plantillas de URL autenticada (ejemplos TypeScript):

```ts
// GitLab (PAT): "oauth2" como username es aceptado por GitLab
const gitlabUrl = `https://oauth2:${encodeURIComponent(token)}@${host}/${repoPath}.git`

// Bitbucket (App Password):
const bitbucketUrl = `https://${encodeURIComponent(username)}:${encodeURIComponent(appPassword)}@bitbucket.org/${repoPath}.git`

// GitHub (PAT):
const githubUrl = `https://${encodeURIComponent(token)}@github.com/${repoPath}.git`
```

Reglas de seguridad relacionadas:
- buildAuthenticatedUrl() → resultado NUNCA pasa por IPC y NUNCA se loguea.
- Las credenciales se mantienen en memoria del proceso main durante la operación y se eliminan inmediatamente después.
- Se establece GIT_TERMINAL_PROMPT: "0" en el ambiente del proceso git.

Métodos descartados y por qué:
- GIT_ASKPASS: requiere crear un script ejecutable en disco (superficie de ataque y problemas de limpieza si el proceso muere).
- .netrc temporal: riesgo de exposición si el proceso muere antes de limpiar o si existe otro proceso malicioso en el sistema.

Sanitización de errores de git (para evitar filtrar URL con token desde stderr/stdout):

```ts
function sanitizeGitError(stderr: string): string {
  return stderr.replace(/https?:\/\/[^@]+@/g, "https://[REDACTED]@")
}
```

9. Nuevos canales IPC
---------------------

DETECT_PLATFORM
- Request:  { url: string }
- Response: { platform, credentialType, apiBase, host, repoPath, isKnown }

VALIDATE_CREDENTIALS
- Request:  { platform, url, credentials: GitLabCreds | BitbucketCreds | GitHubCreds }
- Response: { valid: boolean, repoName?: string, isPrivate?: boolean, error?: string }

git:clone (extensión del existente)
- Request:  { url, destDir, repoName?, credentials?: RepoCredentials }
- Response: { success: boolean, errorCode?: string }

Reglas IPC / seguridad:
- Nunca enviar tokens/credenciales en respuestas al renderer.
- Sanitizar cualquier stderr antes de retornar errores.
- buildAuthenticatedUrl() debe ejecutarse en main process y no exponerse.

10. UI: Formulario dinámico
---------------------------

- La UI invoca DETECT_PLATFORM al pegar/introducir la URL.
- Muestra badge visual con la plataforma detectada (GitHub / GitLab / Bitbucket / Unknown).
- Campos según credentialType:
  - pat: campo token (input type=password)
  - basic: campos username (text) + appPassword (password)
  - none: sin campos (repos públicos o plataforma desconocida)
- Incluir links contextuales a documentación de cada plataforma para crear PAT / App Password.
- No persistir credenciales en localStorage/sessionStorage; mantenerlas en estado local del componente.

11. Edge cases y manejo
-----------------------

| Caso | Plataforma | Manejo |
|---|---|---|
| GitLab self-hosted con subgrupos | GitLab SH | repoPath incluye `group/subgroup/repo` — usar encodeURIComponent del path completo |
| Bitbucket workspace ≠ username | Bitbucket | `workspace` es el primer segmento del path, no el username del token |
| Token con caracteres especiales en URL | Todos | encodeURIComponent(token) en URL embedding |
| GitLab self-hosted con SSL self-signed | GitLab SH | Opción avanzada `GIT_SSL_NO_VERIFY=1`, desactivada por defecto |
| Bitbucket App Password sin scope `repository:read` | Bitbucket | API retorna 403 — mostrar mensaje específico indicando scope faltante |
| Redirect 301 en repo movido | Todos | fetch sigue redirects — validar host final y alertar si cambia de host |
| GitLab PAT expirado | GitLab | 401 con body `{"message":"401 Unauthorized"}` — mostrar error de token expirado |
| URL sin `.git` suffix | Todos | Normalizar para clone añadiendo `.git` cuando corresponda |
| GitLab self-hosted en puerto no-standard | GitLab SH | Preservar `host:port` en PlatformInfo y en URL autenticada |

12. Reglas de seguridad (resumidas)
---------------------------------

1. buildAuthenticatedUrl() → el string resultante NUNCA pasa por IPC y NUNCA se loguea.
2. Credenciales capturadas en renderer → sólo en estado local del componente, nunca en localStorage/sessionStorage.
3. Canal VALIDATE_CREDENTIALS → la respuesta no incluye credenciales.
4. Errores de git clone → sanitizar stderr antes de enviar al renderer.
5. API probe a instancias self-hosted → timeout corto (3s), no bloquear UI.
6. Mantener GIT_TERMINAL_PROMPT: "0" en todos los clones.

13. Fases de implementación
--------------------------

Phase 1 — Detección:
- Implementar detectPlatform() y probeGitLabInstance().
- Registrar canal IPC DETECT_PLATFORM.
- Implementar badge en modal.

Phase 2 — Validación:
- Implementar validateGitLabCredentials() y validateBitbucketCredentials().
- Registrar canal IPC VALIDATE_CREDENTIALS.
- Implementar CredentialForm dinámico en UI.

Phase 3 — Clone autenticado:
- Implementar buildAuthenticatedUrl() en main.
- Integrar en cloneWithCredentials() (extensión de git:clone).
- Añadir sanitizeGitError() en el handler de stderr.

Phase 4 — Polish:
- Manejo de SSL self-signed para GitLab self-hosted (opcional, con advertencias).
- Mensajes de error específicos por plataforma.
- Links a documentación de cada plataforma en UI.

14. Decisiones de diseño
------------------------

Decisión principal: usar URL embedding para pasar credenciales a git clone.

Motivación y razones:

- Simplicidad operativa: generar una URL con credenciales y pasarla como origen al comando `git clone` es directo y funciona con GitHub, GitLab y Bitbucket.
- Evita escribir archivos en disco: tanto GIT_ASKPASS como archivos temporales (.netrc) requieren crear artefactos en el sistema de archivos que aumentan la superficie de ataque y requieren lógica de limpieza compleja si el proceso muere inesperadamente.
- Menor vector de errores: GIT_ASKPASS requiere un script ejecutable y su manejo de permisos y path introduce complejidad en múltiples plataformas (Windows, macOS, Linux).
- Control de exposición: aunque la URL puede aparecer en stderr por mensajes de git, sanitizamos stderr antes de reenviarlo al renderer usando sanitizeGitError(). Además, buildAuthenticatedUrl() y la lógica de clonación quedan confinadas al main process y nunca atraviesan IPC.

Razones por las que se descartaron otros métodos:

- GIT_ASKPASS: implica crear un ejecutable temporal que devuelve el token. Requiere permisos de ejecución, manejo cross-platform y limpieza robusta. Si el proceso muere, el script puede quedar expuesto en disco.
- .netrc temporal: requiere escribir credenciales en un archivo con acceso legible por el usuario. Si el proceso muere o falla la limpieza, las credenciales quedan persistidas en disco.

15. Snippets relevantes (TypeScript)
----------------------------------

Detect platform (pseudocódigo):

```ts
async function detectPlatformFromUrl(inputUrl: string): Promise<PlatformInfo> {
  // parse URL, aplicar reglas en orden
}
```

Sanitize git stderr:

```ts
function sanitizeGitError(stderr: string): string {
  return stderr.replace(/https?:\/\/[^@]+@/g, "https://[REDACTED]@")
}
```

Construcción de URL autenticada (ejemplo simplificado):

```ts
function buildAuthenticatedUrl(platformInfo: PlatformInfo, credentials: { token?: string; username?: string; appPassword?: string; }): string {
  const { platform, host, repoPath } = platformInfo
  if (platform === 'gitlab' || platform === 'gitlab-self-hosted') {
    return `https://oauth2:${encodeURIComponent(credentials.token ?? '')}@${host}/${repoPath}.git`
  }
  if (platform === 'bitbucket') {
    return `https://${encodeURIComponent(credentials.username ?? '')}:${encodeURIComponent(credentials.appPassword ?? '')}@${host}/${repoPath}.git`
  }
  if (platform === 'github') {
    return `https://${encodeURIComponent(credentials.token ?? '')}@${host}/${repoPath}.git`
  }
  throw new Error('Unsupported platform for authenticated clone')
}
```

16. Consideraciones operativas
-------------------------------

- Timeout y reintentos: las llamadas a API para validar credenciales deben tener timeout corto y un único reintento opcional.
- Logging: nunca loguear tokens. Registrar eventos de éxito/fallo sin incluir valores sensibles.
- Eliminación: limpiar cualquier referencia a credenciales en memoria inmediatamente después de la operación.
- Testing: cubrir casos de 401/403/404 y redirections en tests unitarios/mocks.

17. Referencias rápidas (UI)
---------------------------

- Mostrar link a cómo crear PAT en GitLab (scope read_repository) y Bitbucket App Password (scope repository:read).
- Mostrar mensajes claros cuando la API devuelve 401 vs 403.

18. Pendientes / mejoras futuras
-------------------------------

- Soporte opcional para GIT_ASKPASS en ambientes controlados con políticas estrictas (con consentimiento explícito).
- Integración con un vault externo si se decide persistir credenciales con cifrado y control de acceso.

--

Documento generado a partir de la información técnica provista. Seguir las fases de implementación en orden y cumplir las reglas de seguridad indicadas.
