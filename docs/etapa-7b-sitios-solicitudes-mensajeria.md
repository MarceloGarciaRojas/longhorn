# Etapa 7B — Operación básica de sitios, solicitudes y mensajería

## Estado

Implementada y validada en entorno local/CI el 25 de julio de 2026. No se
realizó despliegue, conexión a proveedores reales, `git add` ni commit.

## Alcance implementado

La etapa incorpora operaciones reales y acotadas para los dos contextos
autenticados existentes:

- Cliente Administrador: consulta sus sitios, solicita o cancela eliminación,
  solicita dominio propio según capacidad del plan y mantiene conversaciones
  internas con nexi.
- Administrador nexi: crea y actualiza sitios, administra dominios y
  solicitudes, procesa la cola de eliminación y atiende soporte.

Continúan fuera de alcance el editor de contenido, plantillas dinámicas,
archivos, DNS, contratación automática de dominios, correo real, WhatsApp,
Flow, cobros, onboarding, tiendas y eliminación física.

## Arquitectura

Se conserva el monolito modular TypeScript/Vinext existente. La lógica de esta
etapa se concentra en `site/src/operations/`:

- `contexts.server.ts`: construye contextos confiables desde la sesión.
- `validation.ts`: valida comandos y datos de entrada en servidor.
- `service.server.ts`: casos de uso transaccionales.
- `notification-adapter.ts`: entrega sintética local/CI del outbox.
- `http.server.ts`: contrato HTTP, origen confiable y errores públicos seguros.
- `types.ts`: estados y contratos compartidos del módulo.

Las rutas `site/app/api/client/operations/route.ts` y
`site/app/api/admin/operations/route.ts` son fachadas pequeñas. Ninguna acepta
un `tenant_id` del navegador como autoridad. El tenant cliente se obtiene de la
sesión activa y las operaciones internas vuelven a verificar audiencia,
rol de plataforma y AAL2.

## Modelo de datos

La migración `site/db/migrations/0009_sites_requests_support.up.sql` añade:

- control de versión e idempotencia de creación a `sites`;
- `site_deletion_requests`;
- `site_domain_requests`;
- `site_domains`;
- `support_conversations`;
- `support_conversation_participants`;
- `support_messages`;
- `notification_outbox`.

La migración inversa está en
`site/db/migrations/0009_sites_requests_support.down.sql`. Las migraciones se
probaron con aplicación, rollback completo y reaplicación sobre PostgreSQL
real. El seed incorpora únicamente empresas, sitios, solicitudes, dominios,
conversaciones y mensajes ficticios.

## Permisos y aislamiento

| Operación | Cliente Administrador | Administrador nexi |
| --- | --- | --- |
| Consultar sitios | Solo tenant activo | Todos, tras AAL2 |
| Crear sitio | No | Sí |
| Actualizar datos operativos | No | Sí |
| Solicitar/cancelar eliminación | Sí, sitio propio | Sí |
| Aprobar/rechazar/ejecutar solicitud | No | Sí |
| Solicitar dominio | Sí, si el plan lo permite | Sí |
| Registrar/asignar dominio | No | Sí |
| Abrir/responder conversación | Sí, tenant activo | Sí |
| Cerrar/reabrir conversación propia | Sí | Sí |
| Cambiar prioridad | No | Sí |

Todas las tablas multi-tenant tienen RLS. Las políticas comprueban tenant,
membresía activa y estado de empresa; los triggers vuelven a comprobar la
coherencia entre tenant y sitio. El rol `nexi_app` continúa sin
`BYPASSRLS`, propiedad de tablas ni privilegios administrativos.

## Eliminación de sitios

La eliminación es una solicitud, no un `DELETE`.

1. El Cliente Administrador crea la solicitud.
2. El sitio pasa a `deletion_requested` y conserva su estado anterior.
3. El plazo se calcula con `SITE_DELETION_GRACE_HOURS`, limitado a 24 o 48
   horas; la configuración de referencia usa 48.
4. Cliente o Administrador nexi pueden cancelar según el estado.
5. El Administrador nexi puede aprobar o rechazar.
6. La ejecución antes de `eligible_at` se rechaza.
7. La ejecución válida archiva el sitio; no elimina filas ni contenido.

Los comandos críticos aceptan clave de idempotencia, aplican control de versión
y generan auditoría. No existe purge ni borrado físico en esta etapa.

## Dominios

El Cliente Administrador solo genera la solicitud. El backend comprueba que el
plan asignado incluya `custom_domain_request`. El Administrador nexi puede
registrar el dominio, asociarlo a tenant y sitio, indicar si es principal y
mantener estado, verificación, fechas, errores y notas operativas.

La base impide más de un dominio principal por sitio. No se implementan DNS,
NIC Chile, certificados ni contratación automática. La propiedad comercial de
los dominios sigue siendo nexi conforme a la definición de producto.

## Mensajería y notificaciones

Las conversaciones y mensajes permanecen en PostgreSQL como fuente de verdad.
Los mensajes son inmutables mediante trigger y no caducan. Se admiten
conversaciones abiertas o cerradas, prioridad administrada por nexi, respuestas
de ambos roles, lectura y contador de no leídos.

El correo y WhatsApp no se integran. `notification_outbox` conserva eventos
mínimos y sin cuerpo sensible; la entrega sintética solo funciona en
`local`/`test` y se niega en producción. Esto permite sustituir después el
adaptador sin mover el historial fuera de nexi.

## Rutas de interfaz

Cliente Administrador:

- `/cuenta/sitios`
- `/cuenta/sitios/[siteId]`
- `/cuenta/mensajes`
- `/cuenta/mensajes/[conversationId]`

Administrador nexi:

- `/nexi-interno/sitios`
- `/nexi-interno/sitios/[siteId]`
- `/nexi-interno/solicitudes/eliminacion`
- `/nexi-interno/solicitudes/dominios`
- `/nexi-interno/soporte`
- `/nexi-interno/soporte/[conversationId]`

Las mutaciones usan una isla cliente común con bloqueo durante el envío,
confirmación para operaciones sensibles y mensajes de resultado accesibles.
La autorización real permanece en backend y PostgreSQL.

## Auditoría

Se registran acciones administrativas y de cliente relevantes: creación y
actualización de sitios, solicitudes y decisiones de eliminación, registro y
estado de dominios, apertura y respuesta de conversaciones, cambios de estado,
prioridad, lectura y entrega sintética del outbox. Los errores HTTP no revelan
consultas, identificadores internos ajenos, secretos ni causas SQL.

## Validaciones

La cobertura añadida incluye:

- migración, rollback, constraints, funciones, triggers y políticas RLS;
- aislamiento cruzado y UUID ajenos;
- doble envío e idempotencia;
- plazo de eliminación, cancelación, aprobación, rechazo y archivo;
- capacidad de plan y dominio principal único;
- mensajes inmutables, no leídos, cierre/reapertura y permisos de prioridad;
- payload seguro y entrega sintética del outbox;
- audiencia y AAL2 del Administrador nexi;
- flujo HTTP real cliente/administrador sobre Vinext y PostgreSQL.

Comandos principales:

```text
pnpm test:db
pnpm test:operations
pnpm test:operations-e2e
pnpm test:auth
pnpm test:admin
pnpm test:client
pnpm test:e2e
pnpm test:admin-e2e
pnpm test:client-e2e
pnpm verify
```

Resultado de cierre: PostgreSQL/RLS 8/8, autenticación 19/19,
Administrador nexi 14/14, Cliente Administrador 12/12, operaciones 7B 8/8 y
E2E 6/6. `pnpm verify` aprobó lint sin errores, typecheck, 25 pruebas generales,
build y escaneo de 173 archivos. Persisten tres advertencias heredadas por
`<img>` en la landing.

## Configuración

`SITE_DELETION_GRACE_HOURS` es obligatoria en staging/producción y solo admite
`24` o `48`. Local/test usa `48` como valor predeterminado. No se agregaron
secretos ni servicios pagados.

## Deuda y siguientes límites

- Conectar y validar Supabase Auth real en staging.
- Definir proveedor y política de entrega de notificaciones antes de habilitar
  correo.
- Definir retención operativa del outbox y auditoría; los mensajes no caducan.
- Diseñar el proceso separado y explícito de borrado físico, si alguna etapa
  futura lo autoriza.
- Añadir editor, contenido y plantillas solo en una etapa posterior aprobada.
- Ejecutar pruebas de concurrencia de alta carga antes de operación productiva.

La Etapa 7B no autoriza cobros, dominio automatizado ni despliegue.
