# Plan de validación: Clone from Git (modal "Clone from Git")

## Descripción

Plan detallado para validar la funcionalidad del modal "Clone from Git" que permite clonar repositorios Git dentro de la aplicación. El plan incluye objetivo, fases, tareas, criterios de éxito, decisiones técnicas y una tabla de responsables.

## Objetivo

Validar que el modal "Clone from Git":
- Presenta la información y campos necesarios al usuario.
- Realiza las validaciones de entrada apropiadas.
- Ejecuta la operación de clonado correctamente en condiciones previstas.
- Maneja errores y estados extremos de forma determinista y con mensajes útiles.

## Fases

1. Preparación
2. Validación funcional
3. Validación de errores y casos límite
4. Validación de integración
5. Pruebas de rendimiento y UX
6. Revisión y aceptación

## Tareas por fase

1) Preparación
- Revisar especificación del modal y los requisitos de UX.
- Preparar entornos de prueba (local, staging) con accesos a Git remotos controlados.
- Preparar cuentas y credenciales de prueba (si aplica) y repositorios ejemplo: vacíos, con historial, con submódulos.

2) Validación funcional
- Verificar que el modal se abre desde los puntos de la UI previstos.
- Verificar campos: URL del repositorio, rama (opcional), carpeta destino (opcional), credenciales/SSH selection, opciones avanzadas.
- Validar comportamiento de ayuda/placeholder y enlaces a documentación.
- Validar validaciones de formato de URL (https, ssh, git://) y mensajes de error cuando no cumple.
- Comprobar que el botón "Clone" está habilitado sólo cuando los campos obligatorios son válidos.

3) Validación de errores y casos límite
- Intentar clonar desde URL inválida o malformada → mensaje de validación en UI.
- Clonar repositorio privado sin credenciales → manejo de autenticación y mensaje de error claro.
- Interrumpir la conexión durante el clonado → ver estado de cancelación y mensajes.
- Clonar en carpeta ya existente → comprobar comportamiento (overwrite, prompt, error) según especificación.
- Repositorios muy grandes → verificar timeouts y feedback al usuario.
- Repositorios con submódulos → comprobar que la operación respeta la opción seleccionada (incluir submódulos o no).

4) Validación de integración
- Verificar llamadas a APIs internas o comandos Git usados por el backend/agent.
- Validar logs producidos (trazas, errores) y su correlación con los mensajes de UI.
- Comprobar permisos de filesystem donde se realiza el checkout/clonado.
- Validar comportamiento en distintos sistemas operativos/entornos si aplica.

5) Pruebas de rendimiento y UX
- Medir tiempo promedio de clonado para repositorios pequeños/medianos/grandes.
- Validar la usabilidad del modal en redes lentas: indicadores de progreso, mensajes, posibilidad de cancelar.
- Verificar que los estados de carga no bloquean la UI global.

6) Revisión y aceptación
- Ejecutar checklist de criterios de aceptación.
- Registrar bugs encontrados y verificarlos tras corrección.
- Obtener aprobación de product/QA para cerrar la validación.

## Criterios de éxito

- El modal se abre desde los puntos de entrada definidos y muestra los campos correctos.
- Validaciones de entrada detectan y comunican errores de formato antes de intentar clonar.
- Clonado exitoso de repositorios públicos y privados (con credenciales válidas) en entornos de prueba.
- Manejo apropiado y mensajes claros para error de autenticación, URL inválida, conflicto de destino y errores de red.
- Operación abortable por el usuario con el sistema regresando a un estado consistente.
- Logs e indicadores de estado permiten reproducir y diagnosticar fallos.
- Todas las tareas críticas completadas y aprobadas por QA y product.

## Decisiones técnicas

- Endpoint/backend responsable de la operación de clonación: usar el servicio X (según especificación existente). (Detalles específicos pendientes en la especificación técnica.)
- Validaciones de formato: aplicar validación en UI y re-validar en backend para evitar bypass.
- Mecanismo de autenticación: soportar HTTPS (username/password, token) y SSH (llave). Confirmar flujo exacto con el equipo de seguridad.
- Manejo de submódulos: opción configurable por el usuario; si no especificado, usar comportamiento por defecto definido por product.
- Timeouts y retries: aplicar timeout configurado por el backend; reintentos automáticos no habilitados por defecto.

Nota: Las decisiones anteriores reflejan criterios a validar; los detalles concretos (nombres de servicios, valores de timeout, comportamiento exacto en conflicto de destino) deben recogerse de la especificación técnica o del equipo responsable. Si no hay especificación, marcar como pendiente.

## Tabla de responsables

| Rol | Nombre / Equipo | Responsabilidades |
|-----|-----------------|-------------------|
| Product Owner | [pendiente] | Aceptación de criterios, decisiones de UX/behaviour |
| QA Lead | [pendiente] | Diseño y ejecución de pruebas, reporte de bugs |
| Dev Lead | [pendiente] | Confirmar integración backend, resolver bugs críticos |
| Backend Engineer | [pendiente] | Implementar/validar endpoint de clonado, logs, timeouts |
| Frontend Engineer | [pendiente] | Implementar validaciones UI, mensajes, estados de carga |
| SRE / Infra | [pendiente] | Entornos de prueba, permisos FS, performance testing |

## Pendientes / Notas

- Rellenar nombres de responsables cuando se asignen.
- Adjuntar especificación técnica (endpoints, valores de timeout, comportamiento en overwrite) como referencia en esta misma ruta.
- Si no existe entorno de staging con acceso a Git remotos controlados, crear uno antes de la fase de validación.
