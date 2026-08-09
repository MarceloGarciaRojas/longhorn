# Registro de deuda técnica

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Última actualización:** 2026-08-08

Este registro centraliza deuda conocida y no concede autorización para staging,
producción, contratación de servicios ni conexión de proveedores reales.

La auditoría de cierre de la Etapa 9B informa actualmente **0 vulnerabilidades
críticas, 0 altas, 0 moderadas y 0 bajas**. No existen GHSA ignoradas ni
exclusiones de auditoría destinadas a ocultar avisos.

## DT-001: PostCSS 8.5.19 — cerrada

- **Descripción histórica:** `postcss@8.5.19` estaba afectado por
  `GHSA-fxqj-rqcc-2cmp`.
- **Remediación:** override reproducible a `postcss@8.5.23`.
- **Alcance afectado:** toolchain de frontend y build.
- **Severidad histórica:** moderada.
- **Estado:** **RESUELTA**; instalación congelada, CI y auditoría aprobaron.
- **Bloqueos:** ninguno por esta vulnerabilidad.

## Remediaciones de dependencias cerradas en 9B

| Dependencia | Estado | Evidencia reproducible |
| --- | --- | --- |
| PostCSS | **RESUELTA** | Override `8.5.23`, lockfile y audit sin avisos. |
| js-yaml | **RESUELTA** | Override `4.3.1`, lockfile y audit sin avisos. |
| nanoid | **RESUELTA** | Override `3.3.17`, lockfile y audit sin avisos. |
| image-size | **RESUELTA** | Eliminada del grafo efectivo de Vinext; override `"-"`, patch fail-closed y prueba de regresión. |

## DT-002: Seis advertencias `no-img-element`

- **Descripción:** ESLint informa seis usos heredados de `<img>`.
- **Impacto:** posible degradación de LCP, consumo de ancho de banda y
  optimización de imágenes.
- **Alcance afectado:** landing, editores, biblioteca multimedia y renderer.
- **Severidad:** baja.
- **Estado:** heredada; no fue introducida por la Etapa 9B.
- **Condición de cierre:** evaluar visualmente cada caso, definir una estrategia
  compatible con los proveedores y obtener lint sin estas advertencias.
- **Etapa recomendada:** optimización visual y de rendimiento previa a
  producción.
- **Bloqueos:** no bloquea desarrollo, merge ni CI; requiere evaluación antes de
  producción.

## DT-003: Clasificación estática de rutas por Vinext

- **Descripción:** Vinext no clasifica estáticamente algunas rutas que usan APIs
  dinámicas.
- **Impacto:** incertidumbre operativa en el diseño definitivo de despliegue,
  aunque build y E2E aprueban.
- **Alcance afectado:** empaquetado, routing y despliegue.
- **Severidad:** media.
- **Estado:** aceptada para local y CI.
- **Condición de cierre:** verificar todas las rutas en el runtime y plataforma
  elegidos, documentar su clasificación efectiva y repetir E2E.
- **Etapa recomendada:** diseño y compuerta de staging.
- **Bloqueos:** no bloquea desarrollo ni merge; debe resolverse o aceptarse
  formalmente antes de staging y producción.

## DT-004: Advertencia de Node 20 en Actions v4

- **Descripción:** GitHub advierte que `actions/checkout@v4`,
  `actions/setup-node@v4` y `pnpm/action-setup@v4` apuntan a Node 20; el runner
  las ejecutó bajo Node 24.
- **Impacto:** riesgo futuro de incompatibilidad o endurecimiento del runner.
- **Alcance afectado:** workflow CI.
- **Severidad:** baja.
- **Estado:** aceptada como deuda no bloqueante para el PR #4.
- **Condición de cierre:** actualizar el workflow de forma controlada a versiones
  compatibles y repetir la ejecución alojada.
- **Etapa recomendada:** mantenimiento de CI posterior a 9B-M.
- **Bloqueos:** no bloquea desarrollo, merge, staging ni producción por sí sola;
  debe cerrarse antes de que GitHub retire la compatibilidad.

## DT-005: Autenticación, MFA y recuperación productiva

- **Descripción:** Supabase Auth, TOTP y recuperación real permanecen sin
  aprovisionar ni validar en un ambiente productivo.
- **Impacto:** no existe una frontera de identidad operativa para usuarios
  reales.
- **Alcance afectado:** autenticación, sesiones administrativas, invitaciones y
  recuperación.
- **Severidad:** alta.
- **Estado:** pendiente.
- **Condición de cierre:** proveedor autorizado, secretos fuera de Git,
  configuración server-side, pruebas AAL2, recuperación y revocación en ambiente
  controlado.
- **Etapa recomendada:** preparación de staging.
- **Bloqueos:** no bloquea desarrollo ni merge de 9B; bloquea staging y
  producción.

## DT-006: Multimedia productiva, CDN y retención

- **Descripción:** object storage, procesamiento, cola, CDN y política de
  retención productivos permanecen pendientes.
- **Impacto:** los medios solo funcionan con almacenamiento y procesamiento
  local/CI.
- **Alcance afectado:** carga, variantes, entrega pública, privacidad y
  conservación de archivos.
- **Severidad:** alta.
- **Estado:** pendiente.
- **Condición de cierre:** proveedor autorizado, aislamiento por tenant,
  credenciales server-side, procesamiento, cuotas, CDN, retención y pruebas de
  recuperación.
- **Etapa recomendada:** preparación de staging.
- **Bloqueos:** no bloquea desarrollo ni merge de 9B; bloquea staging y
  producción.

## DT-007: Observabilidad, backup y restauración productivos

- **Descripción:** faltan observabilidad operativa, alertas, backup y ejercicios
  de restauración para un ambiente real.
- **Impacto:** capacidad insuficiente para detectar incidentes, medir
  conversiones y recuperar datos.
- **Alcance afectado:** PostgreSQL, onboarding, outbox, auditoría y operación.
- **Severidad:** alta.
- **Estado:** pendiente.
- **Condición de cierre:** métricas y alertas aprobadas, política de backup,
  retención definida y restauración ensayada con evidencia.
- **Etapa recomendada:** preparación de staging.
- **Bloqueos:** no bloquea desarrollo ni merge de 9B; bloquea staging y
  producción.

## DT-008: Patch local fail-closed de Vinext

- **Descripción:** `vinext@0.0.50` requiere un patch local para retirar
  `image-size` del grafo efectivo y rechazar explícitamente imports de imágenes
  estáticas o metadata que necesiten dimensiones.
- **Impacto:** los flujos multimedia dinámicos actuales continúan operativos,
  pero una futura incorporación de imágenes estáticas que requiera metadata
  fallará de forma explícita hasta definir un lector síncrono seguro.
- **Alcance afectado:** build Vinext y rutas de metadata estática.
- **Severidad:** media.
- **Estado:** aceptada para local y CI; checksum y aplicación reproducibles.
- **Condición de cierre:** reevaluar al actualizar Vinext o antes de incorporar
  una capacidad de imágenes estáticas con metadata; retirar el patch solo tras
  repetir build, multimedia, E2E y auditoría.
- **Bloqueos:** no bloquea la revisión o merge de 9B; debe revisarse antes de
  habilitar esa capacidad o una estrategia productiva basada en Vinext.

## DT-009: Assets hasheados con `vinext start` en Windows/OneDrive

- **Descripción:** durante la validación visual de 9B.4, `vinext start` bajo
  Windows dentro de OneDrive entregó HTML pero no sirvió inicialmente algunos
  assets hasheados del build.
- **Impacto observado:** afectó solo esa validación local. Se utilizó un proxy
  temporal limitado a servir `dist/client/assets`; el proxy fue eliminado y
  todos sus procesos fueron detenidos al finalizar.
- **Evidencia de no impacto funcional:** build, suites locales, E2E y CI alojada
  aprobaron. No existe evidencia actual de fuga multi-tenant, pérdida de datos o
  defecto específico del renderer Editorial.
- **Alcance afectado:** estrategia local de ejecución del build en
  Windows/OneDrive.
- **Severidad:** media.
- **Estado:** investigación pendiente, no bloqueante para revisión y merge.
- **Condición de cierre:** reproducir fuera de OneDrive y en el runtime objetivo,
  aislar si corresponde a filesystem, caché estática o Vinext, y documentar una
  estrategia soportada.
- **Bloqueos:** no usar `vinext start` sobre esa combinación como estrategia
  productiva hasta completar la investigación; staging y producción continúan
  prohibidos por esta puerta.
