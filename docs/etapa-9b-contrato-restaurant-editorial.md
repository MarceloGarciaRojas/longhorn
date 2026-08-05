# Etapa 9B.1: contrato de la plantilla Restaurante Editorial

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Versión del contrato:** 1
- **Fecha:** 2026-08-04
- **Línea base:** `042261587df0bf8aeae04a49eea862d5de1e489b`
- **Entornos autorizados:** local y CI
- **Estado:** RENDERER IMPLEMENTADO, AÚN NO REGISTRADO

Este documento delimita la tercera plantilla de restaurante. No registra un
renderer, no incorpora datos al catálogo, no modifica `restaurant.v2` y no hace
que la plantilla esté disponible en los paneles o en sitios públicos.

## A. Evidencia inspeccionada

El contrato se basa en la implementación vigente y no solamente en documentos
históricos.

| Área | Evidencia principal | Estado observado |
| --- | --- | --- |
| Esquemas y tipos | `site/src/content/types.ts`, `restaurant-schema.ts`, `restaurant-v2-schema.ts`, `schema-dispatch.ts` | `restaurant.v1` y `restaurant.v2`; v2 sustituye referencias bundled por usos multimedia tipados |
| Renderers | `renderer-manifest.ts`, `renderer-registry.tsx`, `renderers/restaurant-classic.*`, `renderers/restaurant-media.*` | Registro cerrado; Classic v2 y Modern v1 comparten `RestaurantMediaRenderer` con distinta composición CSS |
| Catálogo | `site/src/content/service.server.ts`, migraciones `0010` y `0011` | Filtrado server-side por rubro, estado, esquema, versión y renderer registrado |
| Datos sintéticos | `site/scripts/db/seed.ts`, `site/scripts/media/seed.ts` | Dos plantillas de restaurante operativas en `restaurant.v2`; datos ficticios y aislados |
| Preview y selección | Rutas `app/cuenta/**/plantillas`, `app/nexi-interno/**/plantillas`, `clientChangeTemplate`, `adminAssignTemplate` | Preview privado y auditado; seleccionar no publica; concurrencia e idempotencia existentes |
| Multimedia | `site/src/media/*`, `content/media-references.server.ts`, migración `0011` | Variantes `thumbnail`, `card` y `hero`; referencias por tenant/sitio; originales privados |
| Publicación y restauración | `publishContentTransaction`, `restorePublication`, `resolvePublicSite` | Snapshot inmutable; puntero atómico; restauración crea una publicación nueva con plantilla y medios históricos |
| Onboarding | `site/src/onboarding/*`, migración `0012`, ADR-008 | Aprobación vinculada a revisión, plantilla, esquema y checksum; el cambio de plantilla la invalida |
| Pruebas | `restaurant-v2.test.ts`, `template-flow.test.ts`, `content-flow.test.ts`, E2E de contenido, multimedia y onboarding | Compatibilidad, preview, cambio, publicación, restauración, RLS, idempotencia y concurrencia cubiertos |

### Plantillas existentes

| Plantilla visible | Template key | Renderer | Esquema | Implementación |
| --- | --- | --- | --- | --- |
| Restaurante Estación | `restaurant-classic` | `restaurant-classic-v2` | `restaurant.v2` | `RestaurantMediaRenderer`, diseño `classic` |
| Restaurante Horizonte | `restaurant-modern` | `restaurant-modern-v1` | `restaurant.v2` | `RestaurantMediaRenderer`, diseño `modern` |

`restaurant-classic-v1` permanece como renderer compatible con
`restaurant.v1`; es una versión heredada y no constituye una tercera plantilla
`restaurant.v2`.

### Acoplamientos y deuda observados

- Classic v2 y Modern v1 comparten estructura React; gran parte de su
  diferenciación depende de una hoja CSS minificada.
- El esquema no tiene galería, logo, cocina o especialidad, productos
  destacados, focal point, orden de secciones ni tokens visuales por tenant.
- El catálogo se aprovisiona en local y CI mediante seed; el mecanismo
  productivo sigue pendiente.
- El orden del selector se deriva de `display_name` y versión; no existe una
  columna de orden editorial.
- Las tarjetas de catálogo usan previews CSS, no capturas del renderer real.
- `seo.title` y `seo.description` se validan, pero su integración como metadata
  de ruta es una responsabilidad transversal distinta del renderer.
- Existen seis advertencias heredadas `no-img-element`; la tercera plantilla no
  debe incrementar ese número.

## B. Identidad técnica

| Propiedad | Contrato |
| --- | --- |
| Template key | `restaurant-editorial` |
| Renderer key | `restaurant-editorial-v1` |
| Nombre visible | Restaurante Editorial |
| Rubro | `restaurant` |
| Esquema admitido | `restaurant.v2` |
| Versión de esquema | 2 |
| Versión inicial de plantilla | 1 |
| Activación | Opcional y explícita |
| Selección automática | Prohibida |
| Entornos | Local y CI |
| Estado | Contrato aprobado para implementación posterior; implementación pendiente |

Las claves son identificadores estables. Una evolución incompatible del diseño
debe usar una nueva versión del renderer o de la plantilla; no debe cambiar
silenciosamente el significado de `restaurant-editorial-v1`.

## C. Objetivo de experiencia

Restaurante Editorial favorece negocios cuya historia, atmósfera y propuesta
gastronómica necesitan una presentación sobria y narrativa: restaurantes de
autor, bistrós, cocinas de temporada y espacios donde la fotografía propia
aporta contexto. La plantilla no debe afirmar que un negocio pertenece a uno de
esos segmentos; solo ofrece una composición adecuada para ellos.

Principios:

1. jerarquía tipográfica marcada y ritmo de lectura pausado;
2. protagonismo de la historia antes de recorrer la carta completa;
3. imágenes del tenant como evidencia, nunca imágenes comerciales incorporadas
   por el renderer;
4. menú legible aun sin fotografías;
5. espacios amplios, contraste suficiente y acciones inequívocas;
6. mobile-first, sin perder el orden semántico al crear composiciones
   asimétricas en escritorio;
7. contenido separado del diseño, sin HTML o CSS editable.

### Diferenciación

| Dimensión | Classic v2 | Modern v1 | Editorial v1 |
| --- | --- | --- | --- |
| Lenguaje | Cálido, serif y tradicional | Contemporáneo, geométrico y redondeado | Narrativo, tipográfico y de ritmo editorial |
| Hero | División equilibrada texto/imagen | Paneles redondeados y color frío | Composición asimétrica con imagen dominante y bloque de lectura |
| Historia | Bloque informativo | Bloque informativo | Sección protagonista inmediatamente después del hero |
| Carta | Tarjetas en cuadrícula | Tarjetas elevadas | Categorías tipográficas y filas amplias; imagen secundaria |
| Multimedia | Hero y tarjetas | Hero y tarjetas | Hero, selección visual derivada y composición editorial limitada |
| Superficie | Papel cálido | Verde/azul claro | Neutros de alto contraste con acento sobrio |

La diferencia no puede limitarse a cambiar colores, radios o tipografía sobre
el mismo marcado. La implementación posterior necesita una estructura
presentacional propia, manteniendo el mismo contrato de contenido.

### Experiencia móvil

- lectura lineal: identidad, hero, historia, propuesta, carta, visita y cierre;
- navegación visible, envuelta o condensada sin depender de JavaScript;
- imagen después del texto que contextualiza;
- una columna y objetivos táctiles de al menos 44 por 44 CSS px;
- carta consultable sin desplazamiento horizontal.

### Experiencia de escritorio

- hero e historia pueden usar asimetría visual, pero el DOM conserva el orden
  lógico;
- ancho de lectura acotado para párrafos largos;
- menú en una o dos columnas editoriales según densidad;
- imágenes con proporciones controladas y sin desplazar acciones esenciales.

### Límites de personalización

El tenant modifica únicamente los campos estructurados y sus medios
autorizados. No puede elegir fuentes, colores, CSS, estructura, orden de
secciones o HTML. No se incorporan temas libres, bloques arbitrarios ni
opciones de layout en `restaurant.v2`.

## D. Mapa de secciones

### 1. Encabezado y navegación

- **Objetivo:** identificar el negocio y ofrecer saltos breves a contenido real.
- **Campos:** `identity.business_name`; presencia de las secciones destino.
- **Con datos:** muestra el nombre y enlaces a historia, carta y visita.
- **Sin opcionales:** omite enlaces a redes o destinos que no se rendericen.
- **Multimedia:** ninguna; `restaurant.v2` no contiene logo.
- **Responsive:** distribución horizontal en escritorio; envoltura o bloque
  compacto en móvil, sin menú oculto inaccesible.
- **Accesibilidad:** `header`, `nav` con nombre, enlace de salto y foco visible.
- **Orden:** primero.
- **Ocultamiento:** el encabezado no se oculta; cada enlace sí depende de su
  destino.

### 2. Hero editorial

- **Objetivo:** comunicar la propuesta principal y conducir a la acción.
- **Campos:** `identity.short_description`, `hero.headline`,
  `hero.subheadline`, `hero.primary_cta_*`, `hero.media`.
- **Con datos:** texto y CTA se muestran siempre en publicación; la imagen ocupa
  el plano visual principal si su referencia se resuelve.
- **Sin imagen:** cambia a composición tipográfica; no carga stock ni reutiliza
  medios de otro campo.
- **Multimedia:** `hero.media`, variante `hero`.
- **Responsive:** una columna en móvil; dos planos asimétricos en escritorio.
- **Accesibilidad:** único `h1`; alternativa de la imagen según
  `decorative/altText`; CTA con nombre visible.
- **Orden:** segundo.
- **Ocultamiento:** nunca en una publicación válida.

### 3. Identidad e historia

- **Objetivo:** dar protagonismo a la trayectoria y personalidad del negocio.
- **Campos:** `identity.tagline`, `about.title`, `about.description`.
- **Con datos:** muestra etiqueta, encabezado y texto en un ancho de lectura
  controlado.
- **Sin opcionales:** estos campos son obligatorios al publicar; en preview de
  borrador los vacíos no se sustituyen por narrativa inventada.
- **Multimedia:** no existe imagen específica de historia.
- **Responsive:** texto lineal en móvil; composición desplazada o en columnas
  en escritorio.
- **Accesibilidad:** `section` con `aria-labelledby`, `h2` y párrafos.
- **Orden:** tercero.
- **Ocultamiento:** solo en preview de un borrador completamente vacío; nunca
  en publicación válida.

### 4. Propuesta gastronómica

- **Objetivo:** introducir la carta antes de recorrer categorías y productos.
- **Campos:** `identity.short_description`, `menu.section_title` y, cuando
  corresponda, descripciones de categorías.
- **Con datos:** encabezado editorial y resumen existente.
- **Sin opcionales:** omite descripciones de categoría vacías.
- **Multimedia:** ninguna obligatoria.
- **Responsive:** ancho de lectura acotado y espaciado fluido.
- **Accesibilidad:** `h2`; no repite contenido solo para decorar.
- **Orden:** cuarto.
- **Ocultamiento:** no se oculta en publicación válida.

### 5. Categorías del menú

- **Objetivo:** permitir navegación visual y semántica por la carta.
- **Campos:** `menu.categories[*].id/name/description/order` y relación con
  `menu.items[*].category_id`.
- **Con datos:** categorías ordenadas por `order`; solo se presentan productos
  con `availability=true`.
- **Sin descripción:** conserva el encabezado y omite el párrafo.
- **Multimedia:** ninguna a nivel de categoría.
- **Responsive:** categorías apiladas; nunca pestañas que oculten contenido sin
  controles accesibles.
- **Accesibilidad:** cada categoría es una sección con encabezado identificable.
- **Orden:** quinto.
- **Ocultamiento:** una categoría sin productos disponibles no se muestra.

### 6. Productos y selección visual

- **Objetivo:** presentar nombre, descripción, precio informado y disponibilidad
  sin convertir el renderer en sistema de pedidos.
- **Campos:** `menu.items[*].name/description/price_text/availability/order/media`.
- **Con datos:** muestra todos los productos disponibles en orden estable.
- **Sin precio:** omite el precio; nunca muestra cero, “consultar” u otro valor
  inventado.
- **Sin imagen:** usa una fila tipográfica, no una imagen genérica.
- **Multimedia:** `item.media`, variante `card`.
- **Responsive:** una columna en móvil; hasta dos columnas editoriales en
  escritorio.
- **Accesibilidad:** `article` o lista semántica; precio asociado al producto.
- **Orden:** dentro de cada categoría.
- **Ocultamiento:** productos con `availability=false`.

`restaurant.v2` no tiene un indicador de producto destacado. El renderer no
debe etiquetar elementos como “destacados”. Si la composición visual adelanta
una selección, debe tomar un máximo acotado de productos disponibles en el
orden ya validado, sin cambiar su significado ni omitirlos del menú completo.

### 7. Composición multimedia

- **Objetivo:** reforzar la narrativa con fotografías ya vinculadas al
  contenido.
- **Campos:** `hero.media` y medios no nulos de `menu.items[*]`.
- **Con datos:** usa activos únicos y un orden determinista derivado del menú.
- **Con una imagen:** no crea una galería; la imagen permanece en su sección
  original.
- **Sin imágenes:** la sección no existe.
- **Multimedia:** variantes `hero` o `card` según el uso original.
- **Responsive:** mosaico solo cuando hay espacio; secuencia lineal en móvil.
- **Accesibilidad:** conserva el `altText` de cada uso; no duplica una imagen
  informativa con el mismo texto alternativo en la misma vista.
- **Orden:** después de la carta o integrado entre categorías, nunca antes de
  que exista contexto textual.
- **Ocultamiento:** menos de dos imágenes únicas elegibles.

Limitación: el esquema no ofrece una galería independiente, captions, focal
point ni orden multimedia. No se deben inferir ni agregar esos datos.

### 8. Horarios

- **Objetivo:** comunicar disponibilidad semanal de forma inequívoca.
- **Campos:** los siete elementos de `hours[*]`.
- **Con datos:** día, rango de apertura y nota; los días cerrados se identifican
  textualmente.
- **Sin nota:** muestra solo horario o estado cerrado.
- **Multimedia:** ninguna.
- **Responsive:** filas legibles; etiqueta y valor pueden apilarse en móvil.
- **Accesibilidad:** días y valores en lista o tabla semánticamente equivalente;
  “cerrado” no se comunica solo con color.
- **Orden:** octavo.
- **Ocultamiento:** no se oculta; el esquema siempre contiene siete días.

### 9. Ubicación y contacto

- **Objetivo:** permitir encontrar y contactar al restaurante.
- **Campos:** `contact.address_line`, `contact.city`, `contact.public_phone`,
  `contact.public_email`, `contact.whatsapp_phone`, `contact.map_url`.
- **Con datos:** dirección, ciudad, teléfono y correo; mapa y WhatsApp solo si
  existen.
- **Sin opcionales:** omite enlaces de mapa y WhatsApp sin dejar controles
  vacíos.
- **Multimedia:** no existe mapa embebido ni imagen específica.
- **Responsive:** una columna en móvil; información y horarios pueden convivir
  en dos columnas en escritorio.
- **Accesibilidad:** enlaces `tel:`, `mailto:` y HTTPS con texto descriptivo.
- **Orden:** noveno.
- **Ocultamiento:** la sección no se oculta en publicación válida.

No se incrustan proveedores de mapas, scripts, iframes ni geolocalización.

### 10. Redes sociales

- **Objetivo:** ofrecer enlaces externos declarados por el tenant.
- **Campos:** `social.instagram_url`, `facebook_url`, `tiktok_url`.
- **Con datos:** muestra únicamente las redes con URL HTTPS válida.
- **Sin datos:** la sección se omite completamente.
- **Multimedia:** no requiere iconos externos; el nombre textual es suficiente.
- **Responsive:** lista envuelta y táctil.
- **Accesibilidad:** nombres completos y aviso semántico normal de enlace
  externo mediante texto o contexto.
- **Orden:** junto a contacto o antes del CTA final.
- **Ocultamiento:** los tres campos vacíos.

### 11. Llamada a la acción final

- **Objetivo:** repetir la acción principal después de la información de visita.
- **Campos:** `hero.primary_cta_label/type/target`.
- **Con datos:** reutiliza exactamente la acción validada del hero.
- **Sin datos:** en preview vacío se omite; en publicación los campos son
  obligatorios.
- **Multimedia:** ninguna.
- **Responsive:** ancho completo en móvil y tamaño intrínseco en escritorio.
- **Accesibilidad:** enlace descriptivo, foco visible y objetivo táctil mínimo.
- **Orden:** penúltimo.
- **Ocultamiento:** solo preview de borrador sin CTA válida.

### 12. Pie de página

- **Objetivo:** cerrar con identidad legal y canales esenciales.
- **Campos:** `footer.legal_name`, `copyright_text`,
  `identity.business_name`, `contact.public_email` y redes existentes.
- **Con datos:** usa nombre legal cuando existe; si no, nombre comercial.
- **Sin copyright:** omite el texto, sin generarlo a partir del año o la marca.
- **Multimedia:** ninguna.
- **Responsive:** columnas en escritorio y secuencia lineal en móvil.
- **Accesibilidad:** `footer`, enlaces descriptivos y orden lógico.
- **Orden:** último.
- **Ocultamiento:** no se oculta; el contenido opcional se reduce.

## E. Contrato de contenido

La obligatoriedad indicada corresponde al modo `publication`. En modo `draft`
varios textos pueden estar vacíos, pero el renderer no debe inventar valores
para llenar la preview.

| Ruta `restaurant.v2` | Consumo | Pub. | Formato y validación vigente | Fallback o vacío | Riesgo de longitud |
| --- | --- | --- | --- | --- | --- |
| `identity.business_name` | Header, footer | Req. | Texto seguro, máximo 120 | Ninguno | Medio en navegación |
| `identity.short_description` | Hero, propuesta | Req. | Texto seguro, máximo 280 | Ninguno | Alto; limitar ancho, no truncar contenido esencial |
| `identity.tagline` | Historia | Req. | Texto seguro, máximo 100 | Ninguno | Medio |
| `hero.headline` | H1 | Req. | Texto seguro, máximo 140 | Ninguno | Alto; usar tipografía fluida y wrap |
| `hero.subheadline` | Hero | Req. | Texto seguro, máximo 320 | Ninguno | Alto |
| `hero.primary_cta_label` | CTA | Req. | Texto seguro, máximo 60 | Omitir solo en draft vacío | Medio en móvil |
| `hero.primary_cta_type` | CTA | Req. | `menu`, `phone`, `whatsapp` o `map` | Ninguno | Bajo |
| `hero.primary_cta_target` | CTA | Req. | `#menu`, teléfono válido o URL HTTPS según tipo; máximo 500 | Omitir CTA en draft inválido | Bajo visual; alto de seguridad ya validado |
| `hero.media` | Hero | Opc. | `null` o `{assetId,altText,decorative}` exacto | Hero tipográfico | Bajo textual |
| `hero.media.assetId` | Resolución media | Cond. | UUID | No resolver si `media=null` | Bajo |
| `hero.media.altText` | Accesibilidad | Cond. | 1–250 si informativa; vacío si decorativa; sin ejecutables | Ninguno | Medio |
| `hero.media.decorative` | Accesibilidad | Cond. | Booleano | Ninguno | Bajo |
| `about.title` | Historia H2 | Req. | Texto seguro, máximo 120 | Ninguno | Medio |
| `about.description` | Historia | Req. | Texto seguro, máximo 1200 | Ninguno | Alto; ancho de lectura y párrafos preservados sin cortar |
| `menu.section_title` | Propuesta/carta H2 | Req. | Texto seguro, máximo 120 | Ninguno | Medio |
| `menu.categories` | Carta | Req. | 1–8 en publicación | Ninguno | Densidad alta con 8 |
| `menu.categories[*].id` | Relaciones/DOM | Req. | UUID único | No visible | Bajo |
| `menu.categories[*].name` | H3 | Req. | Texto seguro, máximo 80 | Ninguno | Medio |
| `menu.categories[*].description` | Introducción de categoría | Opc. | Texto seguro, máximo 240 | Omitir párrafo | Alto |
| `menu.categories[*].order` | Orden | Req. | Entero 0–100, único | Ninguno | Bajo |
| `menu.items` | Carta | Req. | 1–40 en publicación | Ninguno | Alto con 40 elementos |
| `menu.items[*].id` | Identidad | Req. | UUID único | No visible | Bajo |
| `menu.items[*].category_id` | Agrupación | Req. | UUID de categoría existente | Ninguno | Bajo |
| `menu.items[*].name` | Producto | Req. | Texto seguro, máximo 100 | Ninguno | Medio |
| `menu.items[*].description` | Producto | Req. | Texto seguro, máximo 300 | Ninguno | Alto |
| `menu.items[*].price_text` | Producto | Opc. | Texto seguro, máximo 40 | Omitir precio | Medio |
| `menu.items[*].availability` | Visibilidad | Req. | Booleano | `false` oculta el producto | Bajo |
| `menu.items[*].order` | Orden | Req. | Entero 0–200, único por categoría | Ninguno | Bajo |
| `menu.items[*].media` | Producto/galería derivada | Opc. | Mismo contrato multimedia que hero | Fila tipográfica | Bajo textual |
| `hours` | Horarios | Req. | Exactamente siete días únicos | Ninguno | Medio |
| `hours[*].day` | Horarios | Req. | Enum de lunes a domingo | Ninguno | Bajo |
| `hours[*].is_open` | Horarios | Req. | Booleano | Ninguno | Bajo |
| `hours[*].opening_time` | Horarios | Cond. | `HH:mm`, menor que cierre si abre; vacío si cierra | “Cerrado” textual | Bajo |
| `hours[*].closing_time` | Horarios | Cond. | `HH:mm`, mayor que apertura si abre; vacío si cierra | “Cerrado” textual | Bajo |
| `hours[*].note` | Horarios | Opc. | Texto seguro, máximo 120 | Omitir nota | Medio |
| `contact.public_email` | Contacto/footer | Req. | Correo, máximo 254 | Ninguno | Medio visual |
| `contact.public_phone` | Contacto | Req. | Teléfono, máximo 25 | Ninguno | Bajo |
| `contact.whatsapp_phone` | Contacto | Opc. | Teléfono, máximo 25 | Omitir enlace | Bajo |
| `contact.address_line` | Visita | Req. | Texto seguro, máximo 200 | Ninguno | Alto |
| `contact.city` | Visita | Req. | Texto seguro, máximo 100 | Ninguno | Medio |
| `contact.map_url` | Visita | Opc. | URL HTTPS, máximo 500 | Omitir enlace | Bajo visual |
| `social.instagram_url` | Redes | Opc. | URL HTTPS, máximo 500 | Omitir red | Bajo visual |
| `social.facebook_url` | Redes | Opc. | URL HTTPS, máximo 500 | Omitir red | Bajo visual |
| `social.tiktok_url` | Redes | Opc. | URL HTTPS, máximo 500 | Omitir red | Bajo visual |
| `seo.title` | Metadata de ruta, no markup visible | Req. | Texto seguro, máximo 70 | Sin fallback del renderer | Bajo |
| `seo.description` | Metadata de ruta, no markup visible | Req. | Texto seguro, máximo 160 | Sin fallback del renderer | Bajo |
| `footer.legal_name` | Footer | Opc. | Texto seguro, máximo 160 | `identity.business_name` | Medio |
| `footer.copyright_text` | Footer | Opc. | Texto seguro, máximo 200 | Omitir | Medio |

El objeto completo rechaza claves desconocidas, HTML o patrones ejecutables y
supera como máximo 65.536 bytes serializados. Los IDs, relaciones, órdenes,
horarios, URLs, teléfonos y correos se validan antes del renderer.

El renderer tiene prohibido fijar o inferir nombres de platos, precios,
teléfonos, horarios, direcciones, redes, promociones o datos de otro tenant.
Los ejemplos futuros deben provenir exclusivamente del seed sintético.

## F. Contrato multimedia

### Activos y variantes

| Uso | Fuente | Variante | Ancho máximo procesado | Presentación recomendada |
| --- | --- | --- | ---: | --- |
| Hero | `hero.media` | `hero` | 1600 | Plano dominante; relación visual aproximada 4:5 o 3:2 |
| Producto | `menu.items[*].media` | `card` | 768 | 4:3 o retrato acotado mediante CSS |
| Composición derivada | Medios únicos de productos | `card` | 768 | Mosaico limitado, sin duplicar significado |
| Selector/biblioteca | Activo existente | `thumbnail` | 320 | No forma parte del sitio público editorial |

El procesamiento conserva proporción, no amplía imágenes pequeñas, normaliza a
WebP y elimina metadata. No se agrega otra dependencia ni otra variante.

### Reglas

- La imagen principal solo usa `hero.media`.
- Una composición multimedia puede reutilizar medios de productos únicamente
  con orden determinista y sin inventar una galería persistida.
- Sin imagen, se refluye el layout; no se usa stock, URL externa o bundled de
  otro sitio.
- `altText` y `decorative` se respetan exactamente. Una imagen informativa
  requiere texto alternativo; una decorativa lleva `alt=""`.
- El hero puede cargar de forma prioritaria. Productos y composición se cargan
  de forma diferida y con dimensiones declaradas para limitar layout shift.
- CSS puede usar `object-fit`, pero el esquema no contiene focal point. El
  recorte debe ser conservador, centrado y probado con retrato, paisaje y
  cuadrado.
- El renderer recibe un `MediaRenderManifest`; no consulta object keys, rutas
  ni tablas.
- Un uso no resuelto se trata como imagen ausente, nunca como permiso para
  solicitar una URL arbitraria.
- Preview utiliza rutas privadas autorizadas y `no-store`.
- Publicación utiliza únicamente URLs content-addressed de la publicación
  actual.
- Restauración copia referencias históricas, reactiva los activos archivados
  necesarios y genera una publicación nueva.
- PostgreSQL exige coincidencia de tenant, sitio, propietario y activo `ready`
  con las tres variantes. Un UUID conocido no concede acceso.
- Los originales permanecen privados.

## G. Contrato responsive

| Rango de verificación | Comportamiento mínimo |
| --- | --- |
| Móvil pequeño, 320–360 CSS px | Una columna, navegación envuelta, sin overflow, CTA a ancho disponible, imágenes después de su texto |
| Móvil, 361–599 CSS px | Una columna, tipografía fluida, carta tipográfica, objetivos táctiles de 44 px |
| Tablet, 600–899 CSS px | Hero aún lineal o asimetría moderada; menú de una o dos columnas según contenido |
| Escritorio, 900–1439 CSS px | Hero asimétrico, ancho de lectura acotado, carta hasta dos columnas |
| Escritorio amplio, 1440 CSS px o más | Contenedor máximo; aumenta espacio, no longitud de línea ni número ilimitado de columnas |

Reglas generales:

- `clamp()` o tokens equivalentes para tipografía y espaciado;
- el DOM mantiene el orden móvil aunque CSS cambie la composición;
- imágenes fluidas con dimensiones y `object-fit` controlado;
- textos y URLs usan wrapping seguro;
- tablas no son necesarias para la carta;
- botones y enlaces no se superponen ni dependen de hover;
- ninguna acción esencial queda fuera de viewport;
- zoom al 200 % mantiene contenido y funcionalidad;
- la navegación no requiere un script nuevo.

## H. Contrato de accesibilidad

La implementación futura aprueba solo si demuestra:

1. un `main`, un único `h1` y jerarquía `h2`/`h3` sin saltos por motivos
   visuales;
2. enlace “Saltar al contenido” visible al recibir foco;
3. `nav` con nombre accesible y destinos presentes;
4. recorrido completo con teclado, sin trampa y con foco `:focus-visible`;
5. contraste mínimo WCAG AA: 4,5:1 para texto normal, 3:1 para texto grande y
   componentes;
6. imágenes informativas con `altText`, decorativas con alternativa vacía y
   lectura comprensible si todas fallan;
7. enlaces con texto descriptivo; no se usan “haz clic aquí” ni iconos sin
   nombre;
8. CTA distinguible del texto y con objetivo mínimo de 44 por 44 CSS px;
9. estados como cerrado o no disponible expresados textualmente, no solo por
   color;
10. ausencia de movimiento indispensable; cualquier animación futura respeta
    `prefers-reduced-motion`;
11. ausencia de pérdida de contenido o desplazamiento horizontal a 320 CSS px
    y con zoom al 200 %;
12. orden de lectura semántico idéntico al orden lógico móvil.

La verificación debe combinar aserciones de HTML renderizado, teclado manual y
matriz de viewports. No se autoriza una dependencia nueva solo para este bloque.

## I. Contrato del renderer

### Ubicación propuesta

- `site/src/content/renderers/restaurant-editorial.tsx`
- `site/src/content/renderers/restaurant-editorial.module.css`

La implementación debe ser estructuralmente independiente para evitar que
Editorial sea una variación superficial de `RestaurantMediaRenderer`. Puede
reutilizar tipos y utilidades puras, pero una extracción desde renderers
existentes solo se admite con regresión explícita de Classic y Modern.

### Firma propuesta

```ts
export function RestaurantEditorialRenderer(input: {
  content: RestaurantContentV2;
  media: MediaRenderManifest;
  preview?: boolean;
}): ReactNode;
```

Contrato de ejecución:

1. `renderer-registry.tsx` deberá validar `content` mediante
   `validateRestaurantV2Content(content, validationMode)` antes de invocar el
   componente.
2. `renderer-manifest.ts` deberá declarar exclusivamente compatibilidad con
   `restaurant.v2`, versión mínima y máxima 2.
3. `renderRegisteredTemplate` seguirá siendo la única entrada pública al
   registro.
4. Un renderer desconocido o un esquema incompatible produce
   `UnknownRendererError`/estado no disponible; nunca hace fallback silencioso
   a Classic o Modern.
5. El componente retorna React semántico y no ejecuta consultas, no recibe
   `tenant_id`, no accede a secretos y no resuelve medios por su cuenta.
6. `preview=true` muestra la señal privada existente y renderiza el mismo
   contenido y estructura que producción, cambiando solo el contexto de
   entrega multimedia.
7. La publicación conserva `renderer_key`, `template_version_id`, esquema,
   snapshot y referencias.
8. Restaurar una publicación Editorial exige que `restaurant-editorial-v1`
   siga registrado y compatible; si no, falla cerrado.
9. La versión `-v1` es trazable e inmutable en significado.

En 9B.1 no se crean estos archivos ni se modifica el manifiesto ejecutable.

## J. Contrato del catálogo

La incorporación futura deberá usar:

| Propiedad | Valor |
| --- | --- |
| Template key | `restaurant-editorial` |
| Renderer key | `restaurant-editorial-v1` |
| Versión | 1 |
| Nombre visible | Restaurante Editorial |
| Rubro | `restaurant` |
| Schema key | `restaurant.v2` |
| Rango de esquema | 2–2 |
| Estado al habilitar | `active` |
| Preview key | `restaurant-editorial` |
| Activación | Explícita |
| Selección automática | Prohibida |

Reglas:

- IDs del template y de la versión deben ser UUID sintéticos estables y nuevos.
- El seed local/CI debe ser idempotente y no modificar datos de tenants reales.
- El registro cerrado debe existir antes de activar la fila de catálogo.
- El orden será el determinista ya existente: `display_name` y versión
  descendente. No se agrega una columna de orden en esta etapa.
- Administrador nexi AAL2 podrá asignar y previsualizar mediante las operaciones
  existentes.
- Cliente Administrador activo podrá listar, previsualizar y seleccionar solo
  para un sitio propio con borrador `restaurant.v2`.
- La tercera plantilla no será predeterminada para nuevos sitios ni onboarding.
- La landing no anunciará tres plantillas hasta que renderer, catálogo, pruebas
  y CI estén aprobados.

Este contrato no inserta filas, no modifica seeds y no cambia paneles.

## K. Seguridad y multi-tenancy

Invariantes no negociables:

- Todo acceso privado deriva actor y tenant desde la sesión server-side.
- `tenant_id` del navegador nunca es autoridad.
- Contenido, borrador, asignación y activos deben coincidir en tenant y sitio.
- Un UUID conocido de otro tenant devuelve ausencia o acceso denegado.
- El renderer es una función presentacional; no consulta catálogos o datos
  globales.
- Preview de Cliente Administrador exige membresía activa y tenant activo.
- Preview del Administrador nexi exige sesión interna y AAL2.
- Selección y asignación vuelven a validar autorización, estado, esquema,
  renderer, versión, concurrencia e idempotencia en backend.
- El sitio público no contiene enlaces de administración, preview o panel.
- No se alteran RLS, roles, grants o triggers.
- No se requiere `BYPASSRLS`, rol de migración en web ni conexión privilegiada.
- No se incorporan secretos, URLs privadas, object keys o rutas.
- No se conectan fuentes, analítica, mapas, CDN o proveedores externos.
- Caché y resolución pública continúan vinculadas a la publicación actual.

## L. Publicación, restauración y aprobación

Comportamiento futuro obligatorio:

1. registrar o seleccionar Editorial no crea una publicación;
2. preview no cambia asignación, borrador, aprobación ni puntero público;
3. seleccionar cambia la asignación del borrador de forma versionada, pero el
   sitio público conserva su snapshot actual;
4. el cambio se vuelve visible únicamente mediante publicación explícita;
5. cambiar `template_version_id` invalida aprobaciones de onboarding pendientes
   o aprobadas y devuelve el caso a preparación;
6. el checksum vigente incluye `siteId`, revisión del borrador,
   `templateVersionId`, schema key, schema version y contenido;
7. dos publicaciones concurrentes se serializan y producen un único resultado
   válido; los reintentos idempotentes no duplican snapshots;
8. cada publicación guarda la versión de plantilla y copia referencias
   multimedia inmutables;
9. restaurar crea una publicación nueva y recupera contenido, esquema,
   plantilla y medios históricos;
10. onboarding puede preparar o previsualizar Editorial, pero no seleccionarla
    automáticamente ni publicar sin aprobación vigente y acción administrativa
    explícita.

## M. Matriz de pruebas futura

| Prueba | Nivel | Propósito | Evidencia esperada | Aprobación |
| --- | --- | --- | --- | --- |
| Render completo v2 | Unitaria/render | Consumir todos los campos válidos | HTML semántico con H1, secciones y CTA | Sin excepción ni datos fijos |
| Compatibilidad registrada | Unitaria | Aceptar solo Editorial + v2.2 | `rendererIsCompatible` | `true` solo para `restaurant.v2/2` |
| Esquema incompatible | Unitaria | Fallar cerrado para v1, versión distinta y clave desconocida | Excepción controlada | Sin fallback |
| Campos opcionales vacíos | Unitaria/render | Omitir precio, redes, mapa, WhatsApp, footer opcional y medios | HTML sin controles vacíos | Sin placeholders comerciales |
| Contenido máximo | Unitaria/render | Validar wrap y densidad dentro de límites | Caso con máximos de textos, 8 categorías y 40 ítems | Sin overflow ni truncado esencial |
| Sin imágenes | Unitaria/render | Mantener lectura completa | Manifiesto vacío y usos nulos | Sin URL externa ni layout roto |
| Proporciones extremas | Unitaria/manual | Probar retrato, paisaje y cuadrado | Capturas/control visual local | Recorte conservador y sin CLS evitable |
| Alternativas multimedia | Unitaria | Respetar `altText` y `decorative` | Atributos `alt` | Semántica exacta |
| Activo de otro tenant | Integración/RLS | Impedir referencia o entrega cruzada | SQLSTATE/control de operación | Acceso denegado, sin filtración |
| Preview cliente | Integración/E2E | Render privado sin publicar | Ruta noindex, renderer Editorial, puntero intacto | 200 propio; 404 ajeno |
| Preview admin | Integración/E2E | Exigir nexi_admin AAL2 y auditar | Ruta interna y evento | AAL1/cliente rechazados |
| Catálogo compatible | Integración | Listar Editorial solo para v2 y estado activo | Tres opciones compatibles | No aparece para v1/inactivo |
| Selección | Integración | Conservar contenido y publicación actual | Asignación cambia, snapshot público no | Sin mutación pública |
| Idempotencia | Integración | Repetir la misma operación | Una transición/historial | Sin duplicados |
| Concurrencia | Integración | Rechazar versión obsoleta | Dos cambios con misma versión | Uno aprueba, otro conflicto |
| Publicación | Integración/E2E | Publicar snapshot con Editorial | `renderer_key`, template y medios | Una publicación actual válida |
| Restauración | Integración/E2E | Recuperar Classic/Modern/Editorial históricos | Nueva publicación con `restored_from` | Contenido, medios y renderer coinciden |
| Onboarding | Integración/E2E | Invalidar aprobación al cambiar plantilla y volver a aprobar | Estado, checklist y checksum | No publica aprobación obsoleta |
| RLS por UUID conocido | DB/integración | Probar catálogo, preview, medios y sitio ajenos | Consultas/operaciones cruzadas | Cero filas o denegación |
| Administrador nexi | E2E | Asignar/previsualizar con AAL2 | Flujo HTTP real | Autorización y auditoría correctas |
| Cliente Administrador | E2E | Listar, preview y seleccionar | Flujo HTTP real | Solo tenant activo |
| Sitio público | E2E | Resolver por publicación actual | HTML Editorial y medios content-addressed | Sin enlaces administrativos |
| Accesibilidad básica | Render/manual | Verificar semántica, teclado, foco, contraste y alt | Checklist y aserciones HTML | Cumple sección H |
| Responsive | Manual reproducible | Viewports 320, 375, 768, 1024 y 1440 | Evidencia visual local | Sin overflow o pérdida |
| Regresión Classic/Modern | Unitaria/integración/E2E | Evitar cambios accidentales | Suites heredadas | Resultado idéntico |
| Build y CI | Automatizada | Verificar grafo, secretos y dependencias | `pnpm verify`, suites completas y audit | CI verde, advertencias sin aumento |

No se implementa ninguna de estas pruebas en 9B.1.

## N. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación contractual |
| --- | --- | --- |
| Duplicar componentes o helpers | Divergencia y deuda | Componente estructural propio; compartir solo tipos/utilidades puras con regresión de renderers existentes |
| Reducir Editorial a otra clase CSS | No existe tercera experiencia real | Exigir orden y composición propios, no solo colores/radios |
| Acoplar catálogo al seed | No hay aprovisionamiento productivo | Seed solo local/CI; registrar deuda y diseñar promoción antes de staging |
| Preview distinto del sitio público | Aprobación engañosa | Mismo registry, componente y contenido; solo cambia visibilidad de URLs y banner |
| Contenido largo | Overflow y mala lectura | Usar límites existentes, wrapping, ancho de lectura y casos máximos |
| Imágenes con proporciones inesperadas | Recortes o layout shift | Dimensiones declaradas, `object-fit` conservador y matriz retrato/paisaje/cuadrado |
| Cambiar Classic o Modern accidentalmente | Regresión de sitios actuales | Evitar extracción innecesaria; ejecutar suites y E2E heredados |
| Galería y destacados inexistentes | Inferencias comerciales incorrectas | Derivación visual limitada y determinista; sin etiquetas de destacado; documentar limitación |
| Preview CSS del catálogo | No representa el renderer real | Tratarla como miniatura abstracta; validar la preview privada real antes de seleccionar |
| Orden de catálogo implícito | Posición inesperada | Mantener orden alfabético vigente; no prometer que será la tercera tarjeta |
| Renderer retirado rompe restauración | Historial no recuperable | Mantener v1 registrado mientras existan publicaciones; estado `deprecated` antes que eliminación |
| Aprobación onboarding obsoleta | Publicación distinta de la aprobada | Conservar trigger, template ID en checksum y pruebas de invalidación |
| Advertencias heredadas | Ruido o degradación futura | No aumentar seis `no-img-element` ni la advertencia Actions v4; mantenerlas en deuda técnica |
| PostCSS moderado | Riesgo de toolchain | No modificar lockfile; resolver en compuerta previa a staging según DT-001 |
| Documentos oficiales ausentes | Conflictos futuros de alcance | `docs/fuentes` se incorpora de forma controlada; cualquier contradicción se eleva antes de cambiar el contrato |
| Proveedor multimedia no productivo | Bloqueo de staging | Mantener Editorial limitada a local/CI; no conectar servicios en 9B |

## O. Decisión sobre ADR

**No se requiere un ADR nuevo.**

Restaurante Editorial reutiliza decisiones ya aceptadas:

- ADR-001: monolito modular;
- ADR-002: aplicación web responsiva;
- ADR-003 y ADR-004/009: PostgreSQL, tenant confiable y RLS;
- ADR-005 y ADR-012: contrato de object storage y procesamiento multimedia;
- ADR-006: frontera server-side;
- ADR-008: onboarding, aprobación vinculada y publicación existente.

La tercera composición no introduce un esquema, proveedor, frontera de
seguridad, modelo de despliegue o decisión transversal difícil de revertir.
Crear un ADR solo por sumar un renderer duplicaría documentación sin registrar
una decisión arquitectónica nueva.

## P. Condiciones para iniciar 9B.2

La implementación del renderer puede proponerse únicamente después de aprobar
este contrato. 9B.2 deberá:

1. partir de este mismo PR y mantenerlo en borrador;
2. limitarse al renderer y pruebas directas que se autoricen expresamente;
3. no registrar todavía el catálogo si el siguiente bloque no lo autoriza;
4. demostrar diferenciación visual, accesibilidad y responsive;
5. conservar `restaurant.v2`, migraciones, dependencias y proveedores;
6. repetir la compuerta de seguridad y regresión antes de ampliar alcance.

Condiciones registradas en 9B.1 antes de esa autorización:

- la tercera plantilla no estaba implementada;
- no existía registro `restaurant-editorial-v1`;
- no aparecía en el catálogo;
- no podía seleccionarse ni publicarse;
- la landing debía seguir informando dos plantillas operativas.

## Q. Registro de implementación aislada 9B.2

Esta sección actualiza el estado técnico después de autorizar 9B.2. Conserva
el contrato precedente como evidencia de diseño y no habilita la plantilla en
ningún flujo funcional.

### Estado

**RENDERER IMPLEMENTADO, AÚN NO REGISTRADO**

### Ubicación real

- `site/src/content/renderers/restaurant-editorial.tsx`: wrapper del renderer
  con la firma tipada aprobada y asociación al CSS Module.
- `site/src/content/renderers/restaurant-editorial-view.tsx`: estructura React
  presentacional, resolución segura de medios y harness aislado validado.
- `site/src/content/renderers/restaurant-editorial.module.css`: composición
  mobile-first, breakpoints contractuales, foco y reducción de movimiento.
- `site/tests/unit/restaurant-v2.test.ts`: pruebas directas del renderer sin
  registro en manifiesto, catálogo o seeds.

### Componentes y decisiones

- `RestaurantEditorialRenderer` es el wrapper que utilizará una integración
  futura; todavía no es importado por `renderer-registry.tsx`.
- `RestaurantEditorialView` mantiene marcado propio y no reutiliza
  `RestaurantMediaRenderer`, evitando que Editorial sea una variante
  superficial de Classic o Modern.
- `renderRestaurantEditorialIsolated` verifica de forma explícita
  `restaurant.v2`, versión 2, ejecuta el validador vigente y permite pruebas por
  import interno sin crear rutas o parámetros de navegador.
- `EditorialImage` utiliza `next/image`, dimensiones del
  `MediaRenderManifest` y solamente rutas internas `/media/` o
  `/api/media/private/` que coincidan con el activo y la variante solicitados.
  Una referencia ausente, externa, cruzada, inválida o no resuelta se omite.
- La composición visual derivada se limita a un máximo de tres medios únicos de
  productos disponibles y solo aparece con dos o más. No persiste galería ni
  etiqueta productos como destacados.
- No se extrajeron utilidades desde Classic o Modern y no se modificó su
  comportamiento.
- No se agregaron fuentes, scripts, proveedores, dependencias o datos
  comerciales fijos.

### Diferencias respecto del contrato

La ubicación principal y la firma se conservan. Se añadió el archivo interno
`restaurant-editorial-view.tsx` para separar el CSS Module del árbol React que
se prueba directamente bajo Node. Esta separación no introduce una interfaz
pública, ruta, registro ni frontera funcional nueva.

No existen diferencias visuales o de contenido respecto del contrato. La
autorización multimedia continúa perteneciendo a la frontera server-side; el
renderer solo consume el manifiesto ya autorizado y aplica una comprobación
adicional de ruta y dimensiones.

### Pruebas implementadas

Las pruebas directas cubren:

- contenido `restaurant.v2` completo, landmarks y un único `h1`;
- campos opcionales, categorías sin productos disponibles y productos sin
  precio;
- ausencia, resolución válida y rechazo seguro de multimedia externa o no
  referenciada;
- textos en sus límites máximos;
- redes sociales opcionales y ausencia de enlaces administrativos;
- salida determinista y no mutación de la entrada;
- rechazo de esquema, versión y forma de contenido incompatibles;
- tokens CSS, wrapping, foco, tamaño táctil, reducción de movimiento y
  breakpoints de 600, 900 y 1440 CSS px;
- confirmación de que `restaurant-editorial-v1` no pertenece al manifiesto
  activo.

### Limitaciones vigentes

- El renderer no está registrado en el manifiesto ni en el registry activo.
- No existe fila de catálogo, seed, selector, preview de panel o asignación.
- Onboarding, publicación y restauración no pueden usar Editorial todavía.
- La verificación responsive de este bloque es estructural y mediante CSS; la
  integración futura deberá añadir evidencia visual en los viewports
  contractuales una vez exista un preview autorizado.
- Continúan la vulnerabilidad moderada conocida de PostCSS, las seis
  advertencias heredadas `no-img-element` y la ausencia de proveedor multimedia
  productivo.
