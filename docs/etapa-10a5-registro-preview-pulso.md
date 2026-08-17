# Etapa 10A.5: registro técnico, catálogo y preview Pulso Club

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Etapa:** 10A.5
- **Fecha de implementación:** 2026-08-12
- **Fecha de cierre local:** 2026-08-16
- **Estado:** IMPLEMENTADA Y VALIDADA; LISTA PARA PULL REQUEST DRAFT
- **Base sincronizada:** `f2644923dd950ad5e5a19c8f807077cbae8b302e`
- **Rama:** `codex/etapa-10a5-registro-preview-pulso`

## 1. Objetivo y límite

Esta etapa registra de manera cerrada el renderer existente `gym-pulso-v1`,
crea una única versión de plantilla Gym y habilita su catálogo y preview
privados contra borradores estructurados `gym.v1`.

La etapa no habilita selección, publicación, restauración, editor, onboarding,
acceso público, staging ni producción para Gym. Tampoco incorpora al runtime el
ZIP o los recursos originales de Pulso Club.

## 2. Registro cerrado

| Propiedad | Valor |
| --- | --- |
| Industria | `gym` |
| Schema | `gym.v1` |
| Versión | `1` |
| Renderer | `gym-pulso-v1` |
| Plantilla | `gym-pulso` |
| Nombre visible | Pulso Club |
| Variantes de contenido | `volt`, `studio`, `forge` |

El manifest y el registry aceptan únicamente la combinación exacta anterior.
No existe registro dinámico, fallback a Restaurant ni renderer genérico.

## 3. Capacidades

| Capacidad | Restaurant | Pulso Club Gym |
| --- | --- | --- |
| Catálogo privado | Sí, 3 plantillas | Sí, 1 plantilla |
| Preview privado | Sí | Sí |
| Selección | Sí | **NO** |
| Publicación | Sí | **NO** |
| Restauración | Sí | **NO** |
| Editor | Sí | **NO** |
| Onboarding | Sí | **NO** |
| Resolución pública | Sí | **NO** |

La capacidad de preview se separó explícitamente de selección. Los servicios
derivan industria y schema desde el sitio y su borrador en PostgreSQL; no
confían en valores enviados por el navegador.

## 4. Persistencia reversible

La migración `0015_gym_pulso_preview_catalog` registra la plantilla y su versión
con identificadores estables. Una migración fue necesaria porque un registro
Gym creado solo por seed impediría que el rollback histórico de `0013` volviera
a restringir `templates.industry_key` a Restaurant. El `DOWN` de `0015` elimina
exclusivamente la versión y plantilla Pulso Club antes de continuar el ciclo
histórico. Falla de forma cerrada con SQLSTATE `55006` si encuentra cualquier
referencia protegida; no usa `CASCADE` y conserva los datos al rechazar el
rollback.

No se modificaron migraciones anteriores. No se crean asignaciones,
publicaciones ni contenido comercial mediante esta migración.

## 5. Seguridad y aislamiento

- El catálogo se filtra por la industria confiable del sitio y el schema del
  borrador.
- El Cliente Administrador solo puede consultar sitios de su tenant mediante
  contexto transaccional y RLS.
- El Administrador nexi requiere su sesión reforzada existente.
- La preview valida industria, renderer, schema, versión y contenido.
- Las referencias multimedia se resuelven por propietario de borrador y solo
  producen URLs privadas para activos del mismo tenant y sitio.
- La selección directa de Pulso Club se rechaza tanto en el servicio cliente
  como en el servicio administrativo.
- Publicación, restauración y onboarding conservan listas cerradas que no
  incluyen `gym-pulso-v1`.

## 6. Fuente visual

El archivo `plantillas/pulso-club-sitio.zip` permanece ignorado por Git, fuera
del runtime y sin modificaciones. Su SHA-256 aprobado es:

`70833E4A72C592DFB5253659B74D32E77415895CE5EED0D9DF5274EE3E3FC072`

No se incorporaron assets, dependencias, credenciales demostrativas,
`localStorage`, rutas administrativas ni reservas desde la referencia.

## 7. Cobertura incorporada

Las pruebas cubren:

1. registro exacto del renderer y rechazo de cruces;
2. catálogo Restaurant de tres opciones y Gym de una opción;
3. preview permitido y selección/publicación/onboarding bloqueados;
4. seed y migración idempotentes y reversibles;
5. preview de Cliente Administrador y Administrador nexi;
6. rechazo de tenant ajeno, sesión ausente y combinaciones incompatibles;
7. contenido sin imágenes, multimedia parcial y multimedia completa;
8. conservación de Restaurant y de sus tres plantillas;
9. ausencia de publicación o asignación Gym;
10. renderizado de las variantes `volt`, `studio` y `forge`.

## 8. Evidencia de cierre local

### 8.1 Matriz visual privada

La ruta privada real
`/cuenta/sitios/95000000-0000-4000-8000-000000000001/plantillas/a8cccccc-cccc-4ccc-8ccc-cccccccccccc/preview`
fue validada con sesión de Cliente Administrador. Las variantes `volt`,
`studio` y `forge` aprobaron los viewports `320x640`, `375x812`, `768x1024`,
`1280x800` y `1600x900`: **15/15**.

En todos los casos se comprobó un solo `h1`, landmarks semánticos, navegación,
skip link, ausencia de overflow horizontal y controles de al menos 44 px. La
inspección se ejecutó contra `vinext dev`, con CSS real y sin errores de
consola. `vinext start` mantiene una deuda ambiental heredada en Windows con
OneDrive: sus rutas cargan, pero los assets CSS `/assets/*.css` responden 404;
`vinext build` sí aprueba.

### 8.2 Casos defensivos

Los seis escenarios usaron la variante `volt`, viewport `375x812` y la misma
ruta privada real.

| Caso | Resultado | Consola | Observación |
| --- | --- | --- | --- |
| Clases ocultas | Aprobado | 0 errores, 0 warnings | Sin enlaces `#clases` desktop/móvil, sección ni filtros. |
| Programación solo de clases ocultas | Aprobado | 0 errores, 0 warnings | Sin entradas ni contenedor de programación vacío; el horario informativo del gimnasio permanece. |
| Red social visible sin URL | Aprobado | 0 errores, 0 warnings | Sin anchor, `href=""`, `href="#"` ni navegación a la misma página. |
| Galería informativa | Aprobado | 0 errores, 0 warnings | `altText` preservado; logo decorativo con `alt=""`; ningún alt derivado de UUID, filename o URL. |
| Sin multimedia | Aprobado | 0 errores, 0 warnings | Preview tipográfico funcional, sin imágenes ni placeholders remotos. |
| Horarios parciales | Aprobado | 0 errores, 0 warnings | Un solo día válido sin exigir siete días ni producir error de schema/rendering. |

Durante el caso sintético de galería el servidor registró dos respuestas 404
para objetos locales deliberadamente inexistentes; no hubo errores de consola
y la prueba verificaba exclusivamente la semántica `alt`.

### 8.3 Migración, datos y pruebas

- `0015 DOWN` sin referencias: aprobado.
- `0015 DOWN` con referencia protegida sintética: rechazado y datos
  conservados.
- Retiro del fixture y nuevo `0015 DOWN`: aprobado.
- `0015 UP` posterior: exactamente 1 plantilla Gym y 3 Restaurant.
- `pnpm verify`: aprobado; 78 pruebas y 6 advertencias heredadas
  `no-img-element`, sin errores lint, TypeScript o build.
- `pnpm test:db`: 8/8.
- Suites especializadas en orden oficial: 125/125.
- Suites E2E: 11/11.
- `git diff --check`: aprobado.

Una repetición aislada de `test:templates` no fue válida porque esa suite
consume el estado acumulado por la secuencia oficial. La cadena completa desde
`db:reset`, en su orden oficial, aprobó `test:templates` 13/13 y finalizó sin
fallos.

### 8.4 Limpieza y cierre de seguridad

- `tmp-10a5-visual.ts`: eliminado y no tracked.
- `tmp-10a5-server.ps1`: eliminado y no tracked.
- Puertos temporales `33054`, `43127` y `43129`: 0 listeners.
- Datos sintéticos visuales y multimedia: eliminados.
- Fixture visual `95000000-0000-4000-8000-000000000001`: eliminado.
- `package.json` y patches: sin cambios funcionales de 10A.5.

La vulnerabilidad de `nanoid 3.3.17` se remedió de forma separada y trazable en
el Pull Request #9, integrado en `main` mediante el commit
`f2644923dd950ad5e5a19c8f807077cbae8b302e`. Tras sincronizar esta rama por
fast-forward, `nanoid` quedó en `3.3.18`, la instalación congelada aprobó y el
audit final informa **Critical 0, High 0, Moderate 0, Low 0**. El lockfile y el
workspace permanecen limpios respecto de la base sincronizada; 10A.5 no los
modifica.

## 9. Estado funcional

Pulso Club queda disponible exclusivamente para catálogo y preview privados.
No constituye disponibilidad comercial de Gimnasio y no autoriza iniciar la
selección, publicación, restauración, editor u onboarding Gym.
