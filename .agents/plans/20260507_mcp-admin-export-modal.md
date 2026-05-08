# 🧠 Plan de Solución — MCP Admin en ExportModal

**Fecha:** 2026-05-07  
**Categoría:** Descomposición de tarea grande + Specs para developer  
**Módulo objetivo:** `src/ui/components/ExportModal/` — tab "MCPs"

---

## 🎯 Objetivo

Implementar un administrador completo de MCPs (Model Context Protocol) en la pestaña "MCPs" del `ExportModal`. El admin debe permitir al usuario gestionar servidores MCP locales y remotos que se exportarán al campo `"mcp"` del archivo `opencode.json` / `opencode.jsonc`.

---

## 🧩 Contexto

### Estado actual
- La pestaña "MCPs" en `ExportModal.tsx` (línea 1307–1314) muestra únicamente un placeholder: `"This feature is not yet implemented."`
- El campo `mcp` en `OpenCodeV2Output` (export-logic.ts línea 585) es `Record<string, unknown>` y siempre se exporta como `{}` (línea 781).
- El `.afproj` tiene un campo `properties: Record<string, unknown>` que puede almacenar cualquier dato adicional — es el punto de persistencia natural para los MCPs del proyecto.

### Formato OpenCode MCP (investigado)
```json
{
  "mcp": {
    "nombre-del-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@paquete/mcp"],
      "environment": { "API_KEY": "valor" },
      "timeout": 30000,
      "enabled": true
    },
    "otro-mcp": {
      "type": "remote",
      "url": "https://mcp.ejemplo.com/sse",
      "headers": { "Authorization": "Bearer token" },
      "timeout": 10000,
      "enabled": true
    }
  }
}
```

**Discriminador:** `type` es obligatorio y determina qué campos aplican:
- `"local"`: requiere `command` (array), acepta `environment` (objeto), `timeout` (número ms)
- `"remote"`: requiere `url` (string HTTPS), acepta `headers` (objeto), `timeout` (número ms)
- Ambos: `enabled` (boolean, default `true`)

### Gotchas críticos conocidos
1. `{env:VAR}` NO funciona en `headers` de remote MCP (issue OpenCode #23664) — se envía literal
2. OAuth cache corruption cuando token expira mid-session (issue #25008)
3. Timeout default 5000ms muy bajo para `npx` con cold start — recomendar 30000
4. Comandos peligrosos: `rm`, `sudo`, `curl | sh`, `eval`, `bash -c` deben bloquearse
5. Nombres de MCP deben ser únicos (son claves del objeto `mcp`)

---

## 🧭 Estrategia

**Enfoque elegido:** Administrador inline en la pestaña MCPs, sin modal adicional.  
- Lista de MCPs a la izquierda (similar al panel de Skills)
- Formulario de edición a la derecha (campos dinámicos según `type`)
- Persistencia en `project.properties.mcps` (array) → exportado como objeto `mcp` en OpenCode
- Patrón de estado local en `ExportModal` (igual que `plugins`)

**Razón:** Mantiene consistencia con el patrón existente de plugins y skills. No requiere nuevo modal ni IPC adicional.

---

## 🚀 Fases

### 🔹 Fase 1 — Tipos y schema
**Descripción:** Definir los tipos TypeScript para MCPs y extender los schemas existentes.

**Tasks:**

- **Task 1.1:** Crear `McpEntry` y tipos relacionados en `export-logic.ts`
  - **Assigned to:** Developer
  - **Dependencies:** ninguna

- **Task 1.2:** Extender `OpenCodeExportConfig` con campo `mcps: McpEntry[]`
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1

- **Task 1.3:** Extender `OpenCodeV2Output.mcp` para usar el tipo correcto
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1

- **Task 1.4:** Extender `AfprojSchema.properties` — no requiere cambio de schema (ya es `Record<string, unknown>`), pero documentar la clave `"mcps"` en JSDoc
  - **Assigned to:** Developer
  - **Dependencies:** ninguna

---

### 🔹 Fase 2 — Lógica de validación
**Descripción:** Implementar todas las validaciones requeridas como funciones puras en `export-logic.ts`.

**Tasks:**

- **Task 2.1:** `validateMcpName(name, existingNames)` — unicidad, no vacío, solo chars válidos
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1

- **Task 2.2:** `validateMcpCommand(command)` — no vacío, no comandos peligrosos
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1

- **Task 2.3:** `validateMcpUrl(url)` — URL válida, protocolo https/http
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1

- **Task 2.4:** `validateMcpEnvironment(env)` — objeto clave-valor, claves no vacías
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1

- **Task 2.5:** `validateMcpHeaders(headers)` — objeto clave-valor, advertencia sobre `{env:VAR}`
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.1

- **Task 2.6:** `validateMcpEntry(entry, allEntries)` — validación completa de una entrada
  - **Assigned to:** Developer
  - **Dependencies:** Tasks 2.1–2.5

---

### 🔹 Fase 3 — Lógica de exportación
**Descripción:** Conectar los MCPs al pipeline de exportación existente.

**Tasks:**

- **Task 3.1:** Modificar `buildOpenCodeV2Config` para incluir MCPs en el output
  - **Assigned to:** Developer
  - **Dependencies:** Fase 1, Fase 2

- **Task 3.2:** Modificar `makeDefaultOpenCodeConfig` para incluir `mcps: []`
  - **Assigned to:** Developer
  - **Dependencies:** Task 1.2

- **Task 3.3:** Leer/escribir MCPs desde/hacia `project.properties.mcps` en `ExportModal`
  - **Assigned to:** Developer
  - **Dependencies:** Task 3.2

---

### 🔹 Fase 4 — Componente UI
**Descripción:** Implementar el componente `McpAdminTab` y sus subcomponentes.

**Tasks:**

- **Task 4.1:** Crear `McpAdminTab.tsx` — layout principal (lista + formulario)
  - **Assigned to:** Developer
  - **Dependencies:** Fase 1, Fase 2

- **Task 4.2:** Crear `McpForm.tsx` — formulario con campos dinámicos por `type`
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.1

- **Task 4.3:** Crear `McpList.tsx` — lista de MCPs con toggle enable/disable y botón eliminar
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.1

- **Task 4.4:** Implementar `DeleteConfirmDialog` inline (o reutilizar patrón existente)
  - **Assigned to:** Developer
  - **Dependencies:** Task 4.3

- **Task 4.5:** Integrar `McpAdminTab` en `ExportModal.tsx` reemplazando el placeholder
  - **Assigned to:** Developer
  - **Dependencies:** Tasks 4.1–4.4, Fase 3

---

### 🔹 Fase 5 — Estilos CSS
**Descripción:** Agregar estilos para el admin de MCPs siguiendo el design system existente.

**Tasks:**

- **Task 5.1:** Agregar clases `.export-modal__mcp-*` en `app.css` o en un archivo CSS dedicado
  - **Assigned to:** Developer
  - **Dependencies:** Fase 4

---

### 🔹 Fase 6 — Tests
**Descripción:** Tests unitarios para la lógica de validación y tests de integración para el componente.

**Tasks:**

- **Task 6.1:** Tests unitarios para todas las funciones de validación (Fase 2)
  - **Assigned to:** Developer / QA
  - **Dependencies:** Fase 2

- **Task 6.2:** Tests de integración para `McpAdminTab` (render, add, edit, delete, toggle)
  - **Assigned to:** Developer / QA
  - **Dependencies:** Fase 4

---

## ⚠️ Riesgos

1. **Persistencia en `properties`:** El campo `properties` del `.afproj` es `Record<string, unknown>` — no hay validación de schema para `mcps`. Si el formato cambia, los datos legacy pueden corromperse silenciosamente. **Mitigación:** Validar y migrar al leer con un parser defensivo.

2. **Comandos peligrosos:** La lista de comandos bloqueados debe ser exhaustiva pero no excesiva. Una lista muy restrictiva bloquea casos legítimos. **Mitigación:** Bloquear solo patrones claramente peligrosos (ver spec técnica).

3. **`{env:VAR}` en headers:** El usuario puede intentar usar variables de entorno en headers de remote MCPs. OpenCode no las interpola. **Mitigación:** Mostrar advertencia visible cuando se detecte el patrón `{env:`.

4. **Timeout bajo:** El default de 5000ms puede causar fallos silenciosos con `npx`. **Mitigación:** Default en UI = 30000ms para local, 10000ms para remote.

5. **Nombres con caracteres especiales:** OpenCode usa el nombre como clave de objeto JSON. Nombres con espacios o caracteres especiales pueden causar problemas. **Mitigación:** Validar con regex estricto.

---

## 📝 Notas

- El spec técnico detallado está en: `.agents/specs/20260507_mcp-admin-export-modal.md`
- Los criterios de aceptación para QA están incluidos en el spec técnico
- La investigación de configuración OpenCode MCP está en: `.agents/context/opencode_mcp_config.md`
- No implementar OAuth en esta iteración — es complejo y tiene bugs conocidos (issue #25008)
- El campo `enabled` debe persistirse en `.afproj` pero solo exportar MCPs con `enabled: true` al JSON de OpenCode (o incluir todos con su valor — ver spec)
