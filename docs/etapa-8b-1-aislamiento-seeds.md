# Etapa 8B.1: aislamiento de pruebas y atomicidad de seeds

## A. Decisión

**Reparación 8B.1 aprobada con deuda no bloqueante.**

La corrección y la secuencia local equivalente a CI aprobaron. Quedan
pendientes únicamente la ejecución de la CI alojada y el audit online cuando
el entorno disponga de red autorizada.

## B. Reproducción

Secuencia reproducida:

1. `pnpm db:reset`;
2. `pnpm test:content`;
3. inspección del sitio B;
4. `pnpm media:seed`;
5. inspección posterior.

Antes del seed, el sitio B quedaba `archived`, con asignación y borrador
`restaurant.v1`, revisión 4, sin activos ni referencias. El seed fallaba al
actualizar el borrador con SQLSTATE `23514`.

Después del fallo se observaron cambios parciales: asignación
`restaurant.v2`, 4 activos y 12 variantes, pero borrador aún
`restaurant.v1` y cero referencias.

## C. Causa raíz

- Contaminación: el último caso de `test:content` no restauraba el estado del
  sitio después de probar `suspended` y `archived`.
- Atomicidad: `media:seed` utilizaba `pool.query` en autocommit para cada paso.
- CI: contenido y seed multimedia compartían el mismo estado mutable.
- Trigger: `enforce_content_draft_consistency()` actuó correctamente y no fue
  modificado.

## D. Estrategia de aislamiento

| Suite | Mutación | Limpieza | Estado esperado |
|---|---|---|---|
| `test:db` | Destructiva sintética | rollback, migraciones y seed internos | Base 0001–0011 canónica |
| `test:auth` | Sesiones, identidades y límites | preparación base; limpieza propia de auth | Tenants sintéticos disponibles |
| `test:admin` | Ciclo administrativo | preparación base o fixture propio | Datos administrativos sintéticos |
| `test:client` | Perfil y sesiones | preparación base o fixture propio | Tenant activo aislado |
| `test:operations` | Sitios, solicitudes y mensajes | fixture interno desde migraciones | Estado 7B sintético |
| `test:content` | Borradores, publicaciones y estados | fixture interno; restauración `finally` del sitio | Sitio B nuevamente `active` |
| `test:media-seed` | Reset y seed multimedia | raíz temporal por caso y reset interno | Sin residuos entre casos |
| `test:media` | Upload y biblioteca | escenario `test:prepare-media` | Activos 8B canónicos |
| `test:templates` | Selección de plantilla | revierte selección dentro del caso | Plantilla clásica V2 |
| E2E existentes | Estado persistente | `test:prepare-base` antes de cada suite | Base canónica independiente |
| E2E multimedia | Estado y objetos persistentes | `test:prepare-media` y limpieza final | Multimedia canónica |

Las pruebas que atraviesan pools y servicios no se envuelven artificialmente
en una sola transacción. Se utiliza restauración explícita para el estado
acotado y reset canónico entre bloques.

## E. Seed multimedia

`seedSyntheticMedia()`:

- valida `APP_ENV` y una base loopback con nombre local/test;
- limita operaciones a UUID y slugs sintéticos conocidos;
- exige sitio B editable, tenant activo y asignación/borrador coherentes;
- utiliza un único `PoolClient` y una transacción;
- registra activos, variantes, borrador, referencias, publicaciones y
  auditoría antes de `COMMIT`;
- compensa objetos locales nuevos si ocurre rollback;
- no cambia automáticamente un sitio archivado;
- admite un punto de fallo solamente por API de prueba y únicamente en
  `APP_ENV=test`;
- migra V1 una sola vez y reutiliza IDs estables en ejecuciones posteriores.

## F. Reset canónico

- `pnpm test:prepare-base`: ejecuta el reset protegido existente.
- `pnpm test:prepare-media`: reset protegido y seed multimedia transaccional.

`db:reset` conserva sus comprobaciones: entorno local/test, host loopback y
nombre de base terminado en `_test`, `_local` o `_dev`.

## G. CI

El orden anterior ejecutaba `test:content` y luego `media:seed` sobre el sitio
archivado. El orden corregido añade la regresión transaccional, prepara un
escenario multimedia canónico y reinicia la base antes de cada E2E mutable.

No se agregaron credenciales, servicios externos ni despliegue.

## H. Archivos modificados

| Archivo | Cambio | Motivo | Riesgo |
|---|---|---|---|
| `site/tests/integration/content-flow.test.ts` | Restauración `finally` | Evitar contaminación | Bajo |
| `site/scripts/media/seed.ts` | Precondiciones, transacción, rollback e idempotencia | Evitar estado parcial | Medio |
| `site/scripts/media/processor.ts` | Acepta contrato `ObjectStorage` | Permitir seguimiento transaccional | Bajo |
| `site/tests/integration/media-seed.test.ts` | Regresiones nuevas | Probar archived, rollback e idempotencia | Bajo |
| `site/package.json` | Comandos de preparación y prueba | Secuencia reutilizable | Bajo |
| `.github/workflows/ci.yml` | Estados canónicos entre bloques | Independencia de orden | Bajo |
| `site/README.md` y documentación | Operación y matriz | Trazabilidad | Bajo |

## I. Pruebas nuevas

| Caso | Resultado | Evidencia |
|---|---|---|
| Sitio archivado sin cambios parciales | Aprobado | Estado DB idéntico y 0 objetos |
| Fallo después del primer activo | Aprobado | Rollback DB y almacenamiento |
| Dos ejecuciones consecutivas | Aprobado | Conteos y estado lógico idénticos |
| Secuencia `content → seed → media → templates` | Aprobado | 15/15, seed, 9/9 y 5/5 |

## J. Validación completa

| Compuerta | Resultado |
|---|---:|
| PostgreSQL, migraciones y RLS | 8/8 |
| Autenticación | 19/19 |
| Administrador nexi | 14/14 |
| Cliente Administrador | 12/12 |
| Operaciones 7B | 8/8 |
| Contenido 8A | 15/15 |
| Seed multimedia 8B.1 | 4/4 |
| Multimedia 8B | 9/9 |
| Plantillas | 5/5 |
| E2E existentes | 9/9 |
| Unitarias de `pnpm verify` | 35/35 |
| Health | 2/2 |
| HTML renderizado | 2/2 |
| Lint | 0 errores; 6 advertencias conocidas |
| Typecheck | Aprobado |
| Build | Aprobado |
| Escaneo de secretos | 229 archivos, aprobado |

También aprobó explícitamente la secuencia antes defectuosa:
`reset → test:content → media:seed → test:media → test:templates`.

## K. Seguridad

- RLS y roles no fueron modificados.
- El trigger permanece intacto.
- El seed utiliza exclusivamente el rol de migración en un comando local/test.
- Las solicitudes web continúan usando `nexi_app`.
- No existe BYPASSRLS nuevo.
- El punto de fallo no puede activarse mediante variables de entorno ni fuera
  de `test`.
- `nexi_app` fue comprobado nuevamente sin privilegios elevados.
- No se modificaron migraciones, triggers ni policies.

## L. Problemas encontrados

Corregidos:

- estado `archived` filtrado entre suites;
- seed en autocommit;
- colisión de números de publicación después de `test:content`;
- segunda ejecución que volvía a migrar el borrador.

No se modificaron problemas productivos ni funciones de 9A.

Diferidos no bloqueantes:

- ejecución del workflow en CI alojada;
- audit online de dependencias, sin red autorizada en este entorno.

## M. Recomendación

**La compuerta técnica de la Etapa 9A puede repetirse desde el inicio.**
