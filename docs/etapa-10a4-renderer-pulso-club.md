# Etapa 10A.4: renderer aislado Pulso Club

## Estado

**Implementación técnica parcial: SÍ. Activación funcional: NO.**

El soporte de industria `gym`, el contrato y los borradores `gym.v1`, y el
renderer aislado `gym-pulso-v1` están implementados. Este incremento no registra
una plantilla Gimnasio ni habilita manifest, registry, catálogo, preview,
selección, publicación, restauración, editor, onboarding, staging o producción.

## Objetivo

Implementar una representación visual reutilizable para el contrato cerrado
`gym.v1`, conservándola fuera del registro funcional hasta que una etapa
posterior autorice su integración completa.

## Línea base

- Rama base: `main`.
- SHA base: `d0a27fc73dcbd13b216ae61beb3e76ccba7a4b63`.
- Rama de trabajo: `codex/etapa-10a4-renderer-pulso-club`.
- Fuente visual de referencia: `plantillas/pulso-club-sitio.zip`.
- SHA-256 de la fuente:
  `70833E4A72C592DFB5253659B74D32E77415895CE5EED0D9DF5274EE3E3FC072`.

El ZIP permanece intacto y fuera del código ejecutable. Sus datos ficticios,
rutas administrativas, credenciales demostrativas, estado en `localStorage` y
flujo de reservas no se incorporaron.

## Contrato del renderer

| Propiedad | Valor cerrado |
| --- | --- |
| Industria | `gym` |
| Renderer | `gym-pulso-v1` |
| Schema | `gym.v1` |
| Versión | `1` |
| Variantes | `volt`, `studio`, `forge` |

`renderGymPulsoIsolated` valida industria, schema, versión y contenido antes de
representar. Toda combinación distinta falla cerrada mediante
`GymPulsoCompatibilityError`.

## Implementación

- `gym-pulso-view.tsx` contiene la vista React pura y el punto de entrada
  aislado, sin consultas, sesiones, datos de tenant ni estado del navegador.
- `gym-pulso.tsx` adapta imágenes al componente `next/image` e inyecta el
  navegador de clases interactivo sin convertir la vista completa en cliente.
- `gym-pulso-class-browser.tsx` mantiene únicamente el filtro efímero de clases
  en un límite cliente pequeño, sin persistencia, red ni datos privilegiados.
- `gym-pulso-class-filter.ts` concentra el cálculo puro de resultados visibles.
- `gym-pulso.module.css` implementa la composición responsiva y los controles
  visuales aprobados en el contrato 10A.1.
- Todos los textos de negocio, clases, entrenadores, planes, instalaciones,
  horarios, contacto, redes e imágenes proceden de un `GymContentV1` validado.
- Las imágenes solo se aceptan desde rutas internas emitidas por el manifiesto
  multimedia y asociadas al `assetId` solicitado.
- Los horarios y capacidades se presentan como información; los CTAs generan
  solicitudes de contacto y no confirman reservas ni cupos.

## Aislamiento funcional

Al cierre de esta etapa:

- renderers Gym activos en `renderer-manifest.ts`: **0**;
- plantillas Gym visibles en catálogo: **0**;
- fallback Gym a Restaurant: **inexistente**;
- acceso público Gym: **no habilitado**;
- publicación y restauración Gym: **bloqueadas**;
- editor Gym: **no implementado**;
- onboarding Gym: **no implementado**.

No se modificaron manifest, registry, catálogo, capacidades, migraciones,
seeds, persistencia, publicación, restauración, editor, onboarding ni rutas
públicas.

## Cobertura incorporada

Las pruebas unitarias comprueban:

1. estructura semántica y un único `h1`;
2. contenido dinámico sin datos comerciales fijos;
3. variantes y controles visuales cerrados;
4. comportamiento responsivo, foco y reducción de movimiento;
5. contenido mínimo, campos opcionales y horarios parciales;
6. rechazo de industria, schema, versión y contenido incompatibles;
7. filtrado de rutas multimedia externas o cruzadas;
8. determinismo y ausencia de mutación del documento;
9. ausencia de estado persistente del navegador, rutas administrativas y
   reservas;
10. filtros de clases cerrados, accesibles, derivados del contenido y efímeros;
11. exclusión explícita del renderer respecto del manifest activo.

## Revisión visual local

Se revisaron las variantes `volt`, `studio` y `forge` en 320×640, 375×812,
768×1024, 1280×800 y 1600×900: **15 combinaciones aprobadas**. La matriz
confirmó un único `h1`, ocho secciones, ausencia de desbordamiento horizontal,
menú móvil nativo, navegación de escritorio, grilla de clases responsiva y
filtros con objetivos de 44 píxeles. También se comprobó la interacción por
teclado, el estado seleccionado, el conteo anunciado y el foco visible.

Los contrastes mínimos medidos fueron 14,88 (`volt`), 9,45 (`studio`) y 5,46
(`forge`). No hubo errores ni advertencias en la consola del navegador. El
harness temporal usado exclusivamente para esta revisión fue eliminado y el
servidor local fue detenido.

## Evidencia de validación

La validación local se ejecutó con Node `24.14.0` y pnpm `11.9.0`:

| Validación | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Aprobada; lockfile sin cambios |
| `pnpm verify` | Aprobada; 78 pruebas, TypeScript, lint, build y secretos |
| Pruebas unitarias Gym/renderer | 22/22 aprobadas |
| `pnpm test:db` | 8/8 aprobadas |
| `pnpm test:auth` | 19/19 aprobadas |
| `pnpm test:admin` | 14/14 aprobadas |
| `pnpm test:client` | 12/12 aprobadas |
| `pnpm test:operations` | 8/8 aprobadas |
| `pnpm test:content` | 38/38 aprobadas |
| `pnpm test:media-seed` | 5/5 aprobadas |
| `pnpm test:media` | 11/11 aprobadas |
| `pnpm test:templates` | 13/13 aprobadas después de `test:prepare-media` |
| `pnpm test:onboarding` | 5/5 aprobadas |
| Suites E2E oficiales | 10/10 aprobadas en 7 suites |
| `pnpm audit --json` | Critical 0, High 0, Moderate 0, Low 0 |
| `git diff --check` | Aprobada |

Lint conserva las seis advertencias históricas `no-img-element`; el renderer
nuevo utiliza el adaptador `next/image` y no añade advertencias. La revisión de
buenas prácticas React confirmó que el único límite cliente nuevo está aislado
al filtro efímero de clases y que no agrega fetching, estado persistente en
navegador ni dependencias de terceros.

## Decisión para la etapa siguiente

Una autorización posterior deberá decidir, de forma separada, si se incorpora
`gym-pulso-v1` al manifest y al registry y si se crea una versión de plantilla
Gym para preview. Esa autorización no debe implicar automáticamente catálogo
público, selección, publicación, restauración, editor u onboarding.
