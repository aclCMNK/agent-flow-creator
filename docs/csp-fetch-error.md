# Error CSP al usar fetch desde el Renderer en Electron

## 1. ¿Qué es este error y por qué ocurre?

Error observado:

> "Connecting to 'https://api.github.com/...' violates the following Content Security Policy directive: 'default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*'. Note that 'connect-src' was not explicitly set, so 'default-src' is used as a fallback."

Explicación técnica:

- Content Security Policy (CSP) es una cabecera/ meta etiqueta que indica al motor de renderizado (Chromium) qué orígenes y recursos están permitidos para una página web. En el contexto de Electron, el renderer process carga contenido en una instancia de Chromium y por tanto puede estar sujeto a CSP igual que un navegador.
- El renderer process es, de hecho, un navegador (Chromium) embebido: por eso las restricciones de CSP aplican cuando se ejecutan APIs web como fetch(), XMLHttpRequest, websockets, etc.
- Cuando `connect-src` no está explícitamente definido en la política, el navegador usa la directiva `default-src` como fallback. En el mensaje de error se indica precisamente que `connect-src` no existía, por lo que se aplicó `default-src`.
- Si la política incluye `default-src 'self' ...`, esto restringe las conexiones salientes a los orígenes listados (por ejemplo el mismo origen). Por tanto una petición a `https://api.github.com` queda bloqueada si no está permitida por `connect-src` o `default-src`.

## 2. ¿Por qué `git clone` sí funciona pero `fetch` no?

- `git clone` (o cualquier operación git ejecutada por Node.js) se ejecuta en el main process de Electron. El main process corre sobre Node.js y no está sujeto a las políticas CSP del renderer/Chromium.
- `fetch()` ejecutado desde el renderer process sí está sujeto a CSP porque Chromium aplica esas políticas a las peticiones de red iniciadas desde una página web.
- Resumen: CSP es una política del motor de renderizado (navegador), no de Node.js. Por eso el main process puede hacer peticiones HTTP/HTTPS sin las limitaciones de CSP.
- Consecuencia práctica: si necesita acceder a APIs externas desde la app, puede permitirlas en la CSP del renderer o delegar las peticiones al main process (por ejemplo vía IPC), que actuará como proxy sin las restricciones de CSP.

## 3. Solución: Modificar la CSP para permitir connect-src

Se presentan tres opciones, con ejemplos.

### Opción A — Agregar `connect-src` explícito en el meta tag del HTML

Ejemplo (index.html):

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; connect-src 'self' https://api.github.com https://*.github.com http://localhost:* ws://localhost:*">
```

Notas:
- Esta solución es directa y apropiada para desarrollo o prototipos.
- Modificar la meta tag solo afecta al contenido servido en ese HTML.

### Opción B — Configurar CSP en el main process (más seguro que editar HTML)

Usar la API de session para inyectar o modificar las cabeceras de respuesta y añadir/ajustar la Content-Security-Policy:

```javascript
const { app, session } = require('electron');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; connect-src 'self' https://api.github.com https://*.github.com http://localhost:* ws://localhost:*"
        ]
      }
    });
  });
});
```

Notas:
- Permite centralizar la política desde el main process y aplicarla a todas las cargas de páginas.
- Útil cuando no se controla directamente el HTML o cuando se quiere imponer una política desde la aplicación.

### Opción C — Delegar el fetch al main process via IPC (recomendada para producción)

Descripción:
- En lugar de permitir orígenes externos directamente en el renderer, mantener al renderer aislado y hacer que el main process realice las peticiones externas. El renderer solicita la operación vía IPC y recibe la respuesta.

Ejemplo mínimo:

En el main process (main.js):

```javascript
const { ipcMain } = require('electron');
const https = require('https');

ipcMain.handle('http-fetch', async (event, url, options) => {
  // Implementación simplificada: usar node https/fetch o librería HTTP
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve({ status: res.statusCode, body: data }); });
    }).on('error', (err) => reject(err));
  });
});
```

En el renderer (preload o renderer script con contexto aislado):

```javascript
// Usando contextBridge en preload.js para exponer una API segura
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchFromMain: async (url, options) => ipcRenderer.invoke('http-fetch', url, options)
});

// En el código del renderer:
// const res = await window.api.fetchFromMain('https://api.github.com/...');
```

Notas:
- Esta opción mantiene el renderer con una superficie de ataque reducida y permite aplicar validaciones, caching, autenticación o sanitización en el main process.
- Recomendado para producción cuando se desea minimizar la exposición del renderer a orígenes externos.

## 4. Recomendación final

- Para este proyecto: usar Opción A (meta tag en index.html) si se necesita una solución rápida durante desarrollo.
- Para producción: usar Opción C (delegar peticiones al main process vía IPC) para mantener el renderer aislado y reducir riesgos de seguridad.
- Nunca usar `connect-src *` en producción: abre la aplicación a cualquier origen y genera riesgos de seguridad.

## 5. Hosts requeridos para este proyecto

Dominios que deben estar incluidos en `connect-src` para este proyecto:

- https://api.github.com
- https://*.github.com  (opcional, para otros endpoints de GitHub)

---

Archivo generado: docs/csp-fetch-error.md
