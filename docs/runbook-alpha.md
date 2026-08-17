# Runbook del entorno Alpha

Este runbook prepara y opera un entorno no productivo. No autoriza despliegue,
gasto, datos comerciales ni pilotos externos.

## 1. Acciones requeridas del Product Owner

### Acción 1 — Proyecto Supabase Free

1. **Proveedor:** Supabase.
2. **Página oficial:** <https://supabase.com/dashboard>.
3. **Cuenta/recurso:** organización Free y un proyecto nuevo.
4. **Nombre recomendado:** `nexi-alpha`.
5. **Región:** South America (São Paulo), `sa-east-1`, por cercanía a Chile.
6. **Plan:** Free, USD 0.
7. **Activar:** email/password, TOTP, confirmación de correo y URLs de redirect
   exactas del futuro `workers.dev`.
8. **Desactivar:** signup público, proveedores sociales, autoconfirm, add-ons,
   custom domain, IPv4 dedicado, PITR y cualquier upgrade.
9. **Tarjeta:** no debe ingresarse. Si el flujo la solicita, cancelar y
   reportar antes de continuar.
10. **Recuperar:** project URL, publishable key, secret key, project ref,
    contraseña DB y conexiones direct/pooler.
11. **Variables:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
    `SUPABASE_SECRET_KEY`, `DATABASE_ADMIN_URL` y, después de provisionar roles,
    `DATABASE_MIGRATION_URL`/`DATABASE_URL`.
12. **Entrega segura:** escribirlas localmente en `site/.env.alpha`, archivo ya
    ignorado por Git; Codex puede verificar nombres/presencia sin imprimirlos.
13. **No compartir:** claves, URLs con contraseña, DB password, tokens ni
    screenshots que los muestren.
14. **Confirmación:** dashboard muestra Free, región São Paulo, sin método de
    pago/add-ons; `pnpm alpha:preflight` aprueba tras completar las demás
    acciones.

Crear además un bucket privado `nexi-alpha-media`, límite 10 MB y MIME
`image/webp`. No hacerlo público. El nombre corresponde a
`MEDIA_SUPABASE_BUCKET`.

### Acción 2 — Cloudflare Workers Free

1. **Proveedor:** Cloudflare.
2. **Página oficial:** <https://dash.cloudflare.com/>.
3. **Cuenta/recurso:** cuenta Workers Free y subdominio `workers.dev`.
4. **Nombre recomendado:** Worker `nexi-alpha`.
5. **Región:** red global; PostgreSQL permanece en São Paulo.
6. **Plan:** Workers Free + Hyperdrive Free.
7. **Activar:** Workers Logs y una única configuración Hyperdrive hacia el
   pooler Supabase con el rol `nexi_app`, creada o actualizada con query caching
   deshabilitado. La operación debe equivaler a
   `wrangler hyperdrive create ... --caching-disabled` o
   `wrangler hyperdrive update <ID> --caching-disabled`. No crear un segundo
   Hyperdrive cacheado.
8. **Desactivar:** Workers Paid, R2, Analytics pagado, dominio comercial y
   productos con billing.
9. **Tarjeta:** no. Si el dashboard la exige, detenerse.
10. **Recuperar:** Account ID, Hyperdrive ID y URL `workers.dev`; autenticar
    Wrangler por OAuth local o token de alcance mínimo.
11. **Variables:** `CLOUDFLARE_ACCOUNT_ID`,
    `CLOUDFLARE_HYPERDRIVE_ID`,
    `CLOUDFLARE_HYPERDRIVE_CACHING=disabled`, `APP_URL`; el token de alcance
    mínimo usado por el smoke queda solo en `CLOUDFLARE_API_TOKEN` local.
12. **Entrega segura:** iniciar sesión mediante `wrangler login` o guardar el
    token únicamente en `site/.env.alpha`; nunca pegarlo en chat.
13. **No compartir:** API token, secretos del Worker o connection string de
    Hyperdrive.
14. **Confirmación:** dashboard/API indica Free, Worker sin deployment previo,
    Hyperdrive asociado al rol restringido, `caching.disabled=true` y ningún
    producto facturable. `alpha:preflight` rechaza cualquier declaración
    distinta de `disabled`; `alpha:smoke` comprueba el estado real mediante la
    API de Cloudflare.

### Acción 3 — Correo de recuperación controlado

1. **Proveedor:** Resend.
2. **Página oficial:** <https://resend.com/signup>.
3. **Cuenta/recurso:** cuenta Free y credencial SMTP.
4. **Nombre recomendado:** `nexi-alpha-auth`.
5. **Región:** automática en Free; no contratar multi-region.
6. **Plan:** Free, 3.000 mensajes/mes y 100/día.
7. **Activar:** solo correo transaccional Auth; SPF/DKIM/DMARC cuando exista un
   dominio autorizado.
8. **Desactivar:** marketing, automations, overage y planes pagados.
9. **Tarjeta:** no.
10. **Recuperar:** host, puerto, usuario y password SMTP.
11. **Variables:** se guardan en Supabase Auth SMTP; no son variables de la
    aplicación nexi.
12. **Entrega segura:** configurar directamente en el dashboard Supabase o en
    un gestor local; no entregar el password por chat.
13. **No compartir:** SMTP password/API key ni DNS tokens.
14. **Confirmación:** invitación y recuperación llegan únicamente al correo de
    prueba controlado, con redirect exacto a nexi. Si aún no existe dominio,
    usar el SMTP Supabase solo con miembro del equipo y reconocer la limitación.

## 2. Archivo local de ambiente

Crear `site/.env.alpha` a partir de nombres de `site/.env.example`. Debe incluir
también, sin valores ficticios:

```text
APP_ENV=alpha
ALPHA_RESOURCE_GUARD=nexi-alpha
ALPHA_DEPLOY_TARGET=cloudflare-workers
APP_COMMIT_SHA=<SHA exacto aprobado>
CLOUDFLARE_HYPERDRIVE_CACHING=disabled
ALPHA_SMOKE_EVIDENCE_FILE=<ruta absoluta fuera del repositorio>
ALPHA_APP_DB_PASSWORD=<secreto aleatorio de 32+ caracteres>
ALPHA_MIGRATOR_DB_PASSWORD=<secreto distinto de 32+ caracteres>
ALPHA_BACKUP_DIRECTORY=<ruta absoluta fuera del repositorio>
```

Eliminar `TEST_DATABASE_URL`. Todas las URLs PostgreSQL deben incluir
`sslmode=require` o un modo más estricto. Nunca ejecutar con `CI=true`.

## 3. Secuencia de aprovisionamiento

Desde `site/`, con Node 24.14.0 y pnpm 11.9.0:

```text
pnpm alpha:preflight
pnpm alpha:db:provision
pnpm alpha:db:migrate
pnpm alpha:db:status
pnpm alpha:db:check
pnpm alpha:build
```

Antes del deploy, cargar en Cloudflare con `wrangler secret put`:

- `AUTH_SECURITY_PEPPER`;
- `SUPABASE_PUBLISHABLE_KEY`;
- `SUPABASE_SECRET_KEY`.

No desplegar `DATABASE_ADMIN_URL`, `DATABASE_MIGRATION_URL`, `DATABASE_URL` ni
contraseñas de roles. Hyperdrive entrega la conexión web.

El deploy se ejecuta únicamente tras revisión del artefacto y autorización
explícita. Después:

```text
pnpm alpha:smoke
pnpm alpha:backup
```

`ALPHA_SMOKE_EVIDENCE_FILE` debe apuntar a un JSON efímero fuera del
repositorio, capturado contra el SHA exacto mediante el recorrido E2E real y
Workers Logs. Debe contener las seis rutas `authentication`, `client-panel`,
`content-edit`, `preview`, `publication` y `public-resolution`, con HTTP
correcto, `outcome=ok`, `throttled=false` y CPU no superior al límite Free
vigente de 10 ms. Debe acreditar además: lectura inmediata del contenido recién
escrito, rechazo de una sesión revocada y rechazo de permisos revocados. El
script falla cerrado ante ruta ausente, SHA distinto, lectura obsoleta,
revocación inefectiva, `exceededCpu`, throttling o CPU superior al límite. El
archivo es evidencia operacional temporal y no se versiona.

Para validar el archivo, definir `ALPHA_BACKUP_FILE` con la ruta generada y
ejecutar `pnpm alpha:backup:verify`.

## 4. Go/no-go

Go solo si preflight, migraciones, rol/RLS, SHA/health, Supabase Auth, objeto de
prueba write/read/delete, backup y restauración aislada aprueban. Hyperdrive
debe reportar caching deshabilitado. El primer deployment debe demostrar con
tráfico real que autenticación, panel, edición, preview, publicación y
resolución pública Restaurant respetan read-after-write, rechazan sesiones y
permisos revocados, no exceden 10 ms CPU por request y no presentan outcome
`exceededCpu`, error 1102 ni throttling. Deben existir cero secretos en Git y
cero acceso CI a Alpha.

No-go ante tarjeta, plan no Free, role superuser/bypass RLS, caché Hyperdrive
activo o no verificable, lectura obsoleta, revocación inefectiva, HTTP, storage
público, SMTP abierto, error de migración, mismatch de SHA, CPU/throttling fuera
del presupuesto Free o procesamiento de medios no conectado. Si Workers Free
falla esta puerta, reevaluar el runtime sin sustituir PostgreSQL, RLS, Supabase
Auth, Storage ni contratos de dominio.

## 5. Rollback y recuperación

- Aplicación: conservar versión Worker anterior y promoverla mediante rollback
  del proveedor; no reescribir historial Git.
- Base: preferir forward fix. El DOWN 0016 solo aprueba sin referencias
  Supabase y nunca borra objetos.
- Objetos: bucket privado no se elimina durante rollback; comparar referencias
  DB antes de archivar o borrar.
- Backup: conservar dump custom + SHA-256 cifrados fuera del repositorio;
  restaurar primero en una base aislada y repetir `db:check`/RLS.
- Identidad: revocar sesiones nexi y credenciales Supabase afectadas; rotar
  secrets en dashboard, nunca por commit.
- Incidente: detener nuevos accesos, conservar logs/correlation IDs, evaluar
  alcance por tenant y documentar la decisión humana.
