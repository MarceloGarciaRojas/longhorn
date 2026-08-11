# Etapa 10A.3: contrato de contenido `gym.v1`

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Etapa:** 10A.3
- **Fecha:** 2026-08-09
- **Estado:** AUDITADA; LISTA PARA REVISIÓN HUMANA
- **Base:** `8edf1ccb6898817bd0150b07ce80a73d4c2442da`
- **Rama:** `codex/etapa-10a3-gym-v1`

## 1. Objetivo y límites

Esta etapa implementa el contrato editorial y técnico de contenido estructurado
`gym.v1` para sitios cuya industria confiable en base de datos es `gym`. El
incremento permite validar y persistir borradores de Gimnasio y resolver sus
referencias multimedia de manera explícita.

La etapa no incorpora renderer, plantilla, editor, preview, onboarding ni
publicación Gym. Tampoco incorpora la Landing Pulso Club ni sus recursos al
runtime. Gym continúa sin disponibilidad comercial.

## 2. Contrato tipado

`GymContentV1` modela de forma cerrada:

- identidad y logotipo;
- hero y llamada a solicitar contacto o clase de prueba;
- método y pilares;
- categorías, clases e intensidad;
- horarios informativos con entrenador opcional y capacidad informativa;
- entrenadores;
- planes y beneficios;
- instalaciones y galería;
- ubicación, horarios de atención, contacto y redes sociales;
- SEO;
- variantes visuales `volt`, `studio` y `forge`.

No existe un `Record<string, unknown>` como contrato principal. Los objetos
rechazan claves adicionales, los enums son cerrados y las asociaciones entre
categorías, clases, entrenadores y horarios se validan antes de persistir.

## 3. Registro de schemas y comportamiento fail-closed

El registro funcional contiene exclusivamente:

| Industria | Schema | Versión | Borrador | Renderer | Publicación |
| --- | --- | --- | --- | --- | --- |
| Restaurant | `restaurant.v1` | 1 | Operativo | Operativo | Operativa |
| Restaurant | `restaurant.v2` | 2 | Operativo | Operativo | Operativa |
| Gym | `gym.v1` | 1 | Operativo | **0** | **Bloqueada** |

El despacho exige la combinación exacta industria/schema/versión. No hay
fallback a Restaurant ni registro dinámico de schemas. `gym.v2`, schemas
desconocidos y cruces Restaurant/Gym se rechazan.

## 4. Validación y determinismo

El validador `gym.v1` aplica:

- límites de tamaño, cantidad y longitud;
- UUID válidos;
- horarios `HH:mm` coherentes;
- teléfonos, correo y URLs HTTPS;
- rechazo de contenido ejecutable;
- unicidad de identificadores y órdenes;
- referencias existentes entre entidades;
- normalización y orden estable;
- semántica accesible de texto alternativo;
- checksum SHA-256 estable sobre contenido canónico;
- ausencia de mutación del objeto de entrada.

Las llamadas a la acción son exclusivamente solicitudes informativas. No se
implementan reservas, cupos transaccionales, pagos ni captura de leads.

## 5. Multimedia

El extractor Gym recorre solamente estos roles aprobados:

- `identity.logo`;
- `hero.media`;
- `classes.{n}.media`;
- `trainers.{n}.media`;
- `facilities.{n}.media`;
- `gallery.{n}.media`.

No se recorre JSON arbitrario. La referencia debe pertenecer al mismo tenant y
sitio, estar disponible y contar con sus tres variantes procesadas. PostgreSQL
comprueba además que el `field_path` sea compatible con el schema propietario;
un campo Restaurant no puede registrarse en un borrador Gym y viceversa.

## 6. Persistencia y migración 0014

`0014_gym_v1_content_contract` amplía únicamente el constraint de borradores
para aceptar `gym.v1` versión 1. El trigger de consistencia obtiene la industria
desde `public.sites`, conserva la exigencia de asignación activa para Restaurant
y permite Gym solo mientras no exista una asignación activa de plantilla.

La restricción de `site_content_publications` permanece limitada a Restaurant.
Esta decisión es deliberada: todavía no existe plantilla ni renderer Gym y
habilitar snapshots publicables en este punto abriría un estado que el runtime
no puede representar de forma segura. La ampliación de publicaciones se difiere
hasta una etapa que entregue renderer, compatibilidad de plantilla y prueba de
restauración completa.

El `down` restaura las funciones y constraints anteriores. Rechaza el rollback
si todavía existen borradores `gym.v1`, evitando pérdida silenciosa de datos.
La prueba automatizada ejecuta `UP → DOWN → UP` antes de crear fixtures Gym.

No se modificaron migraciones históricas, RLS ni schemas Restaurant.

## 7. Seguridad y aislamiento

- La industria se deriva server-side desde el sitio persistido.
- RLS continúa aislando borradores y referencias por `tenant_id`.
- Un tenant ajeno no puede leer ni guardar un borrador Gym conocido por UUID.
- El Cliente Administrador no puede mutar `industry_key`.
- Un sitio Restaurant no acepta `gym.v1`.
- Un sitio Gym no acepta `restaurant.v1` ni `restaurant.v2`.
- Un sitio Gym no puede recibir una plantilla Restaurant.
- Un borrador Gym no puede publicarse ni previsualizarse sin renderer.

## 8. Fixtures y cobertura

Se incorporan fixtures sintéticos para contenido completo, mínimo válido, sin
imágenes, variantes Volt/Studio/Forge, contenido largo, horarios parciales,
clase sin entrenador y plan no destacado.

Las pruebas cubren validación positiva y negativa, enums, límites, XSS,
asociaciones rotas, accesibilidad, extracción multimedia, determinismo,
no-mutación, idempotencia, cruce de tenants, cruce de industrias, RLS,
persistencia real, migración reversible y publicación fail-closed.

## 9. Estado funcional por rubro

| Flujo | Restaurant | Gym después de 10A.3 |
| --- | --- | --- |
| Schema | `restaurant.v1`/`restaurant.v2` | `gym.v1` |
| Borrador estructurado | Operativo | Operativo y aislado |
| Extractor multimedia | Operativo | Operativo y cerrado |
| Catálogo | 3 plantillas | 0 plantillas |
| Renderer | 4 renderers | 0 renderers |
| Preview | Operativo | Bloqueado |
| Editor | Operativo | No implementado |
| Publicación/restauración | Operativa | Bloqueada |
| Onboarding | Operativo | No implementado |

## 10. Exclusiones ratificadas

- No se implementó renderer Gym.
- No se creó plantilla Gym.
- No se implementó editor Gym.
- No se implementó onboarding Gym.
- No se habilitó publicación ni restauración Gym.
- No se incorporó Pulso Club al runtime.
- No se modificó el ZIP Pulso Club.
- No se incorporaron Tienda Online, RestApp, PosApp ni Colegio.
- No se habilitó staging ni producción.
- Esta etapa no autoriza merge.

## 11. Regresión Restaurant

| Plantilla | Preview | Selección | Publicación | Restauración | Onboarding |
| --- | --- | --- | --- | --- | --- |
| Classic | Sí | Sí | Sí | Sí | Sí |
| Modern | Sí | Sí | Sí | Sí | Sí |
| Editorial | Sí | Sí | Sí | Sí | Sí |

No se modificaron HTML, CSS, renderers, seeds canónicos ni componentes visuales
Restaurant. El catálogo conserva exactamente tres plantillas Restaurant.

## 12. Evidencia local

- Node `24.14.0` y pnpm `11.9.0` usados para la cadena reproducible.
- `pnpm install --frozen-lockfile`: aprobado, sin cambios de lockfile.
- `pnpm verify`: 65/65 ejecuciones aprobadas.
- suites DB, auth, admin, client, operations, content, media, templates y
  onboarding: 120/120 ejecuciones aprobadas.
- suites E2E: 10/10 ejecuciones aprobadas con las preparaciones de datos del
  workflow oficial.
- total local registrado: 195/195 ejecuciones aprobadas.
- migración 0014: `UP → DOWN → UP` aprobada.
- lint: 0 errores y 6 advertencias `no-img-element` heredadas.
- escaneo de secretos: 286 archivos de texto, sin hallazgos.
- audit: critical 0, high 0, moderate 0, low 0.
- `git diff --check`, enlaces Markdown y archivos grandes nuevos: aprobados.
- patches y lockfile: intactos.
- ZIP Pulso Club: SHA-256
  `70833E4A72C592DFB5253659B74D32E77415895CE5EED0D9DF5274EE3E3FC072`.

La CI alojada del incremento funcional aprobó en el SHA
`f4a69b919da3e4069fbd35ad67d2adf51b5038c0`: run `31351895214`, job
`93344171346`, resultado `SUCCESS`, duración 3 min 26 s y cero deployments.

## 13. Auditoría final 10A.3-M

La puerta 10A.3-M repitió de forma independiente la auditoría el 2026-08-10
sobre la base `8edf1ccb6898817bd0150b07ce80a73d4c2442da` y el incremento funcional
`f4a69b919da3e4069fbd35ad67d2adf51b5038c0`.

- instalación congelada con Node `24.14.0` y pnpm `11.9.0`: aprobada;
- migración 0014 `UP → DOWN → UP` y RLS: 8/8 pruebas aprobadas;
- `pnpm verify`: 65/65 ejecuciones aprobadas;
- suites DB, auth, admin, client, operations, content, media, templates y
  onboarding: 120/120 ejecuciones aprobadas;
- E2E con los resets oficiales: 10/10 ejecuciones aprobadas;
- total independiente: 195/195 ejecuciones aprobadas;
- matriz adicional de checksum ante cambios de clase, entrenador, plan,
  horario, apariencia y medio: 7/7 comprobaciones aprobadas;
- lint: 0 errores y las mismas 6 advertencias heredadas;
- audit: critical 0, high 0, moderate 0, low 0;
- lockfile, patches, migraciones históricas y ZIP Pulso Club: intactos;
- renderer Gym: 0; plantillas Gym: 0; preview, editor, onboarding y publicación
  Gym: no habilitados.

La auditoría no modificó código funcional, migraciones, pruebas, dependencias,
HTML, CSS ni recursos visuales.

## 14. Siguiente etapa

Tras la revisión humana de `gym.v1`, la siguiente etapa puede preparar el
renderer Pulso Club contra este contrato. Debe conservar el registro cerrado,
añadir una única plantilla Gym con variantes controladas y demostrar preview,
publicación y restauración antes de ampliar el constraint de publicaciones.
