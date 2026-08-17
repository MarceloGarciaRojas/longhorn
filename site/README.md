# nexi web

Aplicación web del proyecto interno Longhorn y de la marca comercial **nexi**.
Contiene la landing, la fundación PostgreSQL/RLS y la autenticación de
Cliente Administrador y Administrador nexi. El back office interno permite
gestionar empresas, invitaciones y membresías. El panel cliente permite
seleccionar una empresa, consultar sitios y plan, y actualizar datos
autorizados. La operación básica incorpora sitios, solicitudes de eliminación
y dominio, y mensajería interna, siempre bajo autorización server-side y RLS.

## Requisitos

- Node.js `24.14.0` (definido en `.nvmrc`).
- pnpm `11.9.0` (definido en `package.json`).
- Git para instalación, CI y escaneo local de secretos.
- Docker con Docker Compose para la prueba PostgreSQL local.

La landing y sus pruebas existentes no requieren una base de datos. PostgreSQL
solo es obligatorio para los comandos `db:*`, `test:db` y
`test:tenant-isolation`. No se requiere una cuenta cloud.

## Instalación

Desde este directorio:

```bash
pnpm install --frozen-lockfile
```

La instalación bloqueada debe utilizar exclusivamente `pnpm-lock.yaml`.

`pnpm-workspace.yaml` fija temporalmente versiones corregidas de `fast-uri`,
`postcss` y `sharp` mediante `overrides`, porque dependencias transitivas
vigentes todavía resuelven versiones afectadas por avisos de seguridad. Estas
resoluciones deben revisarse al actualizar Next.js y Cloudflare, y no eliminarse
sin repetir audit, pruebas y build.

## Variables de entorno

Copia `.env.example` como `.env.local` y ajusta únicamente valores locales.

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

Variables actuales:

| Variable | Obligatoria | Secreta | Uso |
| --- | --- | --- | --- |
| `APP_ENV` | No | No | Ambiente lógico: local, test, development, alpha, staging o production. |
| `APP_URL` | En alpha/staging/production | No | URL canónica HTTPS fuera de local/test. |
| `APP_VERSION` | No | No | Versión mostrada por health. |
| `APP_COMMIT_SHA` | No | No | Commit desplegado cuando esté disponible. |
| `LOG_LEVEL` | No | No | Nivel mínimo: debug, info, warn o error. |
| `DATABASE_ADMIN_URL` | Solo bootstrap | Sí | Superusuario efímero local/CI para crear roles técnicos. |
| `DATABASE_MIGRATION_URL` | Comandos de esquema | Sí | Rol propietario que aplica migraciones y seeds. |
| `DATABASE_URL` | Aplicación server-side | Sí | Rol de aplicación restringido y sujeto a RLS. |
| `TEST_DATABASE_URL` | Pruebas PostgreSQL | Sí | Rol restringido utilizado por los tests de aislamiento. |
| `AUTH_PROVIDER` | Sí | No | `supabase`; `test` solo en local/CI. |
| `AUTH_SECURITY_PEPPER` | Alpha/staging/producción | Sí | HMAC de identificadores y cifrado de recovery grants. |
| `AUTH_SESSION_TTL_SECONDS` | No | No | Vigencia máxima de sesión cliente. |
| `AUTH_ADMIN_SESSION_TTL_SECONDS` | No | No | Vigencia máxima de sesión interna. |
| `AUTH_INVITATION_TTL_SECONDS` | No | No | Vigencia de una invitación; 24 horas por defecto. |
| `SUPABASE_URL` | Con Supabase | No | Endpoint server-side de Supabase Auth. |
| `SUPABASE_PUBLISHABLE_KEY` | Con Supabase | No | Clave publicable usada solo por el adaptador server-side. |
| `SUPABASE_SECRET_KEY` | Con Supabase | Sí | Acciones administrativas de Auth, solo dentro del adaptador server-side. |
| `MEDIA_SUPABASE_BUCKET` | En Alpha | No | Bucket privado de objetos multimedia. |
| `AUTH_TEST_IDENTITIES` | Local/CI | Sí | Identidades sintéticas efímeras. |
| `AUTH_TEST_RECOVERY_TOKEN` | Local/CI | Sí | Token sintético de recuperación. |
| `SITE_DELETION_GRACE_HOURS` | Alpha/staging/producción | No | Plazo de eliminación: solo `24` o `48`; local/test usa `48`. |
| `ALPHA_RESOURCE_GUARD` | Operación Alpha | No | Debe ser exactamente `nexi-alpha`. |
| `ALPHA_DEPLOY_TARGET` | Operación Alpha | No | Debe ser `cloudflare-workers`. |
| `CLOUDFLARE_ACCOUNT_ID` | Operación Alpha | No | Cuenta que contiene Worker/Hyperdrive. |
| `CLOUDFLARE_HYPERDRIVE_ID` | Build Alpha | No | Binding de conexión PostgreSQL runtime. |

La configuración se valida de forma centralizada. Los errores identifican la
variable inválida, pero nunca imprimen su valor.

## Comandos

| Comando | Propósito |
| --- | --- |
| `pnpm dev` | Inicia Vinext/Vite en desarrollo. |
| `pnpm build` | Genera el build de producción en `dist/`. |
| `pnpm start` | Inicia el build de producción. |
| `pnpm lint` | Ejecuta ESLint. |
| `pnpm typecheck` | Ejecuta TypeScript sin emitir archivos. |
| `pnpm test:unit` | Prueba configuración, logging y errores. |
| `pnpm test:integration` | Prueba el endpoint de salud sin servicios externos. |
| `pnpm test:rendered` | Construye y verifica el HTML renderizado. |
| `pnpm test:db` | Prueba migraciones, roles y aislamiento contra PostgreSQL real. |
| `pnpm test:tenant-isolation` | Ejecuta exclusivamente los casos RLS. |
| `pnpm test:auth` | Prueba login, sesiones, MFA, recuperación y tenant contra PostgreSQL. |
| `pnpm test:e2e` | Construye, inicia Vinext y prueba los flujos HTTP completos. |
| `pnpm test:admin` | Prueba el back office, ciclo de clientes, invitaciones, membresías y auditoría. |
| `pnpm test:admin-e2e` | Recorre el panel interno completo contra Vinext real. |
| `pnpm test:client` | Prueba autorización, aislamiento, perfiles, auditoría y concurrencia del panel cliente. |
| `pnpm test:client-e2e` | Recorre los flujos HTTP de una empresa y multiempresa. |
| `pnpm test:operations` | Prueba sitios, solicitudes, dominios, mensajería, outbox y auditoría contra PostgreSQL. |
| `pnpm test:operations-e2e` | Recorre el flujo HTTP combinado cliente/administrador de la Etapa 7B. |
| `pnpm test:tenant-access` | Alias de las pruebas RLS. |
| `pnpm auth:seed` | Carga identidades y roles sintéticos mediante el seed local/CI. |
| `pnpm admin:seed-local` | Prepara datos sintéticos de administración; se niega fuera de local/test. |
| `pnpm invitations:expire-local` | Marca invitaciones vencidas con el rol de migración; se niega fuera de local/test y no forma parte de la aplicación web. |
| `pnpm test` | Ejecuta las pruebas generales unitarias, de integración y de renderizado. |
| `pnpm db:up` | Inicia PostgreSQL local y crea roles restringidos. |
| `pnpm db:down` | Detiene PostgreSQL y conserva el volumen. |
| `pnpm db:clean` | Detiene PostgreSQL y elimina su volumen local. |
| `pnpm db:migrate` | Aplica migraciones versionadas. |
| `pnpm db:status` | Informa migraciones aplicadas y pendientes. |
| `pnpm db:seed` | Restaura empresas, usuarios, perfiles, planes y sitios completamente ficticios. |
| `pnpm db:reset` | Revierte y reconstruye únicamente una base local/test. |
| `pnpm db:check` | Comprueba la conexión del rol `nexi_app`. |
| `pnpm alpha:preflight` | Valida configuración Alpha sin imprimir secretos ni acceder a red. |
| `pnpm alpha:db:provision` | Crea/rota roles restringidos mediante credenciales Alpha locales. |
| `pnpm alpha:db:migrate` | Aplica migraciones versionadas en Alpha; no ejecuta seeds. |
| `pnpm alpha:db:status` | Informa migraciones Alpha sin usar CI. |
| `pnpm alpha:db:check` | Comprueba el rol `nexi_app` de Alpha. |
| `pnpm alpha:build` | Genera el Worker con SHA y bindings Alpha validados. |
| `pnpm alpha:smoke` | Verifica URL/SHA, Auth, rol y RLS tras un despliegue autorizado. |
| `pnpm alpha:backup` | Genera un dump custom fuera del repositorio. |
| `pnpm alpha:backup:verify` | Valida la estructura de un dump sin restaurarlo. |
| `pnpm security:secrets` | Busca patrones básicos de secretos en archivos de texto. |
| `pnpm security:audit` | Consulta vulnerabilidades conocidas de dependencias. |
| `pnpm verify` | Ejecuta lint, tipos, pruebas, build y escaneo de secretos. |

## Endpoint de salud

Con el servidor en ejecución:

```text
GET /api/health
```

Responde estado, aplicación, ambiente, versión, timestamp, uptime y correlation
ID. No prueba todavía servicios externos y no revela variables, credenciales o
detalles de infraestructura.

## Estructura efectiva

```text
app/                  Rutas y prototipo visual de Next.js
app/api/health/       Endpoint técnico no sensible
app/api/auth/         Endpoints server-side de autenticación
app/api/admin/        Mutaciones internas protegidas
app/nexi-interno/     Back office protegido y no enlazado públicamente
db/bootstrap/          Roles y privilegios exclusivos de local/CI
db/migrations/         SQL versionado, rollback, contexto y RLS
src/auth/             Proveedores, sesiones, seguridad y request context
src/admin/            Casos de uso y acceso mínimo del back office
src/client-portal/    Casos de uso y acceso restringido del panel cliente
src/operations/       Sitios, solicitudes, dominios, soporte y notificaciones
src/tenancy/          Contrato mínimo de host público
src/config/           Configuración centralizada
src/db/               Conexión, contexto y consultas server-side
src/errors/           Errores controlados y respuestas seguras
src/observability/    Correlation ID y logging estructurado
scripts/db/            Ejecutores de bootstrap, migraciones y seeds
tests/db/              Pruebas PostgreSQL y aislamiento cruzado
tests/unit/           Pruebas unitarias
tests/integration/    Pruebas de rutas técnicas
tests/e2e/            Flujos HTTP contra el servidor de producción local
tests/rendered-*.mjs  Smoke test del HTML compilado
scripts/              Controles locales sin dependencias pagadas
worker/               Entrada Cloudflare/Vinext existente
```

Las futuras áreas de negocio se añadirán bajo `src/modules/` solo cuando una
etapa aprobada las implemente. No se crean carpetas vacías por anticipado.

## Ambientes

- `local`: desarrollo en una máquina local.
- `test`: ejecución automatizada de pruebas y CI.
- `development`: ambiente compartido de desarrollo, cuando exista.
- `staging`: validación previa a producción; exige `APP_URL`.
- `production`: ambiente productivo; exige `APP_URL`.

Esta etapa no aprovisiona ni despliega ninguno de esos ambientes.

## Integración continua

El workflow de GitHub Actions se ejecuta en pull requests y en cambios de
`main`. Inicia PostgreSQL 17 como servicio temporal, crea los roles locales,
aplica migraciones, carga datos ficticios, ejecuta `pnpm test:db`,
`pnpm verify`, `pnpm test:auth`, `pnpm test:admin`, `pnpm test:client`,
`pnpm test:operations`, los E2E de autenticación, administración, cliente y
operaciones, y el audit de dependencias.
No despliega, no conecta una base persistente y no utiliza secretos
productivos.

## Prueba PostgreSQL local

PowerShell:

```powershell
Copy-Item .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm test:db
```

`db:reset` comprueba que `APP_ENV` sea `local` o `test`, que el host sea local
y que el nombre de la base termine en `_test`, `_local` o `_dev`. `db:clean`
elimina solamente el volumen declarado por `compose.yaml`.

El rol `nexi_app` no es propietario de tablas y no posee `SUPERUSER`,
`CREATEDB`, `CREATEROLE` ni `BYPASSRLS`. El contexto usa variables PostgreSQL
locales a la transacción; no existe un endpoint público para elegir tenant.

La migración `0009_sites_requests_support` extiende el esquema aprobado con
sitios operables, solicitudes de eliminación y dominio, registro de dominios,
conversaciones, mensajes, participantes y outbox. Incluye constraints, índices,
triggers, funciones acotadas y RLS, además de un rollback probado.

La migración `0010_templates_content_publication` agrega registro y versiones
de plantillas, asignación por sitio, un borrador activo, snapshots publicados
inmutables y el puntero público. Usa JSONB únicamente para `restaurant.v1`
validado; las relaciones centrales siguen siendo relacionales y protegidas por
RLS.

## Usuarios sintéticos locales

Después de aplicar las migraciones y cargar el seed, prepara el back office
únicamente en `local` o `test`:

```powershell
pnpm admin:seed-local
```

Define las identidades ficticias en el archivo ignorado `.env.local` mediante
`AUTH_TEST_IDENTITIES`. El seed incluye clientes ficticios con una empresa,
varias empresas, empresa suspendida y membresía desactivada, además de planes y
sitios sintéticos. La identidad administrativa debe usar la audiencia
`nexi_admin`, rol de plataforma `nexi_admin` y un secreto TOTP sintético. No
copies contraseñas, tokens ni secretos reales al repositorio. El acceso interno
queda en `/nexi-interno/ingresar`; el acceso cliente reutiliza `/ingresar`.

El seed de la Etapa 7B agrega sitios activos y en preparación, una solicitud de
eliminación, una solicitud de dominio, un dominio registrado, conversaciones
abiertas/cerradas, mensajes de ambos roles, no leídos y outbox sintético.

El seed de 8A añade una plantilla de restaurante activa, contenidos ficticios
separados para tenants A y B, un sitio publicado, un borrador distinto de la
publicación, un sitio sin publicación y un sitio suspendido.

Rutas del panel cliente:

- `/cuenta`: resumen de la empresa activa.
- `/cuenta/sitios`: sitios asignados y acceso a sus operaciones permitidas.
- `/cuenta/sitios/[siteId]`: detalle, editor estructurado, publicación,
  historial, solicitudes de eliminación y dominio.
- `/cuenta/sitios/[siteId]/preview`: preview autenticada del borrador y
  `noindex`.
- `/cuenta/plan`: plan asignado en consulta.
- `/cuenta/datos`: edición acotada de perfil personal y empresarial.
- `/cuenta/mensajes`: conversaciones internas y contador de no leídos.
- `/cuenta/mensajes/[conversationId]`: historial, respuesta y estado.
- `/seleccionar-empresa`: selección o cambio seguro de empresa.

Rutas públicas:

- `/`: landing de nexi o sitio resuelto por hostname registrado.
- `/sitios/[siteSlug]`: alternativa exclusiva de local y CI.

El Administrador nexi asigna una plantilla e inicializa el borrador. El Cliente
Administrador guarda con revisión optimista, revisa la preview y publica. Cada
publicación crea un snapshot; restaurar crea otro y nunca modifica el historial.

```powershell
pnpm test:content
pnpm test:content-e2e
```

## Preparación obligatoria para staging

Antes de habilitar un ambiente compartido:

1. Crear un proyecto Supabase Auth sin reutilizar credenciales locales.
2. Configurar `APP_URL`, las tres variables `SUPABASE_*` y un
   `AUTH_SECURITY_PEPPER` gestionado fuera del repositorio.
3. Personalizar la plantilla de invitación y sus redirecciones para el flujo
   server-side de nexi; alinear su vencimiento con
   `AUTH_INVITATION_TTL_SECONDS`.
4. Inscribir y comprobar TOTP real para los Administradores nexi.
5. Probar recuperación, invalidación de sesiones, invitaciones y correo en el
   proveedor real.
6. Definir retención operativa de invitaciones, sesiones, auditoría, outbox y
   tenants. Los mensajes internos no caducan.
7. Ejecutar el workflow real de CI y `pnpm security:audit` con acceso al
   registro autorizado.
8. Probar el build desde un workspace no sincronizado o directamente en
   staging para confirmar CSS, JavaScript y navegación responsive.

## Solución de problemas

- **Versión incorrecta de Node o pnpm:** revisa `.nvmrc`, `package.json` y
  ejecuta nuevamente la instalación.
- **Configuración inválida:** compara `.env.local` con `.env.example`; el error
  indica la variable afectada sin mostrar su contenido.
- **Artefactos locales inconsistentes:** elimina solo `dist/`, `.vinext/` y
  `.wrangler/`, que son ignorados y regenerables, y vuelve a ejecutar el build.
- **Puerto ocupado:** detén el proceso anterior o configura el puerto mediante
  las opciones admitidas por Vinext.
- **Docker no está disponible:** instala o inicia Docker antes de ejecutar
  `db:up`; las validaciones de la landing continúan funcionando sin PostgreSQL.
- **`nexi_app` no conecta:** ejecuta `pnpm db:up` o
  `pnpm db:bootstrap` antes de migrar.
- **Migración modificada:** no edites una migración ya aplicada; crea una nueva.
- **Build sin CSS/JavaScript dentro de OneDrive:** en Windows,
  `dist/client/assets` puede aparecer como `ReparsePoint` y Vinext `0.0.50` no
  incluirlo en su caché estática. El build conserva los archivos; valida
  `pnpm start` desde una carpeta local no sincronizada o en staging.

## Límites de esta etapa

- El adaptador Supabase está implementado pero todavía no conectado a un
  proyecto real.
- La resolución pública por dominio registrado y verificado existe; la
  contratación, DNS y certificados continúan fuera de la plataforma.
- El panel interno cubre clientes, invitaciones, membresías, auditoría, sitios,
  solicitudes de eliminación y dominio, y soporte.
- El panel cliente incluye un editor estructurado para `restaurant.v1`, pero no
  creación de sitios ni cambio de plantilla. La eliminación es una solicitud
  diferida; la ejecución archiva y nunca borra físicamente.
- Los dominios se registran, pero no se contratan ni configuran por DNS.
- La mensajería es interna; no hay correo ni WhatsApp real.
- Sin Flow o cobros implementados; Flow pertenece al roadmap B1, separado de
  esta descripción del runtime actual.
- Multimedia habilitada solo en local/CI para imágenes JPEG, PNG y WebP.
- Sin proveedor multimedia productivo. Gym existe solo en catálogo y preview
  privados; selección, editor, publicación, restauración, onboarding y
  resolución pública siguen bloqueados. Colegio, Tienda Online, RestApp y
  PosApp no están implementados.
- Sin despliegue automático.

El alcance futuro y su orden Alfa/Beta/B1 se rigen por
[`docs/contrato-producto-b1.md`](../docs/contrato-producto-b1.md); este README
describe exclusivamente las capacidades ejecutables actuales.

El cierre técnico, las pruebas y la deuda aceptada se documentan en
[`docs/etapa-7b-sitios-solicitudes-mensajeria.md`](../docs/etapa-7b-sitios-solicitudes-mensajeria.md).
La Etapa 8A se documenta en
[`docs/etapa-8a-plantillas-contenido-editor.md`](../docs/etapa-8a-plantillas-contenido-editor.md).

## Multimedia local y plantillas

La Etapa 8B funciona únicamente con `APP_ENV=local|test`. `local` queda
bloqueado en staging/production y no hay proveedor productivo conectado.

```powershell
pnpm db:up
pnpm db:seed
pnpm media:seed
pnpm media:serve
```

La raíz local predeterminada está en el temporal seguro del sistema. No
configures OneDrive, el repositorio ni `public/`.

Comandos:

- `pnpm media:status`: estado del almacenamiento sintético.
- `pnpm media:clean-test`: limpia solo una raíz marcada en local/test.
- `pnpm test:media`: storage, formatos, privacidad, RLS, cuotas y upload.
- `pnpm test:media-seed`: precondiciones, rollback e idempotencia del seed.
- `pnpm test:templates`: `restaurant.v2`, catálogo y cambio.
- `pnpm test:media-e2e`: flujo HTTP completo.
- `pnpm test:prepare-base`: restaura la base sintética canónica.
- `pnpm test:prepare-media`: restaura la base y carga multimedia atómicamente.

Rutas:

- Cliente: `/cuenta/sitios/{siteId}/multimedia` y `/plantillas`.
- Admin nexi: `/nexi-interno/sitios/{siteId}/multimedia` y previews privadas
  en `/nexi-interno/sitios/{siteId}/plantillas/{templateVersionId}/preview`.
- Privada: `/api/media/private/{assetId}/{variant}`.
- Pública: `/media/{assetId}/{variant}/{checksum}`.

`sharp` se ejecuta en Node local/CI, fuera del bundle de Cloudflare Workers.
R2 es una recomendación futura no aprovisionada. Detalle:
[`docs/etapa-8b-multimedia-plantillas.md`](../docs/etapa-8b-multimedia-plantillas.md).

## Onboarding operativo local/CI

La Etapa 9A agrega `/comenzar`, `/nexi-interno/onboarding` y
`/cuenta/incorporacion`. El formulario público no crea recursos operativos; el
Administrador nexi con AAL2 revisa y convierte, y el Cliente Administrador
completa `restaurant_onboarding.v1`. La aprobación queda vinculada a revisión,
plantilla y checksum antes de reutilizar la publicación existente.

Actualmente existen tres plantillas operativas de restaurante en local/CI:
Classic, Modern y Restaurante Editorial. Las tres admiten preview, selección,
publicación, restauración y onboarding sobre los contratos vigentes.

El cierre integral, la evidencia de seguridad y el mapa de revisión del PR #4
están en
[`docs/etapa-9b-cierre-restaurante-editorial.md`](../docs/etapa-9b-cierre-restaurante-editorial.md).
Staging, producción y proveedores productivos continúan sin habilitar.

Variables no secretas:

- `ONBOARDING_PUBLIC_FORM_ENABLED`;
- `ONBOARDING_PUBLIC_RATE_LIMIT`;
- `ONBOARDING_MAX_NOTES_LENGTH`;
- `ONBOARDING_SUPPORTED_INDUSTRIES` (solo `restaurant` en 9A).

Comandos:

- `pnpm onboarding:seed`: crea 5 solicitudes y 8 casos ficticios;
- `pnpm onboarding:status`: muestra solo escenarios sintéticos 9A;
- `pnpm onboarding:reset-test`: elimina únicamente esos escenarios y se niega
  fuera de una base local/test segura;
- `pnpm test:onboarding`: validación unitaria e integración completa;
- `pnpm test:onboarding-e2e`: build y flujo HTTP completo.

No hay contraseñas fijas para clientes de onboarding. Las pruebas generan
identidades y claves efímeras. No se conectan Supabase, correo, WhatsApp, Flow,
DNS ni almacenamiento productivo. Detalle:
[`docs/etapa-9a-onboarding-operativo.md`](../docs/etapa-9a-onboarding-operativo.md).

La evidencia de preparación del Pull Request #3 y las condiciones pendientes
están versionadas respectivamente en
[`docs/informe-preparacion-merge-pr-3.md`](../docs/informe-preparacion-merge-pr-3.md)
y [`docs/deuda-tecnica.md`](../docs/deuda-tecnica.md).
