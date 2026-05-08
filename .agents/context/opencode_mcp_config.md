# 🧠 Investigación: Configuración de MCPs en OpenCode

> Generado: 2026-05-07  
> Fuentes: Documentación oficial opencode.ai, issues GitHub anomalyco/opencode  
> Estado: Verificado — sin información inventada

---

## 📌 ¿Qué es un MCP en OpenCode?

MCP = **Model Context Protocol**. Permite agregar herramientas externas al LLM.  
Se configuran bajo la clave `mcp` en `opencode.json` o `opencode.jsonc`.  
Una vez configurados, sus tools están disponibles automáticamente junto a las built-in.

> ⚠️ **Caveat oficial**: Cada MCP server agrega tokens al contexto. Usar con cuidado.  
> El GitHub MCP server en particular puede exceder el límite de contexto fácilmente.

---

## 🔑 El campo `type` — Qué es y cómo afecta todo

`type` es el discriminador principal de la configuración. Define **cómo OpenCode se conecta** al servidor MCP.

| Valor | Significado |
|-------|-------------|
| `"local"` | Proceso local — OpenCode lanza el comando y se comunica por stdio |
| `"remote"` | Servidor HTTP remoto — OpenCode hace requests HTTP/SSE al URL |

**Este campo es REQUERIDO** en ambos casos. Sin él, la configuración es inválida.

El `type` determina qué otros campos son válidos/requeridos:
- `"local"` → requiere `command`, acepta `environment`
- `"remote"` → requiere `url`, acepta `headers`, `oauth`

---

## 🖥️ Configuración LOCAL (`type: "local"`)

### Campos disponibles

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `type` | String | ✅ | Debe ser `"local"` |
| `command` | Array | ✅ | Comando + argumentos para iniciar el servidor |
| `environment` | Object | ❌ | Variables de entorno para el proceso |
| `enabled` | Boolean | ❌ | Habilitar/deshabilitar al startup |
| `timeout` | Number | ❌ | Timeout en ms para fetch de tools. Default: 5000 |

### Ejemplo mínimo

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-local-mcp": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-package"]
    }
  }
}
```

### Ejemplo completo con env vars

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-local-mcp": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],
      "enabled": true,
      "environment": {
        "MY_API_KEY": "my_key_value",
        "NODE_ENV": "production"
      },
      "timeout": 10000
    }
  }
}
```

### Ejemplo con bun

```json
{
  "mcp": {
    "my-bun-mcp": {
      "type": "local",
      "command": ["bun", "x", "my-mcp-command"]
    }
  }
}
```

### Ejemplo con servidor de prueba oficial

```json
{
  "mcp": {
    "mcp_everything": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

---

## 🌐 Configuración REMOTA (`type: "remote"`)

### Campos disponibles

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `type` | String | ✅ | Debe ser `"remote"` |
| `url` | String | ✅ | URL del servidor MCP remoto |
| `enabled` | Boolean | ❌ | Habilitar/deshabilitar al startup |
| `headers` | Object | ❌ | Headers HTTP a enviar con cada request |
| `oauth` | Object \| false | ❌ | Config OAuth. `false` para deshabilitar auto-OAuth |
| `timeout` | Number | ❌ | Timeout en ms. Default: 5000 |

### Ejemplo mínimo

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-remote-mcp": {
      "type": "remote",
      "url": "https://my-mcp-server.com"
    }
  }
}
```

### Ejemplo con API Key en header

```json
{
  "mcp": {
    "my-remote-mcp": {
      "type": "remote",
      "url": "https://my-mcp-server.com",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer MY_API_KEY_HARDCODED"
      },
      "oauth": false
    }
  }
}
```

### Ejemplo con variable de entorno en header (ver gotcha #1)

```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}"
      }
    }
  }
}
```

### Ejemplo con OAuth automático (sin config extra)

```json
{
  "mcp": {
    "sentry": {
      "type": "remote",
      "url": "https://mcp.sentry.dev/mcp",
      "oauth": {}
    }
  }
}
```

### Ejemplo con OAuth pre-registrado (client credentials)

```json
{
  "mcp": {
    "my-oauth-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "clientId": "{env:MY_MCP_CLIENT_ID}",
        "clientSecret": "{env:MY_MCP_CLIENT_SECRET}",
        "scope": "tools:read tools:execute"
      }
    }
  }
}
```

---

## 🔐 OAuth en MCPs remotos

OpenCode maneja OAuth automáticamente para servidores remotos:

1. Detecta respuesta 401
2. Inicia flujo OAuth
3. Usa **Dynamic Client Registration (RFC 7591)** si el servidor lo soporta
4. Almacena tokens en `~/.local/share/opencode/mcp-auth.json`

### Comandos OAuth CLI

```bash
# Autenticar manualmente con un servidor
opencode mcp auth <server-name>

# Listar todos los servidores y su estado de auth
opencode mcp list

# Eliminar credenciales almacenadas
opencode mcp logout <server-name>

# Ver estado de auth de todos los servidores OAuth
opencode mcp auth list

# Debug de conexión y flujo OAuth
opencode mcp debug <server-name>
```

### Deshabilitar OAuth (para servidores con API key)

```json
{
  "mcp": {
    "my-api-key-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {env:MY_API_KEY}"
      }
    }
  }
}
```

---

## 📍 Dónde va la configuración — Precedencia

Los configs se **mergean**, no se reemplazan. Orden de precedencia (mayor número = mayor prioridad):

1. Remote config (`.well-known/opencode`) — defaults organizacionales
2. Global config (`~/.config/opencode/opencode.json`) — preferencias de usuario
3. Custom config (`OPENCODE_CONFIG` env var)
4. **Project config** (`opencode.json` en raíz del proyecto) — más común
5. `.opencode` directories
6. Inline config (`OPENCODE_CONFIG_CONTENT` env var)
7. Managed config files (admin-controlled)
8. macOS managed preferences (MDM) — máxima prioridad

### Override de defaults remotos

Si la organización provee MCPs deshabilitados por defecto, se pueden habilitar localmente:

```json
{
  "mcp": {
    "jira": {
      "type": "remote",
      "url": "https://jira.example.com/mcp",
      "enabled": true
    }
  }
}
```

---

## 🎛️ Gestión de tools MCP

Los tools de MCP se registran con el nombre del servidor como prefijo.  
Ejemplo: servidor `gh_grep` → tools `gh_grep_search`, `gh_grep_list`, etc.

### Deshabilitar globalmente

```json
{
  "tools": {
    "my-mcp-foo": false
  }
}
```

### Deshabilitar con glob

```json
{
  "tools": {
    "my-mcp*": false
  }
}
```

### Habilitar solo por agente (patrón recomendado para muchos MCPs)

```json
{
  "mcp": {
    "my-mcp": {
      "type": "local",
      "command": ["bun", "x", "my-mcp-command"],
      "enabled": true
    }
  },
  "tools": {
    "my-mcp*": false
  },
  "agent": {
    "my-agent": {
      "tools": {
        "my-mcp*": true
      }
    }
  }
}
```

---

## ⚠️ Gotchas y Edge Cases (verificados)

### 🐛 Gotcha #1: `{env:VAR}` NO funciona en `headers` de remote MCP
**Issue**: [#23664](https://github.com/anomalyco/opencode/issues/23664) — Open (Mayo 2026)

- La sintaxis `{env:VAR_NAME}` en el bloque `headers` de servidores remotos **NO se interpola**
- Se envía el literal `{env:VAR_NAME}` como valor del header → 401 Unauthorized
- **SÍ funciona** en el bloque `environment` de servidores locales
- La documentación oficial muestra el uso de `{env:...}` en headers (Context7 example), pero está roto
- **Workaround**: Hardcodear el valor directamente en el config (no ideal para secrets)

```json
// ❌ ROTO — el header llega como literal
"headers": {
  "Authorization": "Bearer {env:MY_TOKEN}"
}

// ✅ FUNCIONA — para local MCP
"environment": {
  "MY_TOKEN": "{env:MY_TOKEN}"
}
```

### 🐛 Gotcha #2: Corrupción del cache OAuth (`mcp-auth.json`)
**Issue**: [#25008](https://github.com/anomalyco/opencode/issues/25008) — Closed as not planned

- Cuando un token OAuth expira mid-session, el archivo `~/.local/share/opencode/mcp-auth.json` puede corromperse
- Todos los comandos MCP fallan con `JSON Parse error: Unrecognized token ''`
- Los tools desaparecen silenciosamente sin notificación al usuario
- **Workaround**: `rm ~/.local/share/opencode/mcp-auth.json && opencode mcp auth <server-name>`
- A veces se requiere reiniciar OpenCode completo después de re-autenticar

### 🐛 Gotcha #3: Timeout por defecto muy bajo (5 segundos)
- El timeout default es 5000ms para fetch de tools
- Servidores lentos o con cold start (npx) pueden fallar silenciosamente
- Aumentar con `"timeout": 15000` o más para servidores npx

### 🐛 Gotcha #4: GitHub MCP server consume demasiado contexto
- Documentado oficialmente: el GitHub MCP server "tends to add a lot of tokens and can easily exceed the context limit"
- Usar con precaución o habilitarlo solo por agente específico

### 🐛 Gotcha #5: Tools desaparecen sin notificación
- Cuando un servidor remoto se desconecta mid-session, los tools desaparecen silenciosamente
- El LLM intenta llamarlos y falla con "Model tried to call unavailable tool"
- No hay warning visible al usuario (issue conocido)

### 🐛 Gotcha #6: `{env:VAR}` sí funciona en otros campos del config
- Funciona en `provider.options.apiKey`, `oauth.clientId`, `oauth.clientSecret`
- Solo está roto específicamente en `headers` de remote MCP

---

## 💡 Recomendaciones

1. **Siempre especificar `"$schema"`** para autocompletado en el editor
2. **Usar `enabled: false`** para deshabilitar temporalmente sin borrar la config
3. **Para secrets en remote MCP**: hasta que se fixee el issue #23664, usar variables de entorno del sistema y referenciarlas directamente, o usar OAuth
4. **Para MCPs con muchos tools**: deshabilitar globalmente y habilitar por agente
5. **Aumentar timeout** para servidores npx que tienen cold start: `"timeout": 15000`
6. **Para OAuth**: ejecutar `opencode mcp auth <name>` antes de la primera sesión
7. **Si OAuth falla**: `rm ~/.local/share/opencode/mcp-auth.json` y re-autenticar
8. **Nombrar MCPs descriptivamente**: el nombre se usa como prefijo de todos sus tools

---

## 📚 Referencias Oficiales

| Recurso | URL |
|---------|-----|
| Docs MCP Servers | https://opencode.ai/docs/mcp-servers/ |
| Docs Config | https://opencode.ai/docs/config/ |
| Schema JSON | https://opencode.ai/config.json |
| Issue #23664 — `{env:}` en headers roto | https://github.com/anomalyco/opencode/issues/23664 |
| Issue #25008 — OAuth cache corruption | https://github.com/anomalyco/opencode/issues/25008 |
| Issue #23506 — Skip SSL cert validation | https://github.com/anomalyco/opencode/issues/23506 |
| Issue #26195 — OAuth browser flow falla | https://github.com/anomalyco/opencode/issues/26195 |
| PR #23163 — Refactor MCP schemas | https://github.com/anomalyco/opencode/pull/23163 |

---

## 🗂️ Ejemplos Reales de MCPs Populares

### Sentry (remote + OAuth)
```json
{
  "mcp": {
    "sentry": {
      "type": "remote",
      "url": "https://mcp.sentry.dev/mcp",
      "oauth": {}
    }
  }
}
```
Luego: `opencode mcp auth sentry`

### Context7 (remote, sin auth)
```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Grep by Vercel (remote, sin auth)
```json
{
  "mcp": {
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app"
    }
  }
}
```

### Servidor de prueba oficial (local)
```json
{
  "mcp": {
    "mcp_everything": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```
