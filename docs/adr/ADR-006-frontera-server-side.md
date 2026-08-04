# ADR-006: API y servicios server-side como frontera de seguridad

- Estado: aceptado como línea base de arquitectura
- Fecha: 2026-07-14
- Proyecto: Longhorn
- Marca: nexi

## Contexto

La interfaz del navegador puede ser manipulada. Ocultar botones no impide
llamadas directas. Longhorn necesita verificar identidad, tenant, membresía,
rol, permisos, estado y validez de datos antes de ejecutar operaciones.

## Decisión

1. La API y los servicios server-side constituyen la frontera de seguridad.
2. El navegador nunca es una fuente confiable de autorización.
3. Toda operación sensible debe validarse en el servidor.
4. El servidor debe derivar tenant, actor y permisos desde contexto confiable.
5. Las políticas deben comprobar roles, membresías y estado del recurso.
6. Los repositorios deben recibir contexto ya validado y operar con RLS.
7. La validación del frontend puede mejorar la experiencia, pero no sustituye
   la validación server-side.
8. Las respuestas no deben exponer secretos ni campos internos.
9. Las operaciones críticas deben quedar auditadas.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Autorizar solamente ocultando elementos de interfaz | No impide llamadas directas ni manipulación del navegador |
| Confiar en roles o tenant_id enviados por el navegador | El cliente no es una fuente confiable de autorización |
| Acceso directo del cliente a tablas sin políticas controladas | Evita la validación server-side y amplía la superficie de acceso |
| Duplicar reglas de autorización de manera distinta en cada pantalla | Produce políticas inconsistentes y difíciles de probar |
| Confiar únicamente en RLS sin autorización de aplicación | RLS complementa, pero no reemplaza, roles, membresías y reglas del recurso |

## Consecuencias

- Existe mayor responsabilidad en la capa server-side.
- Las peticiones directas sin permiso deben fallar cerradas.
- La lógica de autorización debe probarse independientemente del frontend.
- RLS complementa, pero no reemplaza, las políticas de aplicación.
- Se necesita trazabilidad para acciones sensibles.
- Los contratos de API deben mantenerse claros y versionados cuando
  corresponda.

## Estado actual de implementación

- La frontera server-side está aplicada en los módulos implementados.
- Las operaciones administrativas requieren controles reforzados.
- Este ADR no autoriza exposición pública de APIs administrativas.
