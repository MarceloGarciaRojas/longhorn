# Etapa 10B.1 — Entorno Alfa mínimo e infraestructura persistente

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Fecha de consulta de proveedores:** 2026-08-17
- **Base exacta:** `a4e1596e7d3aa8113f1d52b6b2ee48f7db3dbeaa`
- **Rama:** `codex/etapa-10b1-entorno-alfa`
- **Estado:** LISTO PARA APROVISIONAR; no desplegado

## 1. Resultado

El repositorio ya diferencia `local`, `test/CI` y `alpha`. Alpha falla cerrado
si intenta usar identidad sintética, HTTP, storage local, credenciales de test,
roles PostgreSQL incorrectos, conexiones sin TLS o ejecución desde CI.

El stack mínimo seleccionado es Cloudflare Workers Free + Hyperdrive para la
aplicación, y un único proyecto Supabase Free en São Paulo para PostgreSQL,
Auth y el bucket privado de objetos. Esta composición preserva PostgreSQL, el
adaptador de identidad, las sesiones opacas, RLS y la abstracción multimedia.

No se aprovisionó ni desplegó nada. Faltan cuentas, recursos y secretos reales.
El procesamiento de imágenes con `sharp` continúa bloqueado en Alpha: esta
etapa conecta el contrato de persistencia y lectura, pero no finge que el
proceso Node local funciona dentro de un Worker. Ese enlace es el siguiente
incremento técnico.

## 2. Precondición comprobada

PR #12 estaba `MERGED`; `origin/main` y `main` coincidían en la base indicada.
La CI post-merge `31993293606` terminó en `SUCCESS`. La rama se creó desde esa
base con worktree limpio. No se reutilizó una rama anterior.

## 3. Proveedores evaluados

| Capacidad/opción | Plan y límites oficiales vigentes | Costo Alfa | Riesgo/decisión |
| --- | --- | ---: | --- |
| Cloudflare Workers + Hyperdrive | Free: 100.000 requests/día, 10 ms CPU/request, 128 MB; Hyperdrive 100.000 consultas/día; URL `workers.dev` | USD 0 | **Seleccionado.** Coincide con Vinext y `pg`; exceder cuota Free bloquea, no genera overage. |
| Vercel Hobby | 1 M invocaciones/mes, pero restringido oficialmente a uso personal no comercial | USD 0 | Descartado para un SaaS B2B; Pro parte en USD 20 y habilita consumo facturable. |
| Supabase Free | 2 proyectos activos; 500 MB DB, 50.000 MAU, 1 GB Storage, 5 GB egress; pausa por baja actividad tras aproximadamente 7 días | USD 0 | **Seleccionado** para PostgreSQL, Auth y Storage. La pausa y ausencia de backups accesibles son riesgos operacionales aceptables solo para Alfa controlada. |
| Neon Free | PostgreSQL portable y scale-to-zero | USD 0 | Alternativa de base, descartada porque añadiría otro proveedor sin reemplazar Auth ni Storage. |
| Cloudflare R2 Standard | Free: 10 GB-mes, 1 M operaciones A y 10 M B/mes, egress sin cargo | USD 0 dentro de cuota | Diferido. Requiere activar una suscripción mediante checkout y puede exigir medio de pago; no se justifica frente al Storage ya incluido en Supabase. |
| Supabase Storage Free | 1 GB; tamaño global máximo 50 MB; bucket y MIME configurables | Incluido | **Seleccionado.** nexi limita uploads a 10 MB y sirve objetos a través de autorización propia. |
| Supabase SMTP por defecto | Solo direcciones autorizadas del equipo, 2 mensajes/hora, sin SLA | Incluido | Útil únicamente para verificación técnica controlada. No apto para pilotos externos. |
| Resend Free | 3.000 correos/mes y 100/día; un dominio | USD 0 | Seleccionado como opción de SMTP para recuperación/invitaciones antes de incorporar un Cliente Administrador externo; no se configuró todavía. |

Fuentes oficiales consultadas:

- [Cloudflare Workers: límites](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers: precios](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Hyperdrive: precios](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
- [Cloudflare Hyperdrive con PostgreSQL/pg](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Cloudflare R2: precios](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2: activación](https://developers.cloudflare.com/r2/get-started/)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Supabase: precios](https://supabase.com/pricing)
- [Supabase: facturación y cuotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase: pausa de proyectos Free](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase: regiones](https://supabase.com/docs/guides/platform/regions)
- [Supabase: conexiones PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Storage: límites](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Supabase Auth: SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend: precios](https://resend.com/docs/knowledge-base/what-is-resend-pricing)
- [Neon: precios](https://neon.com/pricing)

Las páginas oficiales no prometen que todo alta Free omita siempre un medio de
pago. La regla operacional es: seleccionar solo Free y cancelar/reportar si el
dashboard solicita tarjeta o checkout con posibilidad de cobro.

## 4. Arquitectura Alfa seleccionada

```text
Browser
  -> HTTPS workers.dev
  -> nexi / Vinext / Cloudflare Worker
       -> Supabase Auth HTTP (identidad solamente)
       -> sesión opaca nexi
       -> Hyperdrive -> Supabase PostgreSQL / nexi_app / RLS
       -> Supabase Storage privado mediante adaptador server-side
  Operador local autorizado
       -> nexi_migrator -> migraciones versionadas
       -> pg_dump -> backup fuera del repositorio
```

El Worker nunca recibe `tenant_id` como autoridad. Sesiones, membresías,
audiencia, tenant activo, AAL2, auditoría y revocación siguen perteneciendo a
nexi. La clave server-side de Supabase no llega al navegador. El bucket es
privado y las rutas de objeto mantienen el prefijo
`tenant/site/asset/checksum/variant` validado.

## 5. Cambios ejecutables

- `alpha` se agregó al contrato ambiental y utiliza HTTPS/cookies `__Host-`.
- `AUTH_PROVIDER=test` y el pepper local son rechazados en Alpha.
- onboarding público continúa desactivado en Alpha.
- storage local es rechazado; Alpha exige Supabase Storage.
- el adaptador Supabase implementa put/read/head/exists/delete sin SDK y sin
  exponer la clave en URL o logs.
- la migración 0016 amplía exclusivamente el proveedor de objetos a
  `supabase`; su DOWN falla cerrado si quedan referencias.
- la conexión web Alfa obtiene la URL dinámica de Hyperdrive; operaciones
  locales continúan usando `DATABASE_URL`.
- URLs operacionales Alfa exigen TLS, host remoto y roles `nexi_app`/
  `nexi_migrator`.
- bootstrap y seeds sintéticos quedaron bloqueados fuera de local/test.
- se agregaron preflight, provisionamiento de roles, migración/status/check,
  build, smoke, backup y verificación de archivo.
- el build declara observabilidad Cloudflare, Hyperdrive, variables no
  secretas y nombres de secretos requeridos; no materializa secretos.

## 6. Ambientes y secretos

| Ambiente | Identidad | PostgreSQL | Multimedia | Red externa |
| --- | --- | --- | --- | --- |
| local | `test` | Docker loopback | proceso Node loopback + filesystem temporal seguro | No requerida |
| test/CI | `test` | PostgreSQL efímero de CI | filesystem temporal | CI no carga `.env.alpha`; no puede ejecutar preflight Alpha |
| alpha | Supabase | Supabase + Hyperdrive; roles separados | bucket Supabase privado; procesamiento aún bloqueado | Solo recursos Alpha |

`.env.alpha` está cubierto por `.gitignore`. No debe copiarse a issue, PR,
documentación o chat. El runtime recibe únicamente tres secretos declarados:
`AUTH_SECURITY_PEPPER`, `SUPABASE_PUBLISHABLE_KEY` y
`SUPABASE_SECRET_KEY`. Las URLs administrativas y contraseñas de roles son
solo para el puesto operador; no se despliegan al Worker.

## 7. Costos y continuidad

- Costo seleccionado actual: **USD 0 / CLP 0**, dentro de Free tiers.
- No se activó pay-as-you-go, tarjeta, add-on IPv4, PITR, custom domain,
  Workers Paid, R2 ni servicios productivos.
- Supabase Free puede pausar; el piloto debe aceptar reanudación manual y
  monitoreo de actividad.
- Al superar cuotas Free, el comportamiento esperado es restricción/pausa, no
  compra automática. Cualquier upgrade requiere nueva aprobación.
- Supabase Free no entrega la restauración operacional de los planes pagados.
  `alpha:backup` genera `pg_dump` custom fuera del repositorio y
  `alpha:backup:verify` valida su estructura. Antes del piloto debe ensayarse
  restauración en una base aislada.
- Workers Logs conserva hasta siete días; suficiente para Alfa, no para una
  auditoría regulatoria o producción.

## 8. Límites preservados

Restaurant Classic, Modern y Editorial no fueron rediseñados. Catálogo,
selección, editor, preview, publicación, restauración, resolución pública y
onboarding conservan sus contratos. Gym sigue limitado a catálogo/preview
privados. No se implementaron Flow, Tienda, RestApp, PosApp, Colegio, Gemini,
Google AI, Firebase, WhatsApp API, dominio comercial, staging o producción.

## 9. Validación local

La validación se ejecutó con Node 24.14.0, pnpm 11.9.0 y PostgreSQL 17 en
Docker. El resultado fue:

| Comprobación | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Aprobada; lockfile y patches sin cambios. |
| `pnpm verify` | Aprobada; 89 pruebas, 0 fallas, 0 errores lint y 6 advertencias heredadas `no-img-element`. |
| Migraciones + RLS | 8/8; incluye UP/DOWN fail-closed de 0016. |
| Auth / Admin / Client / Operations | 19/19, 14/14, 12/12 y 8/8. |
| Content / Media seed / Media / Templates / Onboarding | 38/38, 5/5, 12/12, 13/13 y 5/5. |
| E2E HTTP | 11/11 en siete suites; cada una con reset canónico. |
| `alpha:preflight` + `alpha:build` | Aprobados con configuración ficticia completa y SHA de 40 caracteres. |
| Audit | Critical 0, High 0, Moderate 0, Low 0. |
| Secretos / Markdown / archivos grandes | 319 archivos escaneados, enlaces locales válidos y sin archivos nuevos mayores a 5 MiB. |
| `git diff --check` | Aprobado. |

Los valores ficticios usados en preflight/build no se guardaron en archivos.
No hubo conexiones a recursos Alpha ni despliegue.

## 10. Riesgos reales

1. **Alto — procesamiento multimedia:** `sharp` sigue siendo Node-only; el
   upload Alfa falla cerrado hasta incorporar un procesador persistente que use
   el nuevo adaptador.
2. **Alto — backup Free:** no hay backup administrado accesible; el dump y el
   restore rehearsal son puertas humanas antes de datos piloto.
3. **Medio — pausa Supabase:** baja actividad puede suspender temporalmente el
   proyecto Free.
4. **Medio — SMTP:** el servidor por defecto solo sirve la cuenta controlada;
   Resend/dominio debe quedar operativo antes de invitar personas externas.
5. **Medio — límites Worker:** 10 ms CPU por request y 100.000 requests/día
   requieren smoke y observación; no se procesan imágenes dentro del Worker.

## 11. Siguiente incremento único

**Conectar y verificar el procesador multimedia Node de Alpha con Supabase
Storage, incluyendo write/read/delete real, aislamiento cross-tenant y E2E
Restaurant edición → multimedia → preview → publicación.**

No se inicia sin autorización del Product Owner.
