# Etapa 9B: cierre integral de Restaurante Editorial

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Etapa:** 9B-M
- **Fecha:** 2026-08-08
- **Estado:** **ETAPA 9B IMPLEMENTADA EN LOCAL Y CI**
- **Rama:** `codex/etapa-9b-tercera-plantilla`
- **Pull Request:** #4
- **Base funcional auditada:** `eb849cf5f44db9907fad646e1141ea8372a94185`
- **Base main:** `042261587df0bf8aeae04a49eea862d5de1e489b`

Este documento consolida la implementación y evidencia de la Etapa 9B. No
autoriza merge, staging, producción, proveedores productivos ni disponibilidad
comercial.

## 1. Objetivo y resultado

La Etapa 9B incorpora una tercera plantilla de restaurante reutilizable,
Restaurante Editorial, sin duplicar aplicaciones por tenant y sin crear un
segundo flujo de publicación. Editorial consume el contrato estructurado
`restaurant.v2` y las primitivas existentes de catálogo, preview, contenido,
multimedia, publicación, restauración y onboarding.

El catálogo local/CI contiene exactamente:

1. Classic;
2. Modern;
3. Restaurante Editorial.

| Plantilla | Preview | Selección | Publicación | Restauración | Onboarding |
| --- | --- | --- | --- | --- | --- |
| Classic | Sí | Sí | Sí | Sí | Sí |
| Modern | Sí | Sí | Sí | Sí | Sí |
| Restaurante Editorial | Sí | Sí | Sí | Sí | Sí |

### Estados diferenciados

- **Estado técnico:** tres plantillas de restaurante están operativas en local
  y CI; Restaurante Editorial admite preview, selección, publicación,
  restauración y onboarding.
- **Estado comercial:** la landing pública conserva la oferta anterior de dos
  plantillas y no anuncia Restaurante Editorial como disponibilidad comercial.
- **Estado ambiental:** staging, producción y proveedores productivos continúan
  sin autorización.

## 2. Desarrollo incremental

### 9B.1 — Contrato visual y técnico

Definió estructura editorial, contenido requerido y opcional, multimedia,
responsive, accesibilidad, renderer, catálogo, seguridad, publicación,
restauración y matriz de pruebas. El contrato quedó documentado antes de la
implementación.

### 9B.2 — Renderer aislado

Implementó el renderer Editorial y su CSS modular. El adaptador valida
`restaurant.v2`, resuelve únicamente medios presentes en el manifiesto interno
autorizado y rechaza schemas o contenido incompatibles. No contiene datos
comerciales fijos ni rutas de administración.

### 9B.3 — Registro, catálogo, seed y preview

Registró `restaurant-editorial-v1` en manifiesto y registry cerrados, añadió un
seed determinista e idempotente y habilitó preview privado para Cliente
Administrador y Administrador nexi. Los permisos, tenant y AAL2 se resuelven en
servidor.

### 9B.4 — Flujo operativo completo

Habilitó selección, publicación, restauración y onboarding mediante la política
centralizada de capacidades. La selección y el preview no publican. La
publicación concurrente produce una sola publicación efectiva, el replay es
idempotente y una revisión obsoleta se rechaza. Cambiar plantilla invalida una
aprobación vinculada previamente.

## 3. Arquitectura

- Renderer manifest explícito, inmutable y con rechazo de claves duplicadas.
- Registry cerrado sin fallback para renderers desconocidos.
- Contrato de contenido vigente: `restaurant.v2`, versión 2.
- Contrato de captura de onboarding vigente: `restaurant_onboarding.v1`.
- Catálogo con claves estables y orden Classic, Modern, Editorial.
- Una asignación lógica por sitio; ninguna plantilla se asigna automáticamente
  por incorporar Editorial.
- Publicación compartida mediante `publishContentTransaction`.
- Restauración desde publicaciones inmutables con template, contenido y snapshot
  multimedia históricos.
- Sin migraciones nuevas, `restaurant.v3` ni cambios de schema.

## 4. Seguridad multi-tenant

La implementación conserva RLS, contexto de tenant derivado en servidor,
membresías, roles, permisos y AAL2 administrativo. Las operaciones sensibles
filtran por tenant y sitio; los medios privados se resuelven mediante manifiestos
autorizados y referencias pertenecientes al mismo tenant/sitio.

Las pruebas niegan a Tenant A listar, previsualizar, seleccionar o manipular el
sitio de Tenant B. También cubren UUID ajenos, medios cruzados, publicación,
restauración y onboarding protegidos. Ocultar controles en la interfaz no se
utiliza como autorización.

## 5. Publicación, aprobación y restauración

La aprobación almacena revisión, versión de plantilla, schema y checksum. El
checksum incorpora sitio, revisión, template version, schema y contenido. Un
cambio de plantilla invalida aprobaciones pendientes o aprobadas y restablece el
caso al estado de preparación.

El onboarding reutiliza `publishContentTransaction`; no existe una segunda
implementación paralela. Se validaron los recorridos históricos:

- Classic → Editorial → restaurar Classic;
- Editorial → Modern → restaurar Editorial.

La restauración recupera template version y renderer, contenido estructurado,
referencias multimedia, snapshot histórico y puntero público.

## 6. Onboarding Editorial

El recorrido verificado es:

solicitud → conversión → selección explícita → `restaurant_onboarding.v1` →
`restaurant.v2` → preview → aprobación → publicación → verificación pública →
cierre.

El flujo conserva idempotencia, reanudación, checklist, aprobación vinculada,
publicación única y aislamiento. Classic y Modern mantienen su regresión.

## 7. Patches y dependencias

| Patch | SHA-256 | Finalidad |
| --- | --- | --- |
| `minimatch@3.1.5.patch` | `073A3811A63BCF556A5EE663CCF3FDE267D7077A6D2CC91C967541A2EFEC75E7` | Compatibilizar el override seguro de `brace-expansion`. |
| `vinext@0.0.50.patch` | `DD01875D40A90498F99BEA25EC0D5C33B7312E5C037AAE652E5E37B4B1657B52` | Eliminar `image-size` del grafo efectivo y fallar explícitamente ante metadata estática no soportada. |

Vinext no oculta errores ni genera dimensiones `0×0`. Los flujos multimedia
dinámicos actuales continúan operativos. Una futura capacidad de imágenes
estáticas que requiera metadata debe reevaluar el patch.

La instalación congelada es reproducible y la auditoría de la base funcional
informa 0 vulnerabilidades críticas, altas, moderadas o bajas. No existen GHSA
ignoradas ni exclusiones para ocultar avisos.

## 8. Pruebas y CI

La Puerta 9B-M repitió la cadena local equivalente a CI y aprobó 171 pruebas
funcionales y E2E. El bloque `pnpm verify` aprobó 52 pruebas, build, lint sin
errores y escaneo de 274 archivos de texto. Las seis advertencias
`no-img-element` son heredadas y no bloqueantes. La instalación congelada y
`pnpm audit` también aprobaron con 0 vulnerabilidades en todas las severidades.

La ejecución alojada de la base funcional fue:

- workflow: `CI`;
- run: `31279831613`;
- job: `93159245397`;
- SHA: `eb849cf5f44db9907fad646e1141ea8372a94185`;
- duración: 3m25s;
- conclusión: `SUCCESS`;
- deployments: 0.

La Puerta 9B-M requiere que el posterior commit exclusivamente documental
repita la CI alojada antes de marcar el PR como listo para revisión.

## 9. Evidencia visual

La evidencia de 9B.4 corresponde a la base funcional auditada y no se modifica
en esta puerta. Se verificaron 320×640, 375×812, 768×1024, 1280×800 y 1600×900
CSS px: sin overflow horizontal, con un único `h1`, imágenes cargadas,
navegación por anclas, foco visible, cero enlaces administrativos públicos y
consola limpia.

## 10. Deuda no bloqueante

- Seis advertencias ESLint `no-img-element`.
- Acciones GitHub v4 basadas en Node 20 y ejecutadas actualmente bajo Node 24.
- Patch local Vinext y reevaluación futura para imágenes estáticas con metadata.
- Investigación de assets hasheados con `vinext start` bajo Windows/OneDrive.
- Proveedores productivos de identidad, multimedia, observabilidad y respaldo
  continúan pendientes y bloquean staging/producción.

Durante la observación Windows/OneDrive se utilizó un proxy temporal solo para
la validación visual. Fue eliminado junto con sus procesos. Build, suites y CI
aprobaron, sin evidencia de impacto en código funcional. El mecanismo debe
investigarse antes de considerarlo una estrategia productiva.

## 11. Alcance negativo confirmado

El PR no incorpora nuevos rubros, gimnasio, colegio, tienda online, PosApp,
RestApp, pagos, reservas, DNS real, dominios o proveedores productivos. Tampoco
contiene nuevas migraciones, `restaurant.v3`, cambios a los schemas vigentes,
secretos, `.env` reales, ZIP, bases locales, builds, cachés o temporales.

Staging y producción permanecen prohibidos. No se realizó merge.

## 12. Mapa de revisión humana

| Área | Archivos principales | Propósito y riesgo | Pruebas / revisión recomendada |
| --- | --- | --- | --- |
| 1. Capacidades | `site/src/content/template-capabilities.ts` | Define qué puede seleccionarse, publicarse y usarse en onboarding. Riesgo alto por alcance transversal. | Revisar sets cerrados y orden; `template-flow.test.ts`. |
| 2. Manifest y registry | `renderer-manifest.ts`, `renderer-registry.tsx` | Compatibilidad schema/renderer y resolución sin fallback. Riesgo alto. | Revisar duplicados y renderer desconocido; `restaurant-v2.test.ts`. |
| 3. Renderer Editorial | `restaurant-editorial*.tsx`, `.module.css` | Render semántico y responsive. Riesgo medio visual y de contenido. | Revisar campos opcionales, medios y accesibilidad; unitarias y evidencia visual. |
| 4. Catálogo y seed | `site/scripts/db/seed.ts` | Tres plantillas exactas e idempotentes. Riesgo medio de asignación accidental. | Revisar IDs estables y ausencia de asignación; `media-seed.test.ts`. |
| 5. Preview cliente | `app/cuenta/.../plantillas/page.tsx`, `service.server.ts` | Preview privado y selección autorizada. Riesgo alto de tenant cruzado. | Revisar membresía y tenant; integración y E2E multimedia. |
| 6. Preview admin | `app/nexi-interno/.../page.tsx`, `service.server.ts` | Preview/asignación administrativa con AAL2. Riesgo alto. | Revisar permiso y AAL2; `template-flow.test.ts`. |
| 7. Selección | `template-capabilities.ts`, `service.server.ts` | Cambio optimista e idempotente sin publicar. Riesgo alto. | Revisar versión y puntero público; integración concurrente. |
| 8. Aprobación/checksum | `src/onboarding/service.server.ts` | Vincula revisión, template y contenido. Riesgo crítico. | Revisar checksum e invalidación; `onboarding-flow.test.ts`. |
| 9. Publicación | `src/content/service.server.ts` | Publicación transaccional compartida. Riesgo crítico. | Revisar locks, replay y revisión obsoleta; integración y E2E. |
| 10. Restauración | `src/content/service.server.ts` | Recuperación histórica completa. Riesgo crítico de pérdida o mezcla. | Revisar template, snapshot y puntero; `template-flow.test.ts`. |
| 11. Onboarding | `src/onboarding/service.server.ts` | Recorrido hasta publicación y cierre. Riesgo crítico. | Revisar reanudación/checklist/publicación compartida; integración y HTTP E2E. |
| 12. Multimedia | referencias en servicios y renderer | Manifiestos privados y snapshots históricos. Riesgo alto de fuga. | Revisar tenant/sitio/checksum; suites media y E2E. |
| 13. Patches | `site/patches`, workspace y lockfile | Seguridad y reproducibilidad del grafo. Riesgo medio de mantenimiento. | Revisar checksums, fail-closed e instalación congelada. |
| 14. E2E | `site/tests/e2e/*.mjs` | Verifica fronteras HTTP reales. Riesgo de cobertura insuficiente. | Revisar Editorial pública, cross-tenant y restauraciones. |
| 15. Documentación | `docs/`, README raíz y `site/README.md` | Define estado y límites de autorización. Riesgo medio de promesa incorrecta. | Confirmar local/CI, deuda y prohibición de staging/producción. |

## 13. Condición de revisión

La Etapa 9B puede pasar a revisión humana cuando el commit documental de 9B-M
mantenga working tree limpio, CI alojada `SUCCESS`, audit 0/0/0/0,
conversaciones pendientes 0 y deployments 0. La revisión humana no autoriza
merge por sí sola.
