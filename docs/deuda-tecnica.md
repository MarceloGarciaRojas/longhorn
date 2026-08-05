# Registro de deuda técnica

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Última actualización:** 2026-08-04

Este registro centraliza deuda conocida y no concede autorización para staging,
producción, contratación de servicios ni conexión de proveedores reales.

## DT-001: PostCSS 8.5.19

- **Descripción:** `postcss@8.5.19` conserva la vulnerabilidad moderada
  `GHSA-fxqj-rqcc-2cmp`.
- **Impacto:** posible lectura de archivos `.map` mediante un
  `sourceMappingURL` controlado cuando `from` no está definido.
- **Alcance afectado:** toolchain de frontend y build.
- **Severidad:** moderada.
- **Estado:** aceptada temporalmente.
- **Condición de cierre:** actualizar de forma controlada a una versión corregida
  igual o superior a `8.5.23`, regenerar el lockfile con pnpm y repetir CI y
  auditoría.
- **Etapa recomendada:** compuerta previa a staging.
- **Bloqueos:** no bloquea desarrollo ni merge de 9A; bloquea la evaluación de
  staging hasta su corrección o aceptación formal del riesgo; debe estar resuelta
  o aceptada antes de producción.

## DT-002: Seis advertencias `no-img-element`

- **Descripción:** ESLint informa seis usos heredados de `<img>`.
- **Impacto:** posible degradación de LCP, consumo de ancho de banda y
  optimización de imágenes.
- **Alcance afectado:** landing, editores, biblioteca multimedia y renderer.
- **Severidad:** baja.
- **Estado:** heredada; no fue introducida por la Etapa 9A.
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
- **Estado:** aceptada para el PR #3.
- **Condición de cierre:** actualizar el workflow de forma controlada a versiones
  compatibles y repetir la ejecución alojada.
- **Etapa recomendada:** mantenimiento de CI posterior a 9A-M.
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
- **Bloqueos:** no bloquea desarrollo ni merge de 9A; bloquea staging y
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
- **Bloqueos:** no bloquea desarrollo ni merge de 9A; bloquea staging y
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
- **Bloqueos:** no bloquea desarrollo ni merge de 9A; bloquea staging y
  producción.
