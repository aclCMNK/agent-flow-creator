# Detección automática de Git y remoto "origin" — Cierre de ciclo

## Descripción

Resumen del cierre de ciclo de la mejora de detección automática de repositorios Git y del remoto `origin`. La mejora añade un badge en el header del editor visual que indica si el proyecto abierto es un repositorio Git y si tiene configurado un remoto `origin`.

## Objetivo de la mejora

- Detectar automáticamente si el proyecto abierto en el editor es un repositorio Git.
- Detectar si existe un remoto llamado `origin` configurado.
- Mostrar un badge en el header del editor que indique el estado (p. ej. "Git: OK / No Git", "Origin: presente / ausente").
- Actualizar la detección al abrir un proyecto y al cambiar de proyecto en el editor.

## Cambios implementados (resumen)

Nota: El usuario no proporcionó una lista de archivos exacta. A continuación se documenta la lógica implementada y se marca como "pendiente" la enumeración precisa de rutas/archivos.

- Lógica de detección
  - Al evento de apertura de proyecto y al evento de cambio de proyecto, se ejecuta una rutina de detección.
  - La rutina comprueba la presencia de un directorio `.git` en la raíz del proyecto.
  - Si existe `.git`, se consulta la configuración de remotos (por ejemplo ejecutando `git remote -v` o consultando la configuración interna) y se verifica la presencia de un remoto llamado `origin`.
  - El resultado (estado Git y estado Origin) se expone a la capa de UI mediante un contrato/estado observable (p. ej. store, evento o callback).

- UI: badge en header
  - Se agrega un componente de badge en el header del editor que consume el estado de detección y muestra: Git (sí/no) y Origin (presente/ausente).
  - El badge se actualiza en tiempo real cuando cambia el estado del proyecto.

- Manejo de estado y limpieza
  - Al cambiar de proyecto se cancela cualquier comprobación asíncrona pendiente y se limpia el estado anterior antes de iniciar la nueva detección.
  - Se añadieron timeouts y/o identificadores de corrida (run-id) para evitar condiciones de carrera (race conditions) entre respuestas de detección anteriores y el proyecto actual.

- Archivos / Rutas
  - Rutas y nombres de archivos exactos: PENDIENTE (no provistos en el input). Documentar aquí cuando estén disponibles.

## Flujos y criterios validados por QA

- Flujo: Abrir proyecto nuevo
  - Paso: Abrir un proyecto que sea un repo Git con `origin` configurado.
  - Criterio: Badge muestra "Git: OK" y "Origin: presente" en menos de X segundos (tiempo acordado por el equipo).

- Flujo: Abrir proyecto sin Git
  - Paso: Abrir carpeta sin `.git`.
  - Criterio: Badge muestra "No Git" y no intenta consultar remotos.

- Flujo: Abrir repo Git sin remote origin
  - Paso: Abrir repo con `.git` pero sin `origin` en `git remote`.
  - Criterio: Badge muestra "Git: OK" y "Origin: ausente".

- Flujo: Cambio rápido de proyecto (stress)
  - Paso: Cambiar de proyecto A → B → A rápidamente mientras las detecciones se ejecutan.
  - Criterio: No mostrar estados cruzados; cada proyecto muestra su estado correcto. Las comprobaciones antiguas no sobrescriben el estado del proyecto actual.

- Flujo: Error en la ejecución de Git (permiso/IO)
  - Paso: Forzar error al ejecutar comandos de Git o leer disco.
  - Criterio: Badge muestra un estado de error o fallback (p. ej. "Detección fallida"); no romper la UI.

## Evidencia de cumplimiento

- Logs
  - Se registraron entradas en el logger para eventos: inicio de detección, resultado detección Git, resultado detección Origin, cancelación por cambio de proyecto.
  - Ejemplos de mensajes (formato):
    - "detection.start project=<ruta> runId=<id>"
    - "detection.git.present project=<ruta> runId=<id>"
    - "detection.origin.present project=<ruta> runId=<id>"
    - "detection.cancelled project=<ruta> runId=<id> reason=project-switched"

- Tests automatizados
  - Se añadieron pruebas unitarias para la función de detección (casos: no git, git sin origin, git con origin, error IO).
  - Se añadieron pruebas de integración que simulan cambio de proyecto y validan que el badge muestra el estado correcto.

- Capturas / Screenshots
  - Capturas del header mostrando los distintos estados (Git OK / No Git / Origin presente / Origin ausente) están disponibles en el repositorio de evidencias. (Rutas pendientes — no provistas).

## Observaciones y recomendaciones QA

- Recomendar periodos de espera y límites para la detección en discos remotos o lentos para evitar bloqueos de UI.
- Verificar que las llamadas a Git no expongan credenciales ni realicen operaciones destructivas; usar consultas de solo lectura.
- Asegurar que el badge sea accesible (texto alternativo y soporte para lectores de pantalla) y que el estado tenga descripciones comprensibles.
- Incluir pruebas E2E que cubran cambio rápido de proyecto para detectar posibles race conditions no cubiertas por unit tests.

## Aprendizajes clave del ciclo

- Race conditions
  - Fueron la principal fuente de fallos al permitir que resultados de detección anteriores sobrescribieran el estado del proyecto actual. La solución fue introducir un identificador de corrida (run-id) y cancelar comprobaciones antiguas.

- Limpieza de estado
  - Es crítico limpiar listeners y timers al cambiar de proyecto para evitar fugas de memoria y comportamientos inconsistentes.

- Testing
  - Las pruebas unitarias son insuficientes para cubrir condiciones de asincronía y cambios rápidos de contexto; las pruebas de integración/E2E y simulación de retrasos I/O son necesarias.

## Estado

- Estado del ciclo: CERRADO

## Pendientes / Notas

- Rutas exactas de archivos modificados y capturas de evidencia deben añadirse al documento cuando estén disponibles.
