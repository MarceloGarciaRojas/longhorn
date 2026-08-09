# Etapa 10A.2: generalización mínima del núcleo Restaurant + Gym

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Etapa:** 10A.2
- **Fecha:** 2026-08-09
- **Estado:** **IMPLEMENTADA Y VALIDADA LOCALMENTE; REVISIÓN HUMANA PENDIENTE**
- **Base:** `ffd7e7138f000878d2ea31b505d7ed3c9ddadd6f`
- **Rama:** `codex/etapa-10a2-generalizacion-multirubro`

## 1. Objetivo y límite

Esta etapa elimina los acoplamientos mínimos que impedían que el núcleo
reconociera más de un rubro. El sistema reconoce únicamente las industrias
cerradas `restaurant` y `gym`, conserva Restaurant completamente operativo y
falla de forma controlada ante cualquier industria, schema o renderer no
registrado.

La etapa no implementa `gym.v1`, renderer, plantilla, editor, onboarding ni
runtime público de Gimnasio. La Landing Pulso Club y su ZIP siguen siendo solo
insumos documentales de la Etapa 10A.1.

## 2. Acoplamientos generalizados

| Área | Acoplamiento anterior | Generalización 10A.2 |
| --- | --- | --- |
| Industria | Literales Restaurant dispersos | Registro cerrado `IndustryKey` con `restaurant` y `gym` |
| Contenido | Tipos compartidos basados en `RestaurantAnyContent` | Mapa cerrado de schemas registrados; solo contiene Restaurant v1/v2 |
| Schema dispatch | Selección por `schema_key` | Compatibilidad triple industria/schema/versión y error fail-closed |
| Renderers | Manifest sin industria | Cada renderer declara industria y rango de schema |
| Catálogo | Filtro SQL fijo `restaurant` | Catálogo filtrado por industria confiable del sitio |
| Publicación/restauración | Compatibilidad renderer/schema | Compatibilidad industria/renderer/schema/versión |
| Multimedia | Extractor seleccionado solo por schema | Extractor seleccionado por industria/schema/versión |
| Resolución pública | No retornaba industria | Propaga industria del sitio y rechaza cruces con plantilla |
| PostgreSQL | Plantillas limitadas a Restaurant; sitio sin industria | Sitio y plantilla aceptan únicamente Restaurant/Gym; asignaciones coherentes |

## 3. Contratos cerrados

### 3.1 Industrias

`site/src/content/industry.ts` es la fuente de verdad de aplicación:

- `restaurant`;
- `gym`.

`requireIndustryKey` rechaza cualquier otro valor. Ningún valor recibido del
navegador se utiliza para establecer la industria operativa: los servicios la
leen desde `public.sites.industry_key` dentro de la operación server-side.

### 3.2 Schemas de contenido

El registro activo contiene exclusivamente:

| Industria | Schema | Versión | Estado |
| --- | --- | --- | --- |
| Restaurant | `restaurant.v1` | 1 | Registrado |
| Restaurant | `restaurant.v2` | 2 | Registrado |
| Gym | `gym.v1` | 1 | **NO IMPLEMENTADO / NO REGISTRADO** |

Los constraints históricos de `site_content_drafts` y
`site_content_publications` no se ampliaron. Por tanto PostgreSQL tampoco
acepta contenido Gym en esta etapa.

### 3.3 Renderers

El manifest activo conserva cuatro claves, todas Restaurant:

- `restaurant-classic-v1`;
- `restaurant-classic-v2`;
- `restaurant-modern-v1`;
- `restaurant-editorial-v1`.

La cantidad de renderers Gym es cero. Preview, publicación, restauración y
onboarding verifican la industria antes de usar un renderer.

## 4. Persistencia y seguridad

La migración `0013_multi_industry_core`:

1. añade `public.sites.industry_key` no nulo, con default compatible
   `restaurant` para los sitios existentes;
2. limita sitios y plantillas a `restaurant` o `gym` mediante CHECK;
3. exige igualdad entre la industria del sitio y la plantilla en toda
   asignación;
4. impide cambiar la industria de un sitio con una asignación incompatible;
5. impide que el rol cliente modifique `industry_key`;
6. limita el catálogo visible por RLS a industrias presentes en sitios del
   tenant activo;
7. incorpora la industria confiable a la resolución pública y verifica la
   coherencia de la publicación con la plantilla.

La migración incluye `down` y la suite ejecuta `up → down → up`. No se editó
ninguna migración histórica. El aislamiento continúa dependiendo de
`tenant_id`, contexto transaccional confiable y RLS; `industry_key` complementa
ese aislamiento y no lo reemplaza.

## 5. Comportamiento por industria

| Flujo | Restaurant | Gym en 10A.2 |
| --- | --- | --- |
| Sitio persistido | Sí | Sí, sin contenido ni plantilla |
| Catálogo | 3 plantillas | 0 plantillas |
| Preview | Classic, Modern y Editorial | Bloqueado |
| Selección | Classic, Modern y Editorial | Bloqueada |
| Publicación | Operativa | Bloqueada |
| Restauración | Operativa | Bloqueada |
| Multimedia de contenido | v1/v2 | Sin extractor registrado |
| Editor | Restaurant v1/v2 | No existe |
| Onboarding | Restaurant v2 | No existe |
| Resolución pública | Operativa | Estado controlado sin renderer |

## 6. Compatibilidad Restaurant

Las tres plantillas de catálogo Restaurant conservan sus flujos de preview,
selección, publicación y restauración. El onboarding continúa explícitamente
limitado a Restaurant y sus validaciones no fueron relajadas. Los seeds
existentes obtienen `industry_key='restaurant'` mediante el default de
migración, sin reescritura de contenido ni cambios visuales.

## 7. Validaciones exigidas

La revisión local comprende:

- Node `24.14.0` y pnpm `11.9.0`;
- instalación congelada;
- lint y typecheck;
- pruebas unitarias, integración, renderizado, DB/RLS y E2E existentes;
- migraciones completas y ciclo `0013 up → down → up`;
- escaneo de secretos;
- audit de dependencias;
- `git diff --check`.

Los tests añadidos demuestran la lista cerrada de industrias, el rechazo de
`gym.v1`, cero renderers Gym, catálogo Restaurant de tres opciones, catálogo
Gym vacío, rechazo de cruces de industria, constraints de contenido
Restaurant-only y protección RLS/campos del cliente.

## 8. Exclusiones ratificadas

- No se implementó `gym.v1`.
- No existe renderer, plantilla, editor ni onboarding Gym.
- No se incorporó la Landing Pulso Club al runtime.
- No se modificó el ZIP original.
- No se incorporaron Tienda Online, RestApp, PosApp ni Colegio.
- No se habilitó staging ni producción.
- Esta etapa no autoriza merge.

## 9. Próxima decisión

La siguiente etapa solo puede comenzar tras revisión humana de este cambio. La
implementación de `gym.v1` deberá registrar de forma explícita su schema,
renderer, extractor multimedia, contrato editorial y pruebas, sin relajar los
controles fail-closed establecidos aquí.
