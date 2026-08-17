# Informe integral de avance — Proyecto Longhorn / nexi

- **Fecha de corte:** 16 de agosto de 2026, hora de Chile
- **Línea base remota:** `origin/main`
- **Último merge:** Pull Request #10
- **Commit de `main` al corte:** `c04a482d0e8aaa5b4f0d0400277e29b812465128`
- **Propósito:** memoria persistente para planificación y continuidad técnica
- **Estado del documento:** fotografía verificable; no autoriza una etapa nueva

## 1. Resumen ejecutivo

Longhorn ya no es solamente un prototipo visual. Existe una aplicación SaaS
multi-tenant ejecutable en local y CI, con monolito modular, persistencia
PostgreSQL, Row Level Security, autenticación desacoplada, sesiones opacas,
back office, panel de Cliente Administrador, operación de sitios, contenido
estructurado, publicaciones inmutables, multimedia, mensajería interna y
onboarding.

La marca visible es **nexi**; Longhorn permanece como nombre interno.

- Restaurante está funcionalmente implementado en local y CI.
- Existen tres plantillas operativas de Restaurante: Classic, Modern y
  Restaurante Editorial.
- Restaurante dispone de catálogo, preview, selección, edición, multimedia,
  publicación, restauración, resolución pública y onboarding.
- El núcleo reconoce de forma cerrada `restaurant` y `gym`.
- Gimnasio tiene `gym.v1`, renderer `gym-pulso-v1`, una plantilla Pulso Club y
  preview privado.
- Gimnasio no tiene selección, publicación, restauración, editor, onboarding
  ni resolución pública.
- No existe staging ni producción.
- Supabase Auth productivo, object storage, CDN, backups, DNS, correo, Flow y
  observabilidad productiva no están conectados.
- No existen cobros ni suscripciones reales.
- El audit asociado al SHA final del PR #10 informó 0 vulnerabilidades.

## 2. Alerta vigente: CI roja en `main`

Después de integrar el PR #10, GitHub Actions ejecutó el workflow sobre:

- SHA: `c04a482d0e8aaa5b4f0d0400277e29b812465128`;
- run: `31988199583`;
- resultado: `FAILURE`.

La ejecución aprobó instalación congelada, roles PostgreSQL, migraciones,
seeds, RLS, `pnpm verify`, autenticación, paneles, operaciones, contenido,
multimedia de integración, plantillas, onboarding de integración y los E2E de
autenticación, administración, cliente, operaciones y contenido.

Falló en `Verify multimedia and template flows end to end` con:

```text
Error: media service did not start
```

El E2E multimedia terminó 0/2. Los pasos posteriores de onboarding E2E y audit
se omitieron por el corte; la limpieza final sí aprobó. La CI del PR sobre el
SHA `6b49349a2683ea76a476b33fa6d610ad76aa68fe` había aprobado. Por ello el
fallo puede ser ambiental o una condición de carrera, pero no debe declararse
transitorio sin reproducirlo.

**Regla de planificación:** no iniciar una etapa funcional nueva hasta recuperar
CI verde en `main`.

## 3. Identidad y decisiones de producto

- Nombre interno: Longhorn.
- Marca comercial: nexi.
- Modelo: SaaS B2B multi-tenant para pymes.
- Una aplicación compartida atiende múltiples empresas.
- El contenido permanece separado del diseño.
- El tenant nunca se acepta como autoridad desde el navegador.
- Roles iniciales: Administrador nexi, Cliente Administrador y Cliente Final.
- El alta V1 es híbrida.
- El Cliente Administrador puede entregar antecedentes mediante formulario o
  WhatsApp; WhatsApp no está integrado y el Administrador nexi registra la
  información en la plataforma.
- La solicitud de borrado tiene una espera configurada de 48 horas y termina
  en archivado, no en eliminación física inmediata.
- El cliente solicita dominio; nexi realiza contratación y operación fuera de
  la plataforma y registra el dominio en ella.
- Los dominios contratados serán propiedad de nexi.
- Los mensajes internos no caducan.
- Los planes iniciales son Esencial y Pro; alcance, descripción y valores
  definitivos siguen pendientes.
- Flow es la pasarela preferida para una etapa futura de pagos V1.

## 4. Estado Git y gobierno

- `origin/main`: `c04a482d0e8aaa5b4f0d0400277e29b812465128`.
- PR #10: integrado.
- PR abiertos al corte: 0.
- Deployments del incremento: 0.
- Rama de trabajo al corte: `codex/etapa-10a5-registro-preview-pulso`.
- Worktree al corte: limpio antes de crear este documento.
- El puntero local `main` estaba desactualizado respecto de `origin/main` y
  debe sincronizarse de forma controlada antes de abrir la próxima rama.

Pull Requests principales:

| PR | Incremento |
| --- | --- |
| #3 | Consolidación funcional/documental hasta 9A |
| #4 | Restaurante Editorial y cierre 9B |
| #5 | Contrato autorizado para Gimnasio |
| #6 | Generalización Restaurant + Gym |
| #7 | Contrato y persistencia `gym.v1` |
| #8 | Renderer aislado Pulso Club |
| #9 | Remediación de `nanoid` |
| #10 | Registro, catálogo y preview privado Pulso Club |

## 5. Arquitectura y stack

La arquitectura es un monolito modular TypeScript con frontend y backend en la
misma aplicación, PostgreSQL como fuente transaccional y proveedores externos
desacoplados.

| Área | Tecnología |
| --- | --- |
| Lenguaje | TypeScript 5.9.3 |
| UI | React 19.2.8 |
| Rutas/API | Next.js 16.2.11, App Router |
| Build/runtime | Vinext 0.0.50 y Vite 8.0.16 |
| Persistencia | PostgreSQL 17 |
| Driver | `pg` 8.22.0 |
| Multimedia | Sharp 0.35.0 |
| Pruebas | Node Test Runner y TSX |
| Paquetes | pnpm 11.9.0 |
| Node | 24.14.0 |
| CI | GitHub Actions |
| Desarrollo DB | Docker Compose |
| Despliegue real | Inexistente |

El runtime productivo depende solamente de `next`, `react`, `react-dom`, `pg`,
`server-only` y `sharp`. Existen patches reproducibles para
`minimatch@3.1.5` y `vinext@0.0.50`, además de overrides de seguridad.

## 6. Mapa del repositorio

- `docs/`: decisiones, cierres, contratos y deuda.
- `docs/adr/`: ADR-001 a ADR-012.
- `site/app/`: páginas, layouts y endpoints.
- `site/src/auth/`: identidad, sesiones y recuperación.
- `site/src/admin/`: back office.
- `site/src/client-portal/`: panel cliente.
- `site/src/operations/`: sitios, dominios, borrado, soporte y outbox.
- `site/src/content/`: industrias, schemas, renderers y publicación.
- `site/src/media/`: biblioteca y manifests multimedia.
- `site/src/onboarding/`: solicitudes, casos y aprobación.
- `site/src/db/`: conexión y contexto transaccional.
- `site/src/tenancy/`: hostname y tenant público.
- `site/db/migrations/`: migraciones 0001–0015 con UP/DOWN.
- `site/scripts/`: DB, seeds, multimedia, onboarding y secretos.
- `site/tests/`: unitarias, integración, DB, renderizado y E2E.
- `.github/workflows/`: CI.
- `site/worker/`: entrada Cloudflare/Vinext existente.
- `plantillas/`: insumos ZIP ignorados por Git.

Volumen al corte:

- 304 archivos tracked;
- 58 páginas o endpoints App Router;
- 40 archivos de pruebas;
- 15 migraciones UP y 15 DOWN;
- 43 tablas;
- 92 declaraciones de políticas RLS;
- 37 habilitaciones de RLS;
- 60 declaraciones de triggers;
- 93 declaraciones de funciones SQL, incluyendo reemplazos versionados.

## 7. Avance por etapas

### Etapa 4 — Persistencia

PostgreSQL, roles técnicos, tenants, usuarios, membresías, contexto
transaccional, RLS, pruebas cross-tenant y migraciones reversibles.

### Etapa 5 — Autenticación

Proveedor desacoplado, adaptador Supabase, proveedor sintético local/CI,
sesiones opacas, revocación, selección segura de tenant, recuperación, rate
limiting, AAL2 y auditoría. Supabase real no está conectado.

### Etapa 6 — Administrador nexi

Dashboard, clientes, tenants draft, edición, estados, invitaciones,
membresías, auditoría, AAL2, idempotencia y doble autorización PostgreSQL.

### Etapa 7A — Cliente Administrador

Selector multiempresa, dashboard, sitios, plan de consulta, perfiles editables
y aislamiento entre empresas.

### Etapa 7B — Operaciones

Sitios, solicitudes de eliminación, espera 48 horas, archivado, solicitudes y
registro manual de dominio, soporte interno, mensajes inmutables sin
caducidad, no leídos, outbox sintético, auditoría e idempotencia. DNS, compra
de dominio, correo y WhatsApp real permanecen fuera.

### Etapa 8A — Contenido publicable

Plantillas, versiones, asignación, `restaurant.v1`, editor, borrador, revisión
optimista, preview, publicación inmutable, checksum, historial, restauración,
resolución pública y compatibilidad cerrada.

### Etapa 8B/8B.1 — Multimedia y `restaurant.v2`

Biblioteca multimedia aislada, cuotas, JPEG/PNG/WebP, rechazo SVG/GIF,
variantes, referencias explícitas, URLs privadas/públicas, segunda plantilla,
cambio controlado, seed transaccional y rollback. Solo local/CI.

### Etapa 9A — Onboarding

Formulario `/comenzar`, ingreso manual del Administrador nexi, solicitudes,
conversión transaccional, tenant, perfil, plan, sitio, subdominio sintético,
plantilla, checklist, respuestas, `restaurant_onboarding.v1`, transformación
a `restaurant.v2`, aprobación vinculada y publicación existente.

### Etapa 9B — Restaurante Editorial

Tercera plantilla Restaurante con catálogo, preview, selección, publicación,
restauración, onboarding y multimedia.

### Etapa 10A.1 — Contrato Gym

Contrato B1, estructura Gym, variantes `volt`, `studio`, `forge` y límites que
excluyen reservas, socios, asistencia y pagos.

### Etapa 10A.2 — Núcleo multirubro

`IndustryKey` cerrado a `restaurant|gym`, industria persistida y coherencia
industria/plantilla. Sin registro dinámico de rubros.

### Etapa 10A.3 — `gym.v1`

Schema estricto, clases, entrenadores, horarios parciales, redes, planes
informativos, multimedia y borradores Gym. Sin activación comercial.

### Etapa 10A.4 — Renderer Pulso Club

Renderer `gym-pulso-v1`, variantes visuales, accesibilidad, filtros efímeros,
horarios parciales y comportamiento responsive.

### Etapa 10A.5 — Catálogo y preview Gym

Registro cerrado, plantilla `gym-pulso`, migración 0015, catálogo y previews
privados, multimedia privada con audiencia correcta, resolución pública
bloqueada, rollback fail-closed, matriz visual 15/15 y seis casos defensivos.

## 8. Matriz funcional

| Capacidad | Restaurante | Gimnasio |
| --- | --- | --- |
| Industria | Sí | Sí |
| Schema | `restaurant.v1/v2` | `gym.v1` |
| Catálogo privado | 3 plantillas | 1 plantilla |
| Renderer | Sí | Sí |
| Preview cliente/admin | Sí | Sí |
| Selección | Sí | No |
| Editor | Sí | No |
| Publicación | Sí | No |
| Restauración | Sí | No |
| Onboarding | Sí | No |
| Resolución pública | Sí | No |
| Disponibilidad comercial | No autorizada | No autorizada |

## 9. Paneles

### Administrador nexi implementado

Login separado, AAL2, dashboard, clientes, tenants, invitaciones, membresías,
auditoría, sitios, eliminación, dominios, soporte, onboarding, multimedia y
previews.

Pendiente: landing no-code, administración comercial de planes, suscripciones,
facturación, Flow, DNS, compra de dominios, noticias/FAQ, métricas y proveedores
productivos.

### Cliente Administrador implementado

Login nexi, selector de empresa, Mis sitios, Mi plan, Mis datos, Mensajes,
solicitud de eliminación y dominio, editor/multimedia/plantillas Restaurante,
publicación/restauración Restaurante, onboarding Restaurante y preview Gym.

No puede crear sitios, cambiar industria, configurar DNS, comprar dominios,
ejecutar borrado físico, cambiar plan ni publicar Gym.

## 10. Persistencia

Dominios principales:

- identidad: usuarios, identidades, sesiones, recuperación, rate limits,
  auditoría, personal e invitaciones;
- empresas/planes: tenants, perfiles, planes, features y asignaciones;
- sitios: sitios, eliminación, solicitudes y registros de dominio;
- soporte: conversaciones, participantes, mensajes y outbox;
- contenido: plantillas, versiones, asignaciones, borradores y publicaciones;
- multimedia: assets, variantes y referencias;
- onboarding: intake, notas, casos, respuestas, checklist, aprobaciones e
  historial;
- transversal: auditoría e idempotencia de plataforma.

## 11. Seguridad

Implementado: RLS, contexto transaccional, rol web restringido, rechazo de
tenant del navegador, sesiones opacas, hashes, revocación, AAL2, audiencia,
validación server-side, origen, rate limiting, idempotencia, revisión
optimista, publicaciones y mensajes inmutables, auditoría, checksums, rechazo
cross-tenant/cross-industry, secret scan y recuperación de un solo uso.

Pendiente productivo: Supabase, TOTP y correo reales, rotación de secretos,
WAF, webhooks firmados, backups, restauración, monitorización, alertas, object
storage, CDN y gestión de incidentes.

## 12. Pruebas

El repositorio cubre unitarias, integración, PostgreSQL real, RLS, seguridad,
renderizado, E2E HTTP, migraciones, seeds, multimedia, onboarding, contenido,
plantillas, publicación y restauración.

Evidencia final previa al merge del PR #10:

- focalizadas 26/26;
- contenido 38/38;
- `pnpm verify` aprobado con 78 pruebas;
- lint 0 errores y 6 warnings heredados;
- TypeScript/build/secret scan aprobados;
- suites DB/funcionales 133 aprobadas;
- E2E contenido 2/2;
- audit 0 críticas, 0 altas, 0 moderadas y 0 bajas;
- CI del PR `SUCCESS`.

El estado posterior en `main` está descrito en la sección 2.

## 13. Ambientes y proveedores

Local/test dispone de PostgreSQL Docker, roles, migraciones, seeds, identidad
sintética, multimedia local y E2E. Development compartido, staging y
producción no existen.

| Proveedor | Estado |
| --- | --- |
| Supabase Auth | Adaptador; proyecto real no conectado |
| Flow | No implementado |
| Correo | No implementado |
| WhatsApp | Canal registrado, no integrado |
| Object storage | Local/CI; productivo pendiente |
| R2 | Recomendación, no aprovisionado |
| DNS/certificados | Manual/externo |
| CDN | No implementado |
| Observabilidad/backups | No implementados |

## 14. Planes, pagos, dominios y mensajería

Planes y features están modelados y existen seeds Esencial/Pro. El cliente
consulta su plan y el onboarding asigna uno. No hay precios finales, checkout,
tokenización, Flow, webhooks, conciliación, facturación, reintentos ni CRUD
comercial completo.

Existe una contradicción que planificación debe resolver: el contexto de
producto exige pagos en V1, mientras las reglas actuales dejan pagos fuera del
MVP inicial.

Los dominios se solicitan y registran con asociación, tipo, estado, principal,
verificación, fechas y notas. Compra, DNS, certificados, renovación y evidencia
legal de propiedad permanecen fuera.

La mensajería interna es fuente de verdad, inmutable y sin caducidad. Correo y
WhatsApp reales, retries, dead-letter y procesador productivo de outbox están
pendientes.

## 15. Deuda y riesgos

### Bloqueo operativo inmediato

- CI roja en `main` por arranque del servicio multimedia E2E.

### Riesgos altos

- autenticación productiva ausente;
- multimedia productiva ausente;
- backups/restauración/observabilidad ausentes;
- staging inexistente;
- pagos V1 sin contrato ejecutable;
- planes comerciales no cerrados.

### Riesgos medios

- Vinext 0.0.50 con patch;
- clasificación estática incompleta de rutas;
- comportamiento Windows/OneDrive;
- documentos raíz desactualizados;
- fuentes históricas no versionadas;
- posible carrera de readiness multimedia;
- landing no autogestionable.

### Riesgos bajos

- seis warnings `<img>`;
- nombre técnico `site-creator-vinext-starter`;
- estados históricos en documentos.

## 16. Desalineaciones documentales

1. El README raíz aún describe otros rubros como no implementados; Gym tiene
   implementación técnica parcial.
2. `docs/README.md` presenta 10A.5 como Draft aunque el PR #10 fue integrado.
3. El cierre 10A.5 no registra aún el SHA final, las dos correcciones
   post-review, el merge ni la CI roja posterior.
4. Los documentos fuente esperados no están versionados en `docs/fuentes/`,
   lo que limita la trazabilidad autónoma de visión, SRS, arquitectura,
   backlog, roadmap y modelo de negocio.

## 17. Recomendación inmediata

### Puerta 1: estabilizar `main`

1. Reproducir `media service did not start`.
2. Capturar el log del proceso `pnpm media:serve`.
3. Determinar si hay condición de carrera de readiness.
4. Repetir `test:media-e2e`.
5. Reejecutar CI completa.
6. Exigir `SUCCESS` en `main`.
7. No ocultar el fallo modificando pruebas.

### Puerta 2: cierre documental

- actualizar README e índice;
- registrar SHA y merge finales de 10A.5;
- documentar las correcciones post-review;
- incorporar el estado final de CI;
- inventariar o incorporar `docs/fuentes`;
- sincronizar el `main` local antes de una nueva rama.

### Orden estratégico sugerido

1. Estabilización de CI.
2. Cierre documental 10A.5.
3. Decisión de la siguiente capacidad Gym.
4. Definición V1 frente a MVP técnico.
5. Contrato de pagos Flow.
6. Plan de staging con costo cero/free tier.
7. Proveedores productivos mínimos.
8. Hardening y piloto.

## 18. Decisiones pendientes del Product Owner

1. Siguiente prioridad: Gym o staging.
2. Si continúa Gym: editor, selección u onboarding primero.
3. Momento de incorporación de Flow.
4. Pagos dentro del MVP o en una segunda fase V1.
5. Diferencias definitivas Esencial/Pro.
6. Autorización de Supabase free tier para staging.
7. Proveedor de medios para staging.
8. Continuidad de Vinext o evaluación de runtime Next.js estándar.
9. Política de backup, retención y restauración.
10. Momento de convertir la landing en contenido administrable.
11. Evidencia legal/operativa de dominios propiedad de nexi.
12. Incorporación de documentos fuente al repositorio.

## 19. Conclusión

Longhorn/nexi tiene una base SaaS multi-tenant técnicamente significativa y
coherente. PostgreSQL, RLS, sesiones opacas, servicios server-side, contenido
estructurado, publicación inmutable y proveedores desacoplados ofrecen una
buena base incremental.

Restaurante es la única vertical funcional completa, limitada a local y CI.
Gimnasio llega deliberadamente hasta catálogo y preview privado. La prioridad
inmediata no debe ser ampliar funcionalidad: primero debe recuperarse CI verde
en `main`, consolidarse la documentación 10A.5 y decidir formalmente entre
completar Gym, preparar staging o diseñar pagos V1.
