# ADR-009: PostgreSQL y RLS para la prueba multi-tenant

- Estado: aceptado para prueba técnica
- Fecha: 2026-07-22
- Proyecto: Longhorn
- Marca comercial: nexi

## Contexto

La aplicación utiliza Vinext con App Router y el plugin de Cloudflare. El código
server-side se ejecuta bajo `workerd` durante el desarrollo de Vinext y el
destino nativo actual es Cloudflare Workers con `nodejs_compat`.

La prueba debe usar PostgreSQL real, transacciones y Row Level Security sin
aprovisionar infraestructura cloud ni escoger todavía un proveedor productivo.

## Decisión

Se utiliza:

- `pg` como driver PostgreSQL;
- SQL PostgreSQL versionado como fuente de verdad del esquema;
- un ejecutor de migraciones pequeño y específico;
- PostgreSQL local mediante Docker Compose;
- un rol `nexi_migrator` propietario del esquema;
- un rol `nexi_app` restringido y sujeto a RLS;
- contexto de tenant mediante variables de transacción:
  `app.current_tenant_id`, `app.current_user_id` y
  `app.current_correlation_id`;
- `set_config(..., true)` dentro de una transacción para evitar que el contexto
  sobreviva al devolver la conexión al pool.

El código de dominio recibe una sesión SQL ya contextualizada. No depende de un
SDK de Cloudflare, Hyperdrive ni un proveedor PostgreSQL administrado.

## Compatibilidad evaluada

| Alternativa | Local y pruebas | Worker actual | Despliegue previsto | Decisión |
| --- | --- | --- | --- | --- |
| TCP con `pg` | Compatible con PostgreSQL local | Compatible con `nodejs_compat` | Cliente por solicitud; Hyperdrive opcional | Elegida |
| Cliente HTTP administrado | Exige proveedor externo | Compatible con `fetch` | Acoplamiento al proveedor | Descartada por ahora |
| Hyperdrive | No sustituye PostgreSQL local | Nativo en Cloudflare | Recomendable al autorizar cloud | Diferido |

Referencias:

- [Cloudflare: conexión a PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [Cloudflare Workers: conexiones a bases de datos](https://developers.cloudflare.com/workers/databases/connecting-to-databases/)
- [Vinext: runtime y despliegue](https://github.com/cloudflare/vinext)

## Seguridad

- `nexi_app` no es superusuario, propietario, `CREATEDB`, `CREATEROLE` ni
  `BYPASSRLS`.
- Las credenciales de migración no se importan desde rutas de la aplicación.
- El tenant no se recibe desde una ruta, formulario, cookie o encabezado
  público.
- No existe endpoint para escoger tenant.
- Las consultas de aplicación se ejecutan dentro de una transacción
  contextualizada.
- RLS se habilita en las tres tablas de dominio.
- La función `app_private.current_actor_is_active_member()` es pequeña,
  `SECURITY DEFINER`, no acepta parámetros y fija un `search_path` seguro.

No se utiliza `FORCE ROW LEVEL SECURITY` en esta prueba. El propietario
`nexi_migrator` necesita preparar datos sintéticos y revertir migraciones; el
rol de aplicación es distinto, no posee tablas y está sujeto a RLS. Antes de un
entorno productivo deberá revisarse si las operaciones administrativas
requieren un rol técnico adicional que permita forzar RLS también al
propietario.

## Consecuencias

Positivas:

- aislamiento comprobable en PostgreSQL, no mediante filtros TypeScript;
- SQL portable entre proveedores PostgreSQL;
- migraciones pequeñas y revisables;
- compatibilidad futura con Hyperdrive sin contaminar el dominio.

Costos y límites:

- Docker es requisito para ejecutar la prueba local;
- el ejecutor propio cubre solo las necesidades actuales;
- el acceso global del Administrador nexi no está implementado;
- la futura autenticación deberá derivar tenant y actor antes de abrir el
  contexto;
- una conexión Worker productiva deberá crearse dentro de cada solicitud.
