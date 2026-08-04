# ADR-011: Operaciones administrativas específicas en PostgreSQL

## Estado

Aceptado para la V1.

## Fecha

2026-07-25.

## Contexto

El panel del Administrador nexi necesita consultar y modificar datos globales de
plataforma. El rol web `nexi_app` está sujeto a RLS y no debe recibir
`SUPERUSER`, `BYPASSRLS`, propiedad de tablas ni acceso directo general a datos
globales. Tampoco es aceptable utilizar `DATABASE_MIGRATION_URL` en solicitudes
web o entregar al adaptador de identidad capacidad de consulta SQL arbitraria.

Las operaciones autorizadas en la Etapa 6 son concretas: resumen, listado y
detalle de tenants, creación y cambio de estado, invitaciones, membresías
`client_admin` y consulta de auditoría.

## Decisión

Las solicitudes web continúan usando exclusivamente `DATABASE_URL` y el rol
restringido `nexi_app`.

Las operaciones globales se exponen mediante funciones PostgreSQL
`SECURITY DEFINER` específicas bajo `app_private`. Cada función administrativa:

- fija `search_path = pg_catalog`;
- recibe `session_id` y `actor_user_id` determinados por el servidor;
- ejecuta `app_private.require_nexi_admin_session`;
- vuelve a comprobar sesión vigente, usuario activo, rol `nexi_admin` y AAL2;
- utiliza consultas parametrizadas y contratos de entrada cerrados;
- limita sus tablas, columnas y transición de estado;
- registra el evento cuando modifica datos;
- revoca `EXECUTE` a `PUBLIC` y concede solamente la firma necesaria a
  `nexi_app`.

Las excepciones no administrativas también son específicas:

- `accept_tenant_invitation` se limita a una invitación pendiente cuya
  referencia, proveedor y correo ya fueron verificados por el adaptador
  server-side; no permite consultas arbitrarias.
- `record_admin_access_denied` solo agrega un evento bloqueado y existe para
  registrar solicitudes que no pueden superar la autorización.

La expiración local de invitaciones no utiliza una función
`SECURITY DEFINER`. El comando `invitations:expire-local` se restringe a
`APP_ENV=local|test` y usa el rol de migración fuera del flujo web.

## Alternativas evaluadas

### Conceder acceso directo global a `nexi_app`

Rechazado. Convertiría un error de aplicación en lectura o escritura global y
debilitaría RLS.

### Usar el rol de migración en el servidor web

Rechazado. Mezclaría cambios de esquema con solicitudes HTTP y ampliaría
innecesariamente el impacto de una vulnerabilidad.

### Utilizar una clave global del proveedor como acceso general a datos

Rechazado. La clave secreta de Supabase queda limitada al adaptador de identidad
y no reemplaza la autorización de la aplicación ni PostgreSQL.

### Servicio administrativo separado

Diferido. Añadiría despliegue, operación y costo sin aportar una frontera útil
en la V1. El monolito modular mantiene una separación suficiente mientras las
funciones sean específicas.

## Consecuencias

- Hay doble autorización: en servidor y en PostgreSQL.
- `nexi_app` no obtiene privilegios directos sobre las tablas nuevas.
- Cambiar una firma SQL requiere migración y actualización coordinada del
  repositorio TypeScript.
- La migración 0007 concentra numerosas funciones y debe revisarse como unidad
  de seguridad.
- Las operaciones futuras sobre contenido tenant-scoped no quedan autorizadas
  automáticamente por esta decisión.

## Riesgos

- Una función futura demasiado genérica podría convertirse en bypass. Debe
  prohibirse SQL dinámico y mantener contratos estrechos.
- Las funciones pertenecen a `nexi_migrator`; una migración defectuosa podría
  ampliar privilegios.
- Supabase real, plantillas de invitación y TOTP todavía requieren validación
  en staging.

## Documentos relacionados

- [Etapa 6: panel Administrador nexi](../etapa-6-panel-administrador-nexi.md)
- [ADR-009: PostgreSQL y RLS multi-tenant](ADR-009-postgresql-rls-multitenant.md)
- [ADR-010: Supabase Auth y sesiones opacas](ADR-010-supabase-auth-sesiones-opacas.md)
