# 📋 Especificación Técnica — MCP Admin en ExportModal

**Fecha:** 2026-05-07  
**Plan asociado:** `.agents/plans/20260507_mcp-admin-export-modal.md`  
**Módulo:** `src/ui/components/ExportModal/`  
**Assigned to:** Developer

---

## 🎯 Objetivo

Reemplazar el placeholder de la pestaña "MCPs" en `ExportModal` con un administrador funcional que permita agregar, editar, eliminar y habilitar/deshabilitar MCPs. Los MCPs se persisten en `project.properties.mcps` (array en `.afproj`) y se exportan al campo `"mcp"` del `opencode.json`.

---

## 📁 Archivos a modificar

| Archivo | Qué cambia |
|---------|-----------|
| `src/ui/components/ExportModal/export-logic.ts` | Agregar tipos `McpEntry`, `McpLocalEntry`, `McpRemoteEntry`; extender `OpenCodeExportConfig`; extender `OpenCodeV2Output`; modificar `buildOpenCodeV2Config`; agregar funciones de validación; modificar `makeDefaultOpenCodeConfig` |
| `src/ui/components/ExportModal/ExportModal.tsx` | Agregar estado `mcps`; leer/escribir desde `project.properties.mcps`; reemplazar placeholder MCPs tab con `<McpAdminTab />`; agregar handlers |
| `src/ui/styles/app.css` | Agregar clases CSS `.export-modal__mcp-*` |

## 📁 Archivos a crear

| Archivo | Propósito |
|---------|-----------|
| `src/ui/components/ExportModal/McpAdminTab.tsx` | Componente principal del tab MCPs (layout lista + formulario) |
| `src/ui/components/ExportModal/McpForm.tsx` | Formulario de creación/edición con campos dinámicos por `type` |
| `src/ui/components/ExportModal/McpList.tsx` | Lista de MCPs con toggle y botón eliminar |

---

## 🔷 Tipos TypeScript (en `export-logic.ts`)

### Tipo base compartido

```typescript
/** Campos comunes a todos los MCPs */
interface McpEntryBase {
  /** Clave única del MCP — se usa como nombre de clave en el objeto "mcp" de OpenCode */
  name: string;
  /** Discriminador de tipo */
  type: "local" | "remote";
  /** Timeout en milisegundos. Default: 30000 para local, 10000 para remote */
  timeout?: number;
  /** Si el MCP está activo. Default: true. Se persiste en .afproj */
  enabled: boolean;
  /** ID local estable para operaciones de lista (no se exporta) */
  localId: string;
  /** Error de validación activo, si existe (no se exporta) */
  error?: string;
}

/** MCP de tipo local (proceso stdio) */
export interface McpLocalEntry extends McpEntryBase {
  type: "local";
  /** Array de strings: primer elemento es el ejecutable, resto son args */
  command: string[];
  /** Variables de entorno para el proceso. Objeto clave-valor de strings */
  environment?: Record<string, string>;
}

/** MCP de tipo remote (HTTP/SSE) */
export interface McpRemoteEntry extends McpEntryBase {
  type: "remote";
  /** URL del servidor MCP. Debe ser https:// o http:// */
  url: string;
  /** Headers HTTP adicionales. ADVERTENCIA: {env:VAR} NO funciona (issue #23664) */
  headers?: Record<string, string>;
}

/** Unión discriminada de todos los tipos de MCP */
export type McpEntry = McpLocalEntry | McpRemoteEntry;
```

### Extensión de `OpenCodeExportConfig`

Agregar campo al interface existente:
```typescript
/** MCPs configurados para este proyecto */
mcps: McpEntry[];
```

### Extensión de `OpenCodeV2Output`

Cambiar el tipo del campo `mcp`:
```typescript
// Antes:
mcp: Record<string, unknown>;

// Después:
mcp: Record<string, McpOpenCodeEntry>;
```

Agregar tipo de salida:
```typescript
/** Forma del objeto MCP en el JSON exportado de OpenCode */
export interface McpOpenCodeEntry {
  type: "local" | "remote";
  command?: string[];           // solo local
  environment?: Record<string, string>; // solo local
  url?: string;                 // solo remote
  headers?: Record<string, string>;     // solo remote
  timeout?: number;             // ambos (omitir si undefined)
  enabled: boolean;             // siempre presente
}
```

---

## 🔷 Funciones de validación (en `export-logic.ts`)

### `validateMcpName`

```typescript
/**
 * Valida el nombre de un MCP.
 * - No puede estar vacío
 * - Solo letras, números, guiones y guiones bajos (regex: /^[a-zA-Z0-9_-]+$/)
 * - Máximo 64 caracteres
 * - No puede duplicar un nombre existente (excepto el propio al editar)
 * @returns string con el error, o null si es válido
 */
export function validateMcpName(
  name: string,
  existingNames: string[],
  currentName?: string  // nombre actual al editar (excluir de duplicados)
): string | null
```

### `validateMcpCommand`

```typescript
/**
 * Valida el comando de un MCP local.
 * - El array no puede estar vacío
 * - El primer elemento (ejecutable) no puede estar vacío
 * - Bloquea comandos peligrosos conocidos en el primer elemento:
 *   ["rm", "sudo", "eval", "bash", "sh", "curl", "wget", "python", "node -e", "exec"]
 *   NOTA: "bash" y "sh" solo se bloquean si van seguidos de "-c" o si son el único elemento.
 *   Patrón de detección: el primer token del comando (split por espacio) está en la lista negra.
 * - Advertencia (no error) si el comando contiene "| sh" o "| bash" en cualquier elemento
 * @returns { error: string | null, warning: string | null }
 */
export function validateMcpCommand(
  command: string[]
): { error: string | null; warning: string | null }
```

**Lista negra de comandos (primer token):**
```
rm, sudo, eval, curl | sh, wget | sh, chmod, chown, dd, mkfs, 
format, del, rmdir /s, powershell -enc
```

**Regla exacta:** Si `command[0]` (trimmed, lowercase) es exactamente uno de los tokens de la lista negra → error. Si cualquier elemento del array contiene el patrón `| sh` o `| bash` → warning.

### `validateMcpUrl`

```typescript
/**
 * Valida la URL de un MCP remote.
 * - No puede estar vacía
 * - Debe ser una URL válida (parseable por `new URL()`)
 * - Protocolo debe ser "https:" o "http:"
 * - Advertencia si es "http:" (no seguro)
 * @returns { error: string | null, warning: string | null }
 */
export function validateMcpUrl(
  url: string
): { error: string | null; warning: string | null }
```

### `validateMcpKeyValuePairs`

```typescript
/**
 * Valida un objeto de pares clave-valor (environment o headers).
 * - Todas las claves deben ser strings no vacíos
 * - Todos los valores deben ser strings
 * - Para headers: advertencia si algún valor contiene el patrón "{env:"
 *   (OpenCode no interpola variables de entorno en headers — issue #23664)
 * @param pairs - El objeto a validar
 * @param fieldName - "environment" o "headers" (para mensajes de error)
 * @param warnOnEnvPattern - true para headers (false para environment)
 * @returns { error: string | null, warning: string | null }
 */
export function validateMcpKeyValuePairs(
  pairs: Record<string, string>,
  fieldName: string,
  warnOnEnvPattern: boolean
): { error: string | null; warning: string | null }
```

### `validateMcpEntry`

```typescript
/**
 * Validación completa de una entrada MCP.
 * Ejecuta todas las validaciones específicas según el type.
 * @returns McpValidationResult con todos los errores y warnings
 */
export interface McpValidationResult {
  nameError: string | null;
  commandError: string | null;
  commandWarning: string | null;
  urlError: string | null;
  urlWarning: string | null;
  envError: string | null;
  headersError: string | null;
  headersWarning: string | null;
  isValid: boolean; // true solo si todos los *Error son null
}

export function validateMcpEntry(
  entry: Partial<McpEntry>,
  allEntries: McpEntry[],
  currentName?: string
): McpValidationResult
```

---

## 🔷 Modificaciones en `buildOpenCodeV2Config`

En la función `buildOpenCodeV2Config` (export-logic.ts), modificar la construcción del campo `mcp`:

```typescript
// Antes:
mcp: {},

// Después:
mcp: buildMcpOutput(config.mcps ?? []),
```

Agregar función helper:

```typescript
/**
 * Convierte el array de McpEntry al formato de objeto que espera OpenCode.
 * Solo incluye MCPs con enabled === true.
 * Omite campos undefined (timeout, environment, headers).
 */
function buildMcpOutput(mcps: McpEntry[]): Record<string, McpOpenCodeEntry> {
  const result: Record<string, McpOpenCodeEntry> = {};
  for (const mcp of mcps) {
    if (!mcp.enabled) continue; // excluir deshabilitados
    if (!mcp.name) continue;    // excluir sin nombre (estado inválido)
    
    const entry: McpOpenCodeEntry = {
      type: mcp.type,
      enabled: mcp.enabled,
    };
    
    if (mcp.type === "local") {
      entry.command = mcp.command;
      if (mcp.environment && Object.keys(mcp.environment).length > 0) {
        entry.environment = mcp.environment;
      }
    } else {
      entry.url = mcp.url;
      if (mcp.headers && Object.keys(mcp.headers).length > 0) {
        entry.headers = mcp.headers;
      }
    }
    
    if (typeof mcp.timeout === "number") {
      entry.timeout = mcp.timeout;
    }
    
    result[mcp.name] = entry;
  }
  return result;
}
```

**DECISIÓN:** Los MCPs con `enabled: false` NO se incluyen en el JSON exportado. Se persisten en `.afproj` pero no aparecen en `opencode.json`. Esto es consistente con el comportamiento de `enabled` en otros campos de OpenCode.

---

## 🔷 Modificaciones en `ExportModal.tsx`

### Estado nuevo

```typescript
// Después de la declaración de plugins state:
const [mcps, setMcps] = useState<McpEntry[]>(() => {
  // Leer desde project.properties.mcps al montar
  const saved = project?.properties?.mcps;
  if (Array.isArray(saved)) {
    return saved as McpEntry[];
  }
  return [];
});
```

### Persistencia de MCPs

Agregar función `saveMcps` (patrón idéntico a `saveGeneralProperties`):

```typescript
const saveMcps = useCallback((nextMcps: McpEntry[]) => {
  if (!project) return;
  const updatedProperties: Record<string, unknown> = {
    ...(project.properties ?? {}),
    mcps: nextMcps,
  };
  saveProject({ properties: updatedProperties }).catch((err: unknown) => {
    console.warn("[ExportModal] No se pudo guardar los MCPs en project.properties:", err);
  });
}, [project, saveProject]);
```

### Handlers de MCPs

```typescript
const handleAddMcp = useCallback((entry: McpEntry) => {
  setMcps((prev) => {
    const next = [...prev, entry];
    saveMcps(next);
    return next;
  });
}, [saveMcps]);

const handleUpdateMcp = useCallback((localId: string, updated: McpEntry) => {
  setMcps((prev) => {
    const next = prev.map((m) => m.localId === localId ? updated : m);
    saveMcps(next);
    return next;
  });
}, [saveMcps]);

const handleDeleteMcp = useCallback((localId: string) => {
  setMcps((prev) => {
    const next = prev.filter((m) => m.localId !== localId);
    saveMcps(next);
    return next;
  });
}, [saveMcps]);

const handleToggleMcp = useCallback((localId: string) => {
  setMcps((prev) => {
    const next = prev.map((m) =>
      m.localId === localId ? { ...m, enabled: !m.enabled } : m
    );
    saveMcps(next);
    return next;
  });
}, [saveMcps]);
```

### Integración en `buildOpenCodeV2Config`

Pasar `mcps` al config antes de llamar a `buildOpenCodeV2Config`:

```typescript
// En handleExport, al construir output:
const configWithMcps = { ...config, mcps };
const output = buildOpenCodeV2Config(enriched, configWithMcps, ...);
```

### Reemplazo del placeholder en el render

```tsx
{/* ── MCPs tab ────────────────────────────────────────────── */}
{activeTab === "mcps" && (
  <div className="export-modal__tab-pane export-modal__tab-pane--mcps">
    <McpAdminTab
      mcps={mcps}
      onAdd={handleAddMcp}
      onUpdate={handleUpdateMcp}
      onDelete={handleDeleteMcp}
      onToggle={handleToggleMcp}
    />
  </div>
)}
```

---

## 🔷 Componente `McpAdminTab.tsx`

**Ruta:** `src/ui/components/ExportModal/McpAdminTab.tsx`

### Props

```typescript
export interface McpAdminTabProps {
  mcps: McpEntry[];
  onAdd: (entry: McpEntry) => void;
  onUpdate: (localId: string, updated: McpEntry) => void;
  onDelete: (localId: string) => void;
  onToggle: (localId: string) => void;
}
```

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  MCPs  [+ Add MCP]                                          │
├──────────────────┬──────────────────────────────────────────┤
│  Lista MCPs      │  Formulario (nuevo o edición)            │
│  ─────────────   │  ─────────────────────────────────────   │
│  ● mcp-1 [✓][✕] │  Name: [___________]                     │
│  ○ mcp-2 [✓][✕] │  Type: [local ▾] [remote]                │
│                  │                                          │
│                  │  [Si local:]                             │
│                  │  Command: [npx] [-y] [pkg] [+ arg]       │
│                  │  Environment: [KEY] [VALUE] [+]          │
│                  │  Timeout: [30000] ms                     │
│                  │                                          │
│                  │  [Si remote:]                            │
│                  │  URL: [https://...]                      │
│                  │  Headers: [KEY] [VALUE] [+]              │
│                  │  Timeout: [10000] ms                     │
│                  │                                          │
│                  │  ⚠ warnings aquí                         │
│                  │  ✗ errors aquí                           │
│                  │                                          │
│                  │  [Save MCP]  [Cancel]                    │
└──────────────────┴──────────────────────────────────────────┘
```

### Estado interno

```typescript
type FormMode = "idle" | "new" | "edit";

const [formMode, setFormMode] = useState<FormMode>("idle");
const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
const [deleteConfirmLocalId, setDeleteConfirmLocalId] = useState<string | null>(null);
const [draft, setDraft] = useState<Partial<McpEntry>>({});
const [validation, setValidation] = useState<McpValidationResult | null>(null);
```

### Comportamiento

1. **Modo idle:** Solo se muestra la lista. Si la lista está vacía, mostrar mensaje "No MCPs configured. Click '+ Add MCP' to add one."
2. **Modo new:** Formulario vacío a la derecha. Type default = "local".
3. **Modo edit:** Formulario pre-llenado con los datos del MCP seleccionado.
4. **Cambio de type:** Al cambiar `type` en el formulario, limpiar los campos específicos del tipo anterior (command/environment ↔ url/headers).
5. **Validación:** Se ejecuta en tiempo real al cambiar cualquier campo. Los errores se muestran inline bajo cada campo.
6. **Save:** Solo habilitado cuando `validation.isValid === true`. Al guardar, llama `onAdd` o `onUpdate` según el modo.
7. **Cancel:** Vuelve a modo idle sin guardar.

---

## 🔷 Componente `McpList.tsx`

**Ruta:** `src/ui/components/ExportModal/McpList.tsx`

### Props

```typescript
export interface McpListProps {
  mcps: McpEntry[];
  selectedLocalId: string | null;
  deleteConfirmLocalId: string | null;
  onSelect: (localId: string) => void;
  onToggle: (localId: string) => void;
  onDeleteRequest: (localId: string) => void;
  onDeleteConfirm: (localId: string) => void;
  onDeleteCancel: () => void;
}
```

### Cada item de la lista muestra

```
[●/○] nombre-mcp  [type badge]  [toggle btn]  [delete btn]
```

- `●` = enabled (color: `--color-success`)
- `○` = disabled (color: `--color-text-muted`)
- `[type badge]` = "local" o "remote" (pequeño badge de color)
- `[toggle btn]` = ícono de ojo o switch pequeño
- `[delete btn]` = ícono de papelera (✕ o 🗑)

### Confirmación de eliminación

Al hacer click en delete, el item se expande inline con:
```
¿Eliminar "nombre-mcp"? [Confirmar] [Cancelar]
```
No usar `window.confirm()`. Usar estado local `deleteConfirmLocalId`.

---

## 🔷 Componente `McpForm.tsx`

**Ruta:** `src/ui/components/ExportModal/McpForm.tsx`

### Props

```typescript
export interface McpFormProps {
  draft: Partial<McpEntry>;
  mode: "new" | "edit";
  existingNames: string[];
  onChange: (updated: Partial<McpEntry>) => void;
  onSave: () => void;
  onCancel: () => void;
  validation: McpValidationResult | null;
}
```

### Campos dinámicos

**Siempre presentes:**
- `Name` — input text. Validación: `nameError`
- `Type` — dos botones toggle: "local" | "remote". Al cambiar, limpiar campos del tipo anterior.
- `Timeout` — input number (ms). Placeholder: "30000" para local, "10000" para remote. Opcional.
- `Enabled` — switch (igual al patrón de General tab)

**Solo cuando `type === "local"`:**
- `Command` — editor de array de strings. Cada elemento es un input text. Botón `[+ arg]` para agregar. Botón `[✕]` por elemento para eliminar. El primer elemento es el ejecutable. Validación: `commandError`, `commandWarning`.
- `Environment` — editor de pares clave-valor. Botón `[+ var]`. Validación: `envError`.

**Solo cuando `type === "remote"`:**
- `URL` — input text. Placeholder: "https://mcp.ejemplo.com/sse". Validación: `urlError`, `urlWarning`.
- `Headers` — editor de pares clave-valor. Botón `[+ header]`. Validación: `headersError`, `headersWarning`.

### Editor de pares clave-valor (reutilizable internamente)

```
[KEY_INPUT]  [VALUE_INPUT]  [✕]
[KEY_INPUT]  [VALUE_INPUT]  [✕]
[+ Add]
```

Cada fila es un par. Al cambiar cualquier campo, reconstruir el objeto y llamar `onChange`.

### Editor de array de strings (para command)

```
[INPUT_0]  [✕]
[INPUT_1]  [✕]
[+ Add arg]
```

---

## 🔷 Estilos CSS (en `app.css`)

Agregar al final del archivo, siguiendo el patrón de `.export-modal__plugin-*`:

```css
/* ── MCP Admin Tab ──────────────────────────────────────────────────────── */

.export-modal__mcp-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  height: 100%;
  min-height: 300px;
}

.export-modal__mcp-list-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid var(--color-border);
  padding-right: 12px;
}

.export-modal__mcp-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.export-modal__mcp-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text);
  font-size: 13px;
  text-align: left;
  width: 100%;
  transition: background var(--transition);
}

.export-modal__mcp-item:hover {
  background: var(--color-surface-2);
}

.export-modal__mcp-item--active {
  background: var(--color-surface-2);
  border-color: var(--color-border);
}

.export-modal__mcp-item--disabled {
  opacity: 0.5;
}

.export-modal__mcp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.export-modal__mcp-status-dot--enabled {
  background: var(--color-success);
}

.export-modal__mcp-status-dot--disabled {
  background: var(--color-text-muted);
}

.export-modal__mcp-type-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.export-modal__mcp-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-modal__mcp-item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.export-modal__mcp-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  transition: color var(--transition);
}

.export-modal__mcp-icon-btn:hover {
  color: var(--color-text);
}

.export-modal__mcp-icon-btn--danger:hover {
  color: var(--color-error);
}

.export-modal__mcp-delete-confirm {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 12px;
  color: var(--color-error);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* ── MCP Form ─────────────────────────────────────────────────────────────── */

.export-modal__mcp-form-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 4px;
}

.export-modal__mcp-form-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}

.export-modal__mcp-type-toggle {
  display: flex;
  gap: 4px;
}

.export-modal__mcp-type-btn {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition);
}

.export-modal__mcp-type-btn--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.export-modal__mcp-kv-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.export-modal__mcp-kv-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.export-modal__mcp-kv-input {
  flex: 1;
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  padding: 4px 8px;
  font-size: 12px;
  font-family: var(--font-mono);
}

.export-modal__mcp-array-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.export-modal__mcp-array-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.export-modal__mcp-field-error {
  color: var(--color-error);
  font-size: 11px;
  margin-top: 2px;
}

.export-modal__mcp-field-warning {
  color: var(--color-warning);
  font-size: 11px;
  margin-top: 2px;
}

.export-modal__mcp-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.export-modal__mcp-save-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  transition: background var(--transition);
}

.export-modal__mcp-save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.export-modal__mcp-save-btn:not(:disabled):hover {
  background: var(--color-primary-hover);
}

.export-modal__mcp-cancel-btn {
  background: transparent;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition);
}

.export-modal__mcp-cancel-btn:hover {
  color: var(--color-text);
  border-color: var(--color-text-muted);
}
```

---

## 🔷 Lógica de persistencia en `.afproj`

### Clave de almacenamiento
`project.properties.mcps` — array de `McpEntry[]` (incluyendo `localId` y `enabled: false`)

### Al leer (inicialización del estado)
```typescript
const saved = project?.properties?.mcps;
const initialMcps: McpEntry[] = Array.isArray(saved)
  ? (saved as unknown[]).filter(isMcpEntry)  // validación defensiva
  : [];
```

Agregar type guard:
```typescript
function isMcpEntry(v: unknown): v is McpEntry {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    (obj.type === "local" || obj.type === "remote") &&
    typeof obj.enabled === "boolean" &&
    typeof obj.localId === "string"
  );
}
```

### Al escribir
Llamar `saveMcps(nextMcps)` después de cada operación CRUD. La función persiste en `project.properties.mcps` via `saveProject`.

---

## 🔷 Criterios de aceptación (QA)

### Funcionalidad básica
- [ ] La pestaña "MCPs" muestra el admin (no el placeholder)
- [ ] Se puede agregar un MCP de tipo "local" con nombre, command y environment
- [ ] Se puede agregar un MCP de tipo "remote" con nombre, URL y headers
- [ ] Se puede editar un MCP existente (todos los campos)
- [ ] Se puede eliminar un MCP con confirmación inline (sin `window.confirm`)
- [ ] Se puede habilitar/deshabilitar un MCP con toggle
- [ ] El formulario cambia campos dinámicamente al cambiar el `type`
- [ ] Al cambiar de "local" a "remote", los campos de local se limpian (y viceversa)

### Validaciones
- [ ] Error si el nombre está vacío
- [ ] Error si el nombre contiene caracteres inválidos (no `[a-zA-Z0-9_-]`)
- [ ] Error si el nombre duplica uno existente (al crear o editar con nombre diferente)
- [ ] Error si `command` está vacío (local)
- [ ] Error si el primer elemento de `command` es un comando peligroso
- [ ] Error si `url` está vacía (remote)
- [ ] Error si `url` no es una URL válida
- [ ] Warning si `url` usa `http:` en lugar de `https:`
- [ ] Warning si algún header contiene el patrón `{env:` (con texto explicativo del issue #23664)
- [ ] El botón "Save MCP" está deshabilitado mientras haya errores de validación
- [ ] El botón "Save MCP" está habilitado cuando todos los campos requeridos son válidos

### Persistencia
- [ ] Los MCPs se guardan en `project.properties.mcps` al agregar/editar/eliminar/toggle
- [ ] Al cerrar y reabrir el ExportModal, los MCPs persisten
- [ ] Al recargar el proyecto, los MCPs persisten (están en `.afproj`)

### Exportación
- [ ] Los MCPs con `enabled: true` aparecen en el campo `"mcp"` del JSON exportado
- [ ] Los MCPs con `enabled: false` NO aparecen en el JSON exportado
- [ ] El formato exportado es correcto para local: `{ type, command, environment?, timeout?, enabled }`
- [ ] El formato exportado es correcto para remote: `{ type, url, headers?, timeout?, enabled }`
- [ ] Si no hay MCPs, el campo `"mcp"` es `{}` (objeto vacío)
- [ ] El nombre del MCP es la clave del objeto `"mcp"` en el JSON

### UX/UI
- [ ] El layout es lista-izquierda + formulario-derecha (grid 220px + 1fr)
- [ ] Los items de la lista muestran: dot de estado, nombre, badge de tipo, botones de acción
- [ ] La confirmación de eliminación es inline (no `window.confirm`)
- [ ] Los errores de validación se muestran bajo cada campo afectado
- [ ] Los warnings se muestran en amarillo (`--color-warning`)
- [ ] Los errores se muestran en rojo (`--color-error`)
- [ ] El formulario es scrollable si el contenido excede la altura del panel
- [ ] El estilo es consistente con el resto del ExportModal (mismas clases base)

---

## 🔷 Consideraciones UX/UI

1. **Consistencia visual:** Usar exactamente las mismas clases base del ExportModal (`export-modal__label`, `export-modal__text-input`, `export-modal__switch`, etc.) para los elementos comunes. Solo agregar clases `export-modal__mcp-*` para elementos específicos del admin.

2. **Feedback inmediato:** La validación debe ejecutarse en tiempo real (onChange), no solo al intentar guardar. El usuario debe ver el error mientras escribe.

3. **Timeout con hint:** El campo timeout debe mostrar un hint/placeholder que explique la unidad (ms) y el valor recomendado. Para local: "30000 (recomendado para npx)". Para remote: "10000".

4. **Warning de `{env:VAR}`:** Cuando se detecte el patrón en headers, mostrar un mensaje explicativo: "⚠ OpenCode no interpola variables de entorno en headers. El valor se enviará literalmente. (issue #23664)". No bloquear — es un warning, no un error.

5. **Command array UX:** El primer input del array de command debe tener placeholder "ejecutable (ej: npx)". Los siguientes: "argumento". El botón de agregar arg debe estar al final del array.

6. **Estado vacío:** Cuando no hay MCPs, mostrar un estado vacío amigable con instrucción clara: "No hay MCPs configurados. Haz click en '+ Add MCP' para agregar uno."

7. **Modo edición vs nuevo:** El título del formulario debe cambiar: "Nuevo MCP" vs "Editar: nombre-del-mcp".

8. **Accesibilidad:** Todos los inputs deben tener `id` y `htmlFor` correspondientes. Los botones de acción deben tener `aria-label` descriptivos. El formulario debe ser navegable por teclado.

---

## 🔷 Lo que NO debe hacer el developer

- ❌ No implementar OAuth en esta iteración
- ❌ No agregar IPC nuevo — toda la persistencia va por `saveProject` (ya existe)
- ❌ No usar `window.confirm()` para confirmaciones
- ❌ No modificar el schema Zod de `.afproj` — `properties` ya es `Record<string, unknown>`
- ❌ No cambiar el comportamiento de otras pestañas del ExportModal
- ❌ No agregar dependencias npm nuevas para este feature
- ❌ No exportar MCPs con `enabled: false` al JSON de OpenCode
- ❌ No permitir nombres de MCP con espacios o caracteres especiales

---

## 🔷 Criterio de completitud

El developer sabe que terminó cuando:
1. La pestaña MCPs muestra el admin funcional (no el placeholder)
2. Todos los criterios de aceptación de QA están en verde
3. Los tests unitarios de validación pasan
4. Un MCP local y uno remote se pueden agregar, editar, eliminar y exportar correctamente
5. El JSON exportado contiene el campo `"mcp"` con el formato correcto de OpenCode
6. Los MCPs persisten al cerrar y reabrir el modal

---

## 🔷 Riesgos y gotchas

| Riesgo | Mitigación |
|--------|-----------|
| Datos legacy en `properties.mcps` con formato incorrecto | Type guard `isMcpEntry` al leer — datos inválidos se descartan silenciosamente |
| `{env:VAR}` en headers enviado literal | Warning visible en UI con referencia al issue #23664 |
| Timeout 5000ms por defecto en OpenCode | Default en UI = 30000 para local, 10000 para remote |
| Nombres con caracteres especiales como claves JSON | Validación estricta con regex `/^[a-zA-Z0-9_-]+$/` |
| Comandos peligrosos en `command[0]` | Lista negra de tokens en `validateMcpCommand` |
| `saveMcps` falla silenciosamente | `console.warn` + el estado local sigue siendo correcto (best-effort) |
| El formulario no limpia campos al cambiar `type` | Limpiar explícitamente en el handler de cambio de type |
