# Informe de preparación para merge del Pull Request #3

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Fecha de comprobación:** 2026-08-04
- **Resultado:** **APTO CON DEUDA NO BLOQUEANTE**

## 1. Alcance

Este informe versiona la auditoría técnica previa a la revisión humana del Pull
Request #3. No autoriza merge, staging, producción, proveedores productivos ni
el inicio de la Etapa 9B.

## 2. Línea base comprobada

| Elemento | Resultado |
| --- | --- |
| Rama | `chore/cierre-etapa-9a` |
| Base | `main` |
| SHA auditado | `830345bd15796274826ee088e9fcf64ea89eabad` |
| Relación con `main` | 0 detrás, 12 delante |
| Working tree | Limpio |
| Commits del PR | 12 |
| Archivos modificados por el PR | 270 |
| Estado del PR durante la auditoría | Abierto, draft, `MERGEABLE` y `CLEAN` |
| Revisiones y conversaciones | 0 |

`origin/main` era ancestro del SHA auditado y no existían conflictos ni cambios
locales.

## 3. Evidencia alojada

| Elemento | Resultado |
| --- | --- |
| Pull Request | #3 |
| Workflow | `CI` |
| Ejecución | `30877506500` |
| Job | `91891835577` (`Verify application`) |
| Evento | `pull_request` |
| SHA | `830345bd15796274826ee088e9fcf64ea89eabad` |
| Conclusión | `success` |
| Pasos fallidos | 0 |

La ejecución comprobó instalación congelada, PostgreSQL 17.10, roles
restringidos, migraciones, seed, RLS, `verify`, autenticación, paneles,
operaciones, contenido, multimedia, plantillas, onboarding, E2E, auditoría de
dependencias y limpieza.

## 4. Reproducción local

Todos los siguientes controles aprobaron:

- `pnpm install --frozen-lockfile`;
- `pnpm verify`;
- build, lint y TypeScript;
- pruebas de PostgreSQL/RLS: 8;
- autenticación: 19;
- panel del Administrador nexi: 14;
- panel del Cliente Administrador: 12;
- operaciones: 8;
- contenido: 15;
- seed multimedia: 4;
- multimedia: 9;
- plantillas: 5;
- onboarding: 5;
- E2E de autenticación, administración, cliente, operaciones, contenido,
  multimedia y onboarding;
- `pnpm audit --audit-level=high`;
- escaneo de secretos;
- `git diff --check`.

## 5. Base de datos y aislamiento

Se comprobaron:

- aplicación ascendente de migraciones `0001` a `0012`;
- rollback completo y reaplicación;
- seed canónico con dos tenants;
- rechazo sin contexto confiable;
- aislamiento ante UUID conocidos de otro tenant;
- `nexi_app` sin superusuario ni `BYPASSRLS`;
- 91 políticas RLS;
- 0 constraints inválidos;
- 0 índices inválidos;
- ausencia del error histórico SQLSTATE `23514`;
- consistencia de la migración `0012_operational_onboarding`.

## 6. Onboarding y publicación

El flujo comprobado cubre solicitud pública, revisión, conversión reanudable,
invitación, tenant, membresía, sitio, checklist, respuestas, borrador, preview,
aprobación vinculada, publicación y verificación pública.

También se comprobaron honeypot, origen, tamaño, rate limiting, respuesta
genérica, idempotencia, AAL2, ausencia de recursos duplicados, transformación
determinista `restaurant_onboarding.v1` a `restaurant.v2`, checksum lógico,
invalidación de aprobación, concurrencia de publicación y separación entre
notas internas y DTO del cliente.

## 7. Seguridad y dependencias

- vulnerabilidades críticas: 0;
- vulnerabilidades altas: 0;
- vulnerabilidades moderadas: 1, correspondiente a `postcss@8.5.19`;
- `undici@7.29.0`;
- `fast-uri@3.1.5`;
- `brace-expansion@5.0.9`;
- patch `minimatch@3.1.5.patch` con checksum
  `073A3811A63BCF556A5EE663CCF3FDE267D7077A6D2CC91C967541A2EFEC75E7`;
- secretos, archivos `.env` reales, respaldos, bases locales y archivos mayores
  a 10 MB: 0.

## 8. Deuda no bloqueante

La deuda vigente se mantiene en el
[registro central de deuda técnica](deuda-tecnica.md). Incluye PostCSS,
advertencias de imágenes, clasificación estática de Vinext, mantenimiento de
Actions y capacidades productivas todavía pendientes.

## 9. Gobierno de `main`

El 2026-08-04 se aplicó protección de rama a `main` mediante la configuración
nativa de GitHub disponible para el repositorio público:

- Pull Request obligatorio;
- check `Verify application` obligatorio y estricto sobre una rama actualizada;
- resolución de conversaciones obligatoria;
- force push y eliminación de `main` bloqueados;
- protección aplicada también a administradores;
- 0 aprobaciones obligatorias, para conservar una vía razonable de integración
  con un único propietario;
- 0 actores con bypass configurado;
- sin auto-merge, deployments, environments ni rulesets adicionales.

La consulta posterior confirmó que la protección quedó activa con esos valores.

## 10. Recomendación

**Autorizar revisión humana final del Pull Request #3.**

No se autoriza merge automático. Staging y producción permanecen prohibidos
hasta resolver o aceptar formalmente sus condiciones de entrada.
