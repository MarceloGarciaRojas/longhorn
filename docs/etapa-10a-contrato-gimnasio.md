# Etapa 10A.1: contrato de incorporación de la Landing Gimnasio

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Etapa:** 10A.1
- **Fecha:** 2026-08-08
- **Estado:** **CONTRATO GIMNASIO DEFINIDO; IMPLEMENTACIÓN NO AUTORIZADA**
- **Naturaleza:** análisis, contrato y diseño técnico
- **Base analizada:** `444afcd5a25ee97631db60becf8153f71ce3e717`

Este documento fija el contrato que una futura incorporación del rubro Gimnasio
deberá respetar. No incorpora el proyecto Pulso Club al runtime, no implementa
`gym.v1`, no generaliza el núcleo y no autoriza migraciones, staging ni
producción.

## 1. Identidad e integridad del insumo

| Dato | Valor verificado |
| --- | --- |
| Archivo | `plantillas/pulso-club-sitio.zip` |
| SHA-256 | `70833E4A72C592DFB5253659B74D32E77415895CE5EED0D9DF5274EE3E3FC072` |
| Tamaño comprimido | 180.653 bytes |
| Archivos | 28 |
| Tamaño descomprimido | 689.539 bytes |
| Estado Git | Excluido mediante `/plantillas/` |

El checksum fue verificado nuevamente antes de redactar este contrato y
coincide exactamente con el inventario inicial. El ZIP no contiene `.env`
reales, secretos conocidos, `node_modules`, builds ni imágenes raster. No se
ejecutó el proyecto original, no se instalaron sus dependencias y el ZIP no se
modificó.

### 1.1 Inventario técnico original

- Next.js 16.2.6, React 19.2.6, TypeScript y Vinext 0.0.50.
- PostCSS/Tailwind en el toolchain del starter.
- Drizzle y D1 preparados, pero con schema vacío y bindings deshabilitados.
- Superficies públicas `/` y `/clases`.
- Superficie demostrativa `/admin`, sin autenticación real.
- Un stylesheet global con las apariencias Volt, Studio y Forge y controles de
  composición.
- Cuatro SVG; no existen fotografías ni otros medios raster.
- `package-lock.json` y `pnpm-lock.yaml` simultáneos, con señales de desfase
  respecto de `package.json`.
- Pruebas heredadas del starter que referencian archivos y una dependencia
  ausentes.

El original se utiliza únicamente como referencia de experiencia. Su runtime,
configuración, dependencias, persistencia y autenticación no son una base de
implementación para nexi.

## 2. Decisión sobre Volt, Studio y Forge

**MODELO VISUAL RECOMENDADO: OPCIÓN B — UNA PLANTILLA CON TRES VARIANTES
VISUALES CONTROLADAS.**

La inspección del original demuestra que las tres apariencias comparten:

- el mismo árbol de componentes y estructura DOM;
- el mismo orden de secciones;
- la misma navegación y página `/clases`;
- los mismos hero, tarjetas, planes, horarios y footer;
- los mismos breakpoints y comportamiento responsive;
- las mismas interacciones y jerarquía semántica;
- los mismos controles de composición.

Volt, Studio y Forge se aplican mediante `data-theme` y sustituyen tokens de
color. Los controles de hero, método, títulos, peso visual, columnas y espaciado
son ejes independientes de la paleta. Por lo tanto, crear tres registros de
plantilla duplicaría renderer, contrato y mantenimiento sin representar tres
composiciones diferentes.

La futura plantilla conceptual será una única identidad de catálogo para gym,
con un renderer compatible con `gym.v1`. Su configuración de presentación
permitirá:

- `variant`: `volt`, `studio` o `forge`;
- hero: texto a izquierda, texto a derecha o apilado;
- método: composición izquierda, derecha o apilada;
- escala de títulos: compacta, grande o impacto;
- peso de medios: compacto, equilibrado o inmersivo;
- columnas de clases: dos, tres o cuatro, sujetas al viewport;
- espaciado: compacto, amplio o cinematográfico.

Estas opciones serán enums cerrados validados server-side. No habilitarán CSS,
HTML, JavaScript, colores arbitrarios ni layouts libres. La variante y la
composición pertenecerán a la configuración versionada de la publicación, no a
`localStorage` ni al dispositivo del visitante.

### 2.1 Tokens cromáticos de referencia

| Variante | Fondo | Texto | Panel | Acento | Tratamiento |
| --- | --- | --- | --- | --- | --- |
| Volt | `#eef1e8` | `#111411` | `#171a17` | `#c8ff32` | Identidad predeterminada negro/lima |
| Studio | `#edf4f6` | `#10191d` | `#102a35` | `#68dcff` | Variante luminosa azul hielo |
| Forge | `#f1ede6` | `#191817` | `#24211f` | `#ff6534` | Variante grafito/naranja |

Los valores son referencia de preservación. La implementación deberá comprobar
contraste antes de aprobar cada combinación.

## 3. Contrato conceptual de contenido `gym.v1`

`gym.v1` será un contrato tipado y validado. El nombre es tentativo hasta que
la ampliación de alcance sea autorizada. No existe todavía en código ni base de
datos.

### 3.1 Estructura mínima

| Dominio | Campos conceptuales | Reglas principales |
| --- | --- | --- |
| Identidad | nombre, descriptor, logo opcional | Nombre obligatorio; logo mediante referencia multimedia autorizada |
| Hero | título, subtítulo, CTA, medio opcional, variante autorizada | Un CTA principal; debe funcionar sin medio |
| Método | título, descripción, pilares ordenados | Pilares con identificador estable, título y texto breve |
| Clases | id, nombre, descripción, intensidad, duración, categoría, visibilidad, CTA opcional | Duración positiva; intensidad y categoría controladas; sin cupo transaccional |
| Programación | id, clase, entrenador opcional, día, hora, duración, capacidad informativa, visibilidad | Referencias internas válidas; la capacidad no representa disponibilidad |
| Entrenadores | id, nombre, especialidad, descripción, imagen opcional, visibilidad | Sin datos privados; imagen mediante multimedia nexi |
| Planes | id, nombre, precio informativo, periodicidad, beneficios, destacado, visibilidad | Precio es texto comercial; no inicia cobro ni suscripción |
| Ubicación | dirección, referencias, ciudad, enlace de mapa | Enlaces permitidos y validados |
| Horarios | día, apertura, cierre, estado cerrado | Cobertura semanal consistente y horarios válidos |
| Contacto | teléfono, correo, WhatsApp, redes sociales | Formatos y URLs validados; datos públicos explícitos |
| SEO | title, description, datos estructurados compatibles | Límites de longitud y generación segura server-side |
| Apariencia | variante, hero, método, títulos, medios, columnas, espaciado | Solo valores del catálogo cerrado de presentación |

Los elementos repetibles utilizarán identificadores estables y orden explícito
cuando sean necesarios para edición, referencias y restauración. No se agregan
reservas, socios, asistencia, pagos ni otros datos operacionales a `gym.v1`.

### 3.2 Clases y horarios

En Gimnasio B1, clases y programación son contenido público estructurado. El
catálogo puede filtrar por categoría, intensidad u otros valores presentes en
el contrato aprobado. La programación muestra clase, entrenador, día, hora,
duración y una capacidad meramente informativa.

La interfaz no podrá afirmar disponibilidad en tiempo real ni confirmar una
reserva. Quedan excluidos cupos transaccionales, bloqueos, lista de espera,
calendario privado, asistencia y membresía operacional.

### 3.3 CTA “Solicitar clase de prueba”

El CTA expresará una solicitud, nunca una reserva confirmada. El núcleo actual
no dispone de un formulario público genérico de leads suficientemente separado
de onboarding y soporte autenticado. No se reutilizarán esos dominios de forma
forzada.

La implementación futura tendrá dos opciones compatibles con B1:

1. utilizar un módulo público de solicitudes/leads autorizado, asociado a tenant
   y sitio, con validación, rate limit, auditoría e idempotencia; o
2. mientras ese módulo no exista, dirigir a un canal de contacto configurado
   —WhatsApp, correo o teléfono— con lenguaje de solicitud.

En ambos casos la UI indicará que el equipo contactará al interesado. No se
creará una reserva para resolver el CTA.

## 4. Contrato de preservación funcional

| Función original | Decisión | Contrato futuro | Justificación |
| --- | --- | --- | --- |
| Landing `/` | Adaptar | Reproducirla con contenido `gym.v1` y renderer nexi | Preserva experiencia sin contenido fijo ni aplicación duplicada |
| Página `/clases` | Adaptar | Vista pública derivada del mismo snapshot publicado | Evita una fuente de contenido paralela |
| Navegación | Adaptar | Conservar navegación y menú móvil; retirar accesos administrativos | La administración solo ocurre desde nexi |
| Filtros | Preservar con adaptación | Filtrar contenido publicado en cliente, sin modificar datos | Interacción informativa sin backend operacional |
| Horarios | Adaptar | Datos estructurados, ordenados y validados | Sustituye arrays fijos |
| Clases | Adaptar | Catálogo público estructurado y visible | No representa inventario de cupos |
| Entrenadores | Adaptar | Entidades de contenido públicas y opcionales | Reutiliza nombres de programación y concepto del panel demo |
| Planes | Adaptar | Información comercial sin checkout | Pagos y membresías operacionales quedan fuera |
| Contacto | Adaptar | Datos públicos validados por sitio | Evita valores fijos del demo |
| Apariencia | Adaptar | Variante y layout cerrados dentro de la publicación | Sustituye `localStorage` por estado versionado |
| Conceptos del panel | Adaptar | Incorporarlos al editor nexi de Gimnasio | No se reutiliza el panel independiente |
| `/admin` | Excluir | No existirá en la landing | Contradice la frontera de acceso nexi |
| “Acceso del dueño” | Excluir | Ningún enlace administrativo público | Regla de producto y seguridad |
| Login demo | Excluir | Autenticación nexi vigente | El original acepta cualquier credencial |
| Credenciales demo | Excluir | No copiar, mostrar ni sembrar | Son datos demostrativos inseguros |
| Reserva simulada | Reemplazar | CTA de solicitud no confirmada | B1 no incluye reserva operacional |
| Persistencia local | Reemplazar | Draft/publicación PostgreSQL y estado server-side | `localStorage` no es autoridad ni multi-tenant |
| D1/Drizzle original | Excluir | PostgreSQL, repositorios y RLS de Longhorn | El schema original está vacío |
| Autenticación ChatGPT | Excluir | Proveedor desacoplado y sesiones opacas de nexi | No corresponde al modelo de identidad aprobado |
| Worker/hosting del starter | Excluir | Runtime y configuración de Longhorn | Evita dos estrategias de despliegue |
| Lockfiles/dependencias originales | Excluir | Dependencias bloqueadas del repositorio Longhorn | Los manifiestos originales están desalineados |
| Pruebas heredadas | Excluir | Nueva matriz de pruebas nexi | Las pruebas del starter están rotas y no cubren Pulso Club |

## 5. Contrato de preservación visual

| Elemento | Clasificación | Contrato |
| --- | --- | --- |
| Paleta Volt | **PRESERVACIÓN EXACTA** | Mantener tokens negro/lima como apariencia predeterminada |
| Paletas Studio y Forge | **PRESERVACIÓN EXACTA** | Mantener sus tokens como variantes del mismo renderer |
| Tipografía | **PRESERVACIÓN CON ADAPTACIÓN** | Conservar peso, escala y carácter condensado usando fuentes con licencia y fallback seguro |
| Geometría CSS | **PRESERVACIÓN EXACTA** | Mantener órbitas, numeración y composición abstracta cuando no exista medio |
| Hero | **PRESERVACIÓN CON ADAPTACIÓN** | Misma jerarquía y layouts permitidos; texto y medios vendrán de `gym.v1` |
| Tarjetas de clases | **PRESERVACIÓN CON ADAPTACIÓN** | Conservar jerarquía visual; contenido, cantidad y orden serán dinámicos |
| Tarjetas de planes | **PRESERVACIÓN CON ADAPTACIÓN** | Mantener destacado y tratamiento visual sin habilitar pago |
| Botones y CTA | **PRESERVACIÓN CON ADAPTACIÓN** | Mantener forma y jerarquía; cambiar semántica de reservar a solicitar |
| Navegación pública | **PRESERVACIÓN CON ADAPTACIÓN** | Mantener navegación/móvil; retirar “Mi cuenta” y enlaces a `/admin` |
| Orden de secciones | **PRESERVACIÓN EXACTA** | Hero, atributos, método, clases, planes, ubicación y footer por defecto |
| Espaciado | **PRESERVACIÓN EXACTA** | Mantener presets compacto, amplio y cinematográfico |
| Grillas | **PRESERVACIÓN CON ADAPTACIÓN** | Mantener opciones autorizadas con colapso responsive seguro |
| Página de clases | **PRESERVACIÓN CON ADAPTACIÓN** | Misma jerarquía, filtros y tarjetas; datos desde publicación |
| Horario | **PRESERVACIÓN CON ADAPTACIÓN** | Mantener lectura día/hora/clase/coach; retirar disponibilidad real |
| Ubicación y contacto | **PRESERVACIÓN CON ADAPTACIÓN** | Mantener composición con datos configurados y enlaces seguros |
| Footer | **PRESERVACIÓN CON ADAPTACIÓN** | Mantener estructura; retirar acceso administrativo y demo legal fijo |
| Responsive | **PRESERVACIÓN EXACTA** | Mantener intención y comportamiento en los viewports contractuales |
| Hover | **PRESERVACIÓN EXACTA** | Mantener respuesta visual sin depender solo del color |
| Foco | **PRESERVACIÓN CON ADAPTACIÓN** | Mejorar foco visible para todos los controles y enlaces |
| Animaciones | **PRESERVACIÓN EXACTA** | No agregar animaciones arbitrarias; conservar scroll suave con reducción de movimiento |
| Panel `/admin` | **NO PRESERVAR** | Solo sus conceptos de edición se trasladan al panel nexi |

La preservación exacta expresa invariantes visuales, no reutilización literal
del CSS global. El renderer futuro podrá usar CSS modular siempre que las
comparaciones visuales aprobadas demuestren equivalencia.

## 6. Administración futura desde nexi

El recorrido autorizado será:

`nexi → login → Mis soluciones / Mis sitios → Gimnasio`

El Cliente Administrador podrá editar mediante formularios estructurados:

- identidad, hero y método;
- clases, categorías y programación pública;
- entrenadores visibles;
- planes informativos;
- ubicación, horarios y contacto;
- redes sociales y SEO;
- medios y textos alternativos;
- variante visual y opciones de layout permitidas.

Se reutilizarán el borrador único por sitio, preview privado, revisión,
publicación, snapshots inmutables, restauración, multimedia, auditoría e
idempotencia. La futura UI despachará el editor por schema compatible. Nunca
ofrecerá acceso a HTML, CSS, JavaScript, tablas, identificadores de tenant ni
controles libres de layout.

## 7. Generalización mínima del núcleo

La generalización deberá resolver solo `restaurant` y `gym`. No se creará una
abstracción universal para rubros todavía no incorporados.

| Área actual | Acoplamiento encontrado | Cambio mínimo futuro |
| --- | --- | --- |
| `templates.industry_key` | CHECK exclusivo para `restaurant` | Aceptar exclusivamente `restaurant` y `gym` mediante migración nueva |
| Drafts/publications | CHECK limitado a `restaurant.v1/v2` | Añadir la pareja exacta `gym.v1`/1 sin debilitar versiones existentes |
| Tipos de contenido | `RestaurantAnyContent` en tipos compartidos | Unión discriminada por schema key y versión |
| Schema dispatch | Solo validadores restaurant | Registrar explícitamente el validador `gym.v1` cuando se implemente |
| Renderer manifest | Solo renderers restaurant | Añadir un renderer gym con compatibilidad exacta, sin fallback |
| Renderer registry | Validación y componentes restaurant | Despacho tipado por contrato antes de renderizar |
| Capacidades | Sets y orden de catálogo restaurant | Capacidades explícitas por renderer e industria |
| Servicio de contenido | Queries `industry_key='restaurant'` y tipos restaurant | Derivar industria confiable del sitio/asignación y validar compatibilidad |
| Referencias multimedia | Solo extracción `restaurant.v2` | Dispatcher tipado de referencias para `gym.v1` |
| Editor cliente | Render condicional de editores restaurant | Despacho cerrado por schema hacia el futuro editor gym |
| Catálogo | Consulta y orden exclusivos restaurant | Filtrar por industria confiable del sitio y renderer compatible |
| Seeds | Solo tres plantillas y contenido restaurant | Seed gym separado, determinista e idempotente, sin alterar los tres actuales |
| Publicación | `RestaurantAnyContent` en diff y transacción | Generalizar el tipo; conservar una sola transacción de publicación |
| Restauración | Validación tipada solo restaurant | Restaurar según schema/versión/renderer históricos registrados |
| Onboarding | Configuración, schema y transformación restaurant | Adaptador gym independiente en una etapa posterior |
| Pruebas | Matrices centradas en restaurant | Agregar gym y conservar regresión completa de las tres plantillas actuales |

La migración histórica `restaurant.v1` seguirá soportada para lectura,
restauración y recorridos vigentes. Incorporar gym no autoriza eliminar ni
reescribir compatibilidad histórica.

## 8. Estrategia tipada de schemas

La frontera compartida deberá utilizar una unión discriminada equivalente a:

```text
restaurant.v1 + versión 1 + RestaurantContent
restaurant.v2 + versión 2 + RestaurantContentV2
gym.v1        + versión 1 + GymContentV1
```

Cada miembro conserva `schemaKey`, `schemaVersion` y `content` asociados. El
dispatcher acepta `unknown` únicamente en la frontera de entrada, valida y
devuelve el miembro tipado. No se sustituirán los contratos por
`Record<string, unknown>`.

El manifest comprobará renderer, schema y rango de versión. Un schema,
renderer o combinación desconocidos deberán fallar cerrados. Draft,
publicación y restauración preservarán la pareja discriminante y no inferirán
tipo desde el contenido JSON.

## 9. Publicación y restauración

`gym.v1` reutilizará las primitivas existentes:

1. draft versionado y revisión optimista;
2. preview privado del draft;
3. aprobación vinculada cuando corresponda;
4. checksum de sitio, revisión, template version, schema y contenido;
5. `publishContentTransaction` como única transacción de publicación;
6. `current_publication_id` como puntero público;
7. snapshots inmutables;
8. restauración histórica de template, contenido y medios.

No se crearán `publishGym` ni `restoreGym` como sistemas paralelos. Las partes
que requieren adaptación son los tipos compartidos, schema dispatcher,
extracción multimedia, comparación de contenido, queries de catálogo y filtros
de industria. Las reglas transaccionales, idempotencia, concurrencia,
inmutabilidad y puntero público deben permanecer comunes.

## 10. Catálogo de plantillas

El sitio tendrá una industria confiable determinada en backend. El catálogo
consultará plantillas activas de la misma industria y luego comprobará schema,
versión, renderer y capacidad.

- Un sitio `restaurant` verá exactamente Classic, Modern y Restaurante
  Editorial, con su orden actual.
- Un sitio `gym` verá únicamente la plantilla Gimnasio compatible con `gym.v1`.
- Volt, Studio y Forge se elegirán dentro de esa plantilla como variantes
  controladas, no como tres plantillas.
- Un UUID de template ajeno o incompatible se rechazará aunque el navegador lo
  envíe directamente.
- No existirá fallback de renderer ni conversión implícita entre industrias.

## 11. Estrategia futura de onboarding

Onboarding de gimnasio no forma parte de 10A.1 ni debe implementarse junto con
la primera generalización. Cuando sea autorizado, utilizará
`gym_onboarding.v1`, con preguntas propias y una transformación determinista a
`gym.v1`.

Podrá reutilizar solicitudes, casos, checklist, estados, revisión, conversión,
idempotencia, aprobación y publicación. No reutilizará
`restaurant_onboarding.v1`, sus preguntas ni su transformador. La compatibilidad
de industria, onboarding schema, template y content schema deberá validarse en
backend y base de datos.

## 12. Multimedia

El sistema multimedia actual será la única infraestructura de medios. Los roles
conceptuales de Gimnasio son:

- `hero`;
- `trainer`;
- `class`;
- `facility`;
- `gallery`.

Cada referencia incluirá asset autorizado, texto alternativo y condición
decorativa. Los medios deberán pertenecer al mismo tenant y sitio, y el preview
privado no expondrá rutas públicas no autorizadas. Publicaciones y
restauraciones conservarán snapshots y referencias históricas.

El ZIP no contiene fotografías. Por ello el renderer debe mantener una
composición completa mediante geometría CSS cuando no haya medio, aceptar
medios opcionales cuando existan y no convertir una imagen en requisito de
publicación salvo que el contrato futuro lo autorice expresamente.

## 13. SVG y licencias

Los cuatro SVG quedan clasificados como **NO AUTORIZADOS PARA REUTILIZACIÓN
DIRECTA HASTA VERIFICAR PROCEDENCIA/LICENCIA**.

| Asset | Uso observado | Clasificación | Tratamiento futuro |
| --- | --- | --- | --- |
| `public/favicon.svg` | Icono configurado por el starter; no representa la “P” de Pulso | Decorativo y reemplazable | Crear un favicon propio y autorizado |
| `public/file.svg` | Asset genérico sin uso funcional identificado | Decorativo, innecesario | No incorporar |
| `public/globe.svg` | Asset genérico sin uso funcional identificado | Decorativo, innecesario | No incorporar |
| `public/window.svg` | Asset genérico sin uso funcional identificado | Decorativo, innecesario | No incorporar |

La identidad “PULSO” y su marca circular se representan mediante texto y CSS;
son reproducibles con componentes propios. Ningún SVG inventariado es necesario
para preservar la identidad visual contractual.

## 14. Brechas de compatibilidad

| Área | Original Pulso Club | nexi actual | Estrategia futura |
| --- | --- | --- | --- |
| Autenticación | Login demo y helper ChatGPT opcional | Proveedor desacoplado, sesiones opacas y AAL2 admin | Excluir original y reutilizar nexi |
| Persistencia | Arrays React y `localStorage` | PostgreSQL transaccional | Contenido en drafts/publications |
| Administración | `/admin` público e inseguro | Panel cliente y back office protegidos | Editor gym dentro de nexi |
| Multi-tenancy | Inexistente | `tenant_id`, contexto server-side y RLS | Aplicar a todos los recursos gym |
| Base de datos | D1/Drizzle vacío | PostgreSQL con migraciones | No importar D1 ni schema original |
| Publicación | Inexistente | Preview, publicación inmutable y restauración | Reutilizar primitivas comunes |
| Multimedia | Sin fotografías; SVG locales | Biblioteca y referencias por tenant/sitio | Roles gym sobre sistema existente |
| Configuración | `localStorage` y data attributes | Configuración validada y snapshot publicado | Guardar opciones cerradas en contenido |
| Build | Starter Vinext/Cloudflare propio | Toolchain Longhorn bloqueado | No importar configuración ni worker |
| Dependencias | Versiones y lockfiles desalineados | `pnpm` y lockfile reproducible | No añadir dependencias del original |
| Rutas | `/`, `/clases`, `/admin` | Resolución pública por sitio y paneles separados | Mapear vistas públicas; excluir `/admin` |
| Seguridad | Credenciales demo y autorización solo visual | Backend, membresía, RLS, auditoría | Fallo cerrado y pruebas cross-tenant |
| Auditoría | Inexistente | Eventos de plataforma y contenido | Registrar mutaciones y publicaciones gym |
| Tests | Starter roto y sin cobertura funcional | Suites unitarias, integración, DB y E2E | Matriz gym más regresión restaurant |

## 15. Migraciones futuras probables

No se crea ninguna migración en 10A.1. Una futura etapa autorizada deberá añadir
una migración nueva, reversible y probada que probablemente:

1. amplíe `templates_industry_valid` de `restaurant` a la lista cerrada
   `restaurant`, `gym`;
2. amplíe los CHECK de `site_content_drafts` y
   `site_content_publications` para admitir exactamente `gym.v1` versión 1;
3. adapte las validaciones de cambio de asignación para comprobar industria y
   schema sin hardcode exclusivo de restaurant;
4. preserve todas las restricciones actuales de `restaurant.v1/v2`;
5. mantenga índices, tenant consistency, RLS, triggers e inmutabilidad;
6. incorpore seed gym solo cuando exista contrato implementado y renderer
   registrado.

Onboarding gym requerirá una migración posterior independiente para ampliar sus
CHECK de industria, schema de respuestas y aprobación. No se mezclará esa
ampliación con B1 si onboarding no forma parte de la etapa ejecutable aprobada.
Ninguna migración histórica será editada.

## 16. Seguridad obligatoria

La implementación futura exigirá:

- `tenant_id` y `site_id` consistentes en recursos multi-tenant;
- tenant derivado de sesión, host o recurso confiable en backend;
- RLS en tablas nuevas o ampliadas;
- autorización server-side por membresía, rol, acción y recurso;
- AAL2 para operaciones internas que ya lo requieran;
- UUID tratados como localizadores, nunca como autorización;
- rechazo cross-tenant para contenido, templates, preview y multimedia;
- catálogo filtrado por industria y schema;
- preview privado sin indexación ni filtración pública;
- publicación y restauración con idempotencia, revisión y auditoría;
- validación de URLs, textos, enums, referencias y tamaño de payload;
- ausencia de rutas administrativas y secretos en el sitio público.

Gimnasio B1 no requiere datos sensibles comparables con el futuro portal
Colegio. No se incorporarán datos privados de socios, salud, asistencia ni
pagos.

## 17. Compatibilidad Vinext

El original no importa imágenes raster ni assets que requieran cálculo de
dimensiones. El hero utiliza geometría CSS; los SVG se referencian por rutas
públicas y no necesitan metadata estática. Los futuros medios se resolverán
mediante la biblioteca multimedia dinámica de nexi.

**DEUDA VINEXT: NO BLOQUEANTE PARA GIMNASIO B1.**

La implementación no debe introducir imports estáticos que activen la ruta
prohibida por `vinext@0.0.50.patch`. Si el diseño posterior exige esa capacidad,
el patch deberá reevaluarse antes de implementarla, sin modificarlo dentro de
la etapa de Gimnasio.

## 18. Matriz futura de pruebas

### 18.1 Contrato, contenido y compatibilidad

- Validador de `gym.v1` en modos draft y publication.
- Rechazo de campos desconocidos, referencias inválidas, tamaños excesivos y
  enums fuera del catálogo.
- Unión discriminada y dispatcher para `restaurant.v1`, `restaurant.v2` y
  `gym.v1`.
- Manifest/registry sin claves duplicadas, fallback ni combinaciones
  incompatibles.
- Catálogo gym aislado del catálogo restaurant.
- Regresión completa de Classic, Modern y Restaurante Editorial.

### 18.2 Persistencia y seguridad

- Migración forward/rollback y restricciones de schema/industria.
- RLS y rechazo de lectura/escritura entre Tenant A y Tenant B.
- Intentos con UUID de sitio, template, publicación y medios ajenos.
- Preview privado, selección, guardado, publicación y restauración autorizados.
- Concurrencia, idempotencia y revisión obsoleta.
- Restauración de publicaciones gym y recorridos históricos restaurant.

### 18.3 Accesibilidad

| Área | Evidencia futura requerida |
| --- | --- |
| Skip link | Visible al foco y lleva al contenido principal |
| Teclado | Menú, filtros, CTA y controles accesibles sin puntero |
| Foco | Indicador visible y orden lógico en todas las variantes |
| Semántica | Un `main`, un `h1`, jerarquía H2/H3 y landmarks correctos |
| Contraste | Texto, acento, foco y estados aprobados en Volt/Studio/Forge |
| Targets táctiles | Controles utilizables en móvil sin solapamiento |
| Movimiento | `prefers-reduced-motion` desactiva scroll o transiciones no esenciales |
| Sin medios | Contenido y CTA comprensibles sin imágenes |
| Filtros | Estado seleccionado anunciado y resultados comprensibles |

### 18.4 Responsive y preservación visual

Se validarán `/` y la vista pública de clases para Volt, Studio y Forge en:

- 320×640;
- 375×812;
- 768×1024;
- 1280×800;
- 1600×900.

Cada combinación comprobará navegación, hero, método, clases, filtros,
programación, entrenadores visibles, planes, contacto, footer, overflow,
legibilidad, foco y consola. Se crearán comparaciones visuales contra capturas
aprobadas del original en una etapa que autorice su ejecución controlada.

### 18.5 Flujo completo

- Editor nexi → guardar draft → preview privado → publicar → resolución pública.
- Cambio de variante sin pérdida de contenido.
- Restauración recupera contenido, variante, renderer y referencias multimedia.
- CTA utiliza lenguaje de solicitud y nunca muestra reserva confirmada.
- Sitio público no contiene `/admin`, “Acceso del dueño” ni credenciales demo.
- Build, `pnpm verify`, suites DB/E2E completas, escaneo de secretos y audit.

## 19. Alcance Gimnasio B1

### 19.1 Incluido

- landing pública;
- página pública de clases;
- horarios y filtros informativos;
- entrenadores públicos;
- planes informativos;
- ubicación y contacto;
- CTA “Solicitar clase de prueba”;
- contenido estructurado;
- administración mediante nexi;
- draft, preview, publicación y restauración;
- multimedia existente;
- una plantilla con variantes Volt, Studio y Forge;
- opciones visuales estructuradas y autorizadas.

### 19.2 Fuera de B1

- reserva operacional y confirmación de cupos;
- cupos reales y lista de espera;
- gestión de socios y membresías operacionales;
- asistencia y calendarios privados;
- cobros y pagos;
- acceso de entrenador;
- automatizaciones e integraciones externas;
- panel independiente del gimnasio;
- autenticación o infraestructura del starter;
- onboarding de gimnasio, salvo autorización posterior específica.

## 20. Riesgos y dependencias

| Riesgo | Nivel | Mitigación contractual |
| --- | --- | --- |
| Ampliación no autorizada del MVP | Crítico | Bloqueo expreso antes de cualquier implementación |
| Regresión de las tres plantillas restaurant | Alto | Generalización mínima y matriz de regresión obligatoria |
| Importar `/admin` o persistencia simulada | Alto | Exclusión explícita y revisión de rutas públicas |
| Mezclar contenido informativo con reservas | Alto | CTA de solicitud y ausencia de entidades operacionales |
| Debilitar tipado con JSON genérico | Alto | Unión discriminada y validadores por schema |
| Mostrar templates de otra industria | Alto | Industria server-side, compatibilidad cerrada y pruebas cross-tenant |
| Multiplicar plantillas por paleta | Medio | Una plantilla con tres variantes controladas |
| Falta de capturas doradas del original | Medio | Generarlas solo en una etapa de ejecución controlada |
| Falta de fotografías en el ZIP | Medio | Diseño CSS completo y medios opcionales |
| SVG sin procedencia | Medio | No reutilizarlos y crear assets propios autorizados |
| Módulo de leads todavía no definido | Medio | Fallback explícito a contacto sin reserva |
| Patch Vinext | Bajo para B1 | Evitar imports estáticos con metadata; medios dinámicos |

## 21. Bloqueo de gobierno

El alcance histórico del MVP permanece limitado al rubro restaurante. Este
contrato no modifica esa decisión ni autoriza desarrollo funcional.

**LA IMPLEMENTACIÓN DEL RUBRO GIMNASIO REQUIERE AUTORIZACIÓN EXPRESA DEL PRODUCT
OWNER PARA AMPLIAR EL ALCANCE B1 DE NEXI.**

La autorización debe anteceder a cualquier migración, generalización del
núcleo, implementación de `gym.v1`, renderer, catálogo, editor, onboarding o
integración funcional de Pulso Club.

## 22. Criterios de salida de 10A.1

- checksum e identidad del ZIP verificados;
- inventario original preservado y fuera de Git;
- modelo Volt/Studio/Forge decidido explícitamente;
- contratos visual, funcional y de contenido definidos;
- alcance B1 y exclusiones delimitados;
- generalización mínima y migraciones futuras identificadas sin implementarlas;
- publicación, restauración, onboarding y multimedia diseñados por reutilización;
- brechas, seguridad, licencias, accesibilidad y pruebas documentadas;
- deuda Vinext clasificada como no bloqueante para B1;
- documentación e índice validados;
- ninguna modificación funcional, dependencia o migración;
- Pull Request documental en borrador, sin merge;
- bloqueo de gobierno pendiente y visible.

## 23. Validación documental ejecutada

La validación se ejecutó con Node.js 24.14.0 y pnpm 11.9.0, sin utilizar las
dependencias ni el runtime del ZIP original.

| Validación | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Aprobada; lockfile vigente y 493 paquetes instalados |
| `pnpm verify` | Aprobada; lint con 0 errores y 6 advertencias heredadas, typecheck, 52 pruebas, build y escaneo de secretos |
| Escaneo de secretos | Aprobado; 274 archivos de texto revisados |
| `pnpm audit --audit-level low` | Aprobada; 0 vulnerabilidades conocidas |
| Enlaces Markdown modificados | Aprobados; todos los destinos locales existen |
| Archivos grandes modificados | Ninguno; contrato 33.476 bytes e índice 8.841 bytes |
| `git diff --check` | Aprobada |
| Alcance del diff | Exclusivamente este contrato y `docs/README.md` |

Las seis advertencias `no-img-element` corresponden a deuda heredada ya
documentada y no fueron introducidas por 10A.1.

## 24. Declaraciones de cierre

El ZIP original no fue modificado.

La Landing Gimnasio todavía no fue incorporada al runtime de nexi.

No se implementó `gym.v1`.

No se crearon migraciones.

No se añadieron dependencias.

No se modificó código funcional.

No se habilitó staging.

No se habilitó producción.

No se incorporaron las demás soluciones pendientes.

## 25. Recomendación

**SOLICITAR AUTORIZACIÓN DE AMPLIACIÓN DE ALCANCE B1 AL RUBRO GIMNASIO**
