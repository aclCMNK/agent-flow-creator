# Plan: Clonación de Repositorios Privados de GitHub en Electron

## Índice

1. [Objetivo](#1-objetivo)
2. [Contexto](#2-contexto)
3. [Arquitectura de Seguridad y Almacenamiento](#3-arquitectura-de-seguridad-y-almacenamiento)
4. [Flujo UI/UX](#4-flujo-uiux)
5. [Backend — Main Process](#5-backend---main-process)
6. [Ciclo de Vida de Credenciales](#6-ciclo-de-vida-de-credenciales)
7. [Edge Cases y Manejo de Errores](#7-edge-cases-y-manejo-de-errores)
8. [Dependencias Requeridas](#8-dependencias-requeridas)
9. [Riesgos](#9-riesgos)
10. [Orden de Implementación](#10-orden-de-implementación)
11. [Mejores Prácticas Electron](#11-mejores-prácticas-electron)

---

## 1. Objetivo
Implementar un flujo seguro, robusto y con buena UX para que el usuario pueda clonar repositorios privados de GitHub desde una aplicación Electron, manejando credenciales (PAT) de forma segura entre procesos.

---

## 2. Contexto
- Aplicación Electron con main process + renderer process
- Ya existe detección de repositorio privado con mensaje al usuario en inglés
- GitHub deprecó autenticación por usuario/contraseña — solo PAT (Personal Access Token) es válido
- El token nunca debe llegar al renderer process

---

## 3. Arquitectura de Seguridad y Almacenamiento

### 3.1 Configuración Electron (obligatoria)
- `contextIsolation: true`
- `nodeIntegration: false`
- `preload.js` como único puente entre renderer y main
- API mínima expuesta via `contextBridge`

### 3.2 Almacenamiento de Credenciales
- **Preferido:** `keytar` — usa Keychain (macOS), Credential Manager (Windows), libsecret (Linux)
- **Alternativa:** `electron-store` con encriptación (menos seguro)
- Clave de almacenamiento sugerida: `drass:github:<host>`
- Nunca escribir token en logs, archivos planos o variables de entorno globales

### 3.3 Flujo IPC Seguro
- Renderer → Main: envía solo intenciones/señales (nunca el token crudo)
- Main → Renderer: devuelve solo estados (éxito, error, progreso)
- Canales IPC tipados y validados en ambos extremos
- Token permanece exclusivamente en el main process

---

## 4. Flujo UI/UX

```
[Repo detectado como privado]
        ↓
[Modal: "This repository is private"]
  - Option A: Enter Personal Access Token
  - Option B: Cancel
        ↓
[Credentials Form]
  - Field: Personal Access Token (input type=password)
  - Checkbox: "Remember credentials for this host"
  - Button: Clone / Cancel
        ↓
[Optional: Pre-validate token via GitHub API]
        ↓
[Cloning Progress]
  - Progress bar / spinner
  - Button: Cancel cloning
        ↓
[Result]
  - Success: "Repository cloned successfully"
  - Error: Specific message + suggested action
```

### Mensajes de Error por Tipo
| Código/Causa | Mensaje al Usuario |
|---|---|
| 401 — Token inválido/expirado | "Your token has expired. Generate a new one in GitHub Settings → Developer settings → Personal access tokens." |
| 403 — Sin permisos | "You don't have permission to access this repository." |
| 404 — No encontrado | "Repository not found. Check the URL and try again." |
| Timeout / ECONNREFUSED | "No internet connection. Check your network and try again." |
| Cancelado por usuario | "Cloning cancelled." |
| Token sin scopes suficientes | "Your token doesn't have read access to repositories. Check the scopes in GitHub." |
| ENOSPC — Disco lleno | "Not enough disk space. Free up space and try again." |
| Directorio ya existe | "The destination directory already exists. Choose a different location." |

---

## 5. Backend — Main Process

### 5.1 Construcción de URL Autenticada
- Formato: `https://<token>@github.com/<owner>/<repo>.git`
- El token se inyecta en la URL solo en memoria, nunca se loggea
- **Alternativa más segura:** usar `GIT_ASKPASS` o credential helper temporal para evitar token en URL

### 5.2 Ejecución de git clone
- Usar `child_process.spawn` (no `exec`) para control granular
- Capturar stdout/stderr para progreso y errores
- Implementar timeout configurable
- Implementar señal de cancelación (kill del proceso hijo)
- Registrar PID del proceso para limpieza en caso de crash

### 5.3 IPC Handlers en Main Process
| Canal | Dirección | Descripción |
|---|---|---|
| `clone:start` | renderer → main | Inicia clonación con repo URL + token |
| `clone:cancel` | renderer → main | Cancela proceso hijo activo |
| `clone:progress` | main → renderer | Emite progreso de clonación |
| `clone:result` | main → renderer | Resultado final (éxito/error) |
| `credentials:save` | renderer → main | Guarda token en keytar |
| `credentials:get` | renderer → main | Recupera token de keytar |
| `credentials:delete` | renderer → main | Elimina token de keytar |

### 5.4 Limpieza Post-Operación
- Si clonación falla o es cancelada → eliminar directorio parcial
- Limpiar token de memoria inmediatamente tras uso
- No dejar procesos git huérfanos

---

## 6. Ciclo de Vida de Credenciales

| Escenario | Acción |
|---|---|
| Usuario no marca "Remember" | Token solo en memoria durante clonación, luego descartado |
| Usuario marca "Remember" | Token guardado en keytar |
| Clonación exitosa | Token limpiado de memoria |
| Clonación fallida | Token limpiado de memoria, no guardado |
| Usuario revoca acceso | Eliminar entrada de keytar |
| App cierra | Memoria limpiada automáticamente por OS |

---

## 7. Edge Cases y Manejo de Errores

| Edge Case | Detección | Respuesta |
|---|---|---|
| Token expirado/revocado | Error 401 en git clone | Mensaje + link a GitHub Settings |
| Sin acceso al repo (403) | Error 128 + "not found" | Mensaje de permisos |
| Repo no existe (404) | Error 128 + "not found" | Verificar URL |
| Red caída | Timeout / ECONNREFUSED | Verificar conexión |
| Usuario cancela | Kill proceso | Limpiar directorio parcial |
| Token sin permisos suficientes | Error 403 | Verificar scopes del token |
| 2FA habilitado | N/A | PAT resuelve esto — documentar en UI |
| Directorio destino ya existe | Verificar antes de clonar | Elegir otra ubicación |
| Disco lleno durante clonación | Error ENOSPC | Liberar espacio |
| App crashea durante clonación | PID registrado | Limpiar en startup |

---

## 8. Dependencias Requeridas

```json
{
  "keytar": "^7.9.0",
  "simple-git": "^3.x"
}
```

**Nota sobre keytar en Linux:** Requiere `libsecret` instalado. Si no está disponible, detectar y mostrar instrucciones al usuario.

---

## 9. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Token expuesto en logs | Media | Alto | Sanitizar todos los logs, nunca loggear URLs con token |
| keytar no disponible en Linux sin libsecret | Alta | Medio | Detectar y mostrar instrucciones de instalación |
| Proceso git huérfano si app crashea | Baja | Medio | Registrar PID y limpiar en startup |
| Token en memoria accesible via DevTools | Media | Alto | Mantener token solo en main process, nunca en renderer |
| URL con token en historial de git | Baja | Alto | Usar credential helper en lugar de URL con token |

---

## 10. Orden de Implementación

```
1. Configurar seguridad Electron (contextIsolation, preload, contextBridge)
2. Implementar IPC handlers básicos en main process
3. Implementar almacenamiento con keytar
4. Implementar lógica de git clone con manejo de errores
5. Implementar UI: modal + formulario + progreso + resultado
6. Implementar limpieza de credenciales y directorios parciales
7. Testing completo (unitario + integración + cancelación)
8. Documentación de usuario final
```

---

## 11. Mejores Prácticas para Electron

- **contextIsolation: true** — Aísla el contexto del renderer del main
- **nodeIntegration: false** — El renderer no tiene acceso directo a Node.js
- **preload.js** — Único punto de comunicación, expone API mínima via contextBridge
- **Nunca pasar el token al renderer** — El token vive y muere en el main process
- **Sanitizar logs** — Usar un wrapper de logging que filtre URLs con tokens
- **Validar mensajes IPC** — Verificar origen y estructura de todos los mensajes recibidos en main
- **Usar spawn sobre exec** — Mayor control sobre el proceso hijo, evita shell injection
- **Limpiar recursos en app.on('before-quit')** — Matar procesos hijos y limpiar memoria

---

*Documento generado por Weight-Planner — Versión 1.0 — 2026-04-23*
