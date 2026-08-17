# Etapa 10B.0 — Consolidación del alcance B1 y línea de Alfa

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Fecha:** 2026-08-16
- **Base:** `e90cddc9edfbaafc52b9da4667703365b663516b`
- **Rama:** `codex/etapa-10b0-alcance-b1-alfa`
- **Naturaleza:** contrato, auditoría documental y planificación
- **Estado local:** VALIDADA; CI DE RAMA PENDIENTE

## 1. Precondición comprobada

El Pull Request #11 fue integrado el 2026-08-16 a las 23:41:20, hora de Chile.
Su merge commit es la base exacta de esta etapa. El workflow post-merge `CI`,
run `31991954329`, aprobó sobre ese mismo SHA, incluidos E2E multimedia, audit y
cleanup. `main` se sincronizó mediante fast-forward antes de crear la rama.

## 2. Resultado de la auditoría

La arquitectura implementada sigue siendo compatible con el alcance vigente:
monolito modular, PostgreSQL, RLS, sesiones opacas, autorización server-side,
contenido estructurado, compatibilidad cerrada y publicación inmutable.

La brecha principal no era de código sino de gobierno: reglas vivas todavía
presentaban pagos y Colegio como excluidos, no existía una fuente única para
RestApp/PosApp/Tienda y la memoria de planificación dejaba decisiones que el
Product Owner ya resolvió como preguntas abiertas.

La solución aplicada es “fuente vigente + evidencia histórica”:

1. `contrato-producto-b1.md` concentra decisiones actuales;
2. `AGENTS.md`, README e índice enlazan y respetan esa autoridad;
3. ADR y cierres anteriores conservan su valor técnico e histórico;
4. una línea crítica sustituye la secuencia puramente cronológica como guía
   hacia Alfa.

## 3. Fuentes revisadas

### Fuentes vivas

- `AGENTS.md`;
- `README.md`;
- `site/README.md`;
- `docs/README.md`;
- `docs/deuda-tecnica.md`;
- `docs/etapa-10a-contrato-gimnasio.md`;
- `docs/etapa-10a2-generalizacion-multirubro.md`;
- `docs/etapa-10a3-gym-v1.md`;
- `docs/etapa-10a4-renderer-pulso-club.md`;
- `docs/etapa-10a5-registro-preview-pulso.md`;
- `docs/etapa-10a6-estabilizacion-ci.md`;
- contratos y cierres vigentes de 7B, 8A, 8B, 9A y 9B;
- ADR-001 a ADR-012, con énfasis en ADR-003, 004, 006, 007, 008, 010,
  011 y 012.

### Referencias históricas

- `docs/diseno-landing-principal.md`;
- `docs/informe-integral-avance-proyecto-2026-08-16.md`;
- `docs/Registro_tecnico_base_Longhorn_nexi.docx`.

El DOCX registra una base técnica temprana y se conserva como fotografía de
julio. Su texto fue inspeccionado; no se editó. El render visual no estuvo
disponible por ausencia de LibreOffice en el entorno y no afecta la auditoría
semántica ni los entregables Markdown.

`docs/fuentes/` contiene solo `.gitkeep`. Por ello Visión, Charter, Modelo de
Negocio, SRS, Arquitectura, Backlog y Roadmap originales no están disponibles
como archivos versionados en esta rama. Se reconocen como fuentes históricas
esperadas, no como autoridad operativa invisible.

## 4. Matriz de contradicciones

| Tema | Documento/estado anterior | Decisión vigente | Acción realizada |
| --- | --- | --- | --- |
| Fuente normativa | Decisiones repartidas entre prompts, `AGENTS.md` y cierres | El contrato B1 es fuente viva y prevalece sobre alcance histórico incompatible | Creado `docs/contrato-producto-b1.md`; enlazado desde reglas e índice |
| Un rubro vs múltiples | Alcance temprano Restaurant-only | B1 reconoce Restaurant, Gym, Colegio, Tienda, RestApp y PosApp con naturalezas distintas | Registrado mapa de dominios; documentos 10A se conservan como evolución histórica |
| Gym posterior | El contrato 10A.1 registró implementación no iniciada | Gym está dentro de B1 y hoy llega hasta catálogo/preview privado | Actualizado estado rector sin alterar cierres históricos ni desbloquear capacidades |
| Pagos fuera del MVP | `AGENTS.md` excluía pagos; memoria lo trataba como contradicción pendiente | Infraestructura Flow pertenece a B1 | Sustituida exclusión en reglas; Flow documentado como pendiente, no implementado |
| Cobro recurrente | Documentación inicial podía sugerir suscripción automática | B1 no presupone débito ni renovación automáticos | Formalizada gestión manual de valor, vencimiento, estado e historial |
| Pagos nexi vs comercio | No existía contrato vivo único | Son dominios separados; fondos de ventas pertenecen al comercio | Formalizada separación y vinculación de cuenta propia cuando Flow lo permita |
| Tienda vs PosApp | Riesgo de tratar tienda como POS | Tienda es venta pública; PosApp es operación interna | Límites de dominio y futura interoperabilidad contractual documentados |
| Modalidad Tienda | Riesgo de hardcodear checkout online | Cada comercio elige pago online o manual/WhatsApp | Formalizados Modo A y Modo B |
| Nombres de apps | Referencias previas no rectoras o ausentes | Nombres técnicos oficiales `RestApp` y `PosApp` | Incorporados a contrato, reglas y planificación |
| Preservación de apps | Una reescritura técnica podía interpretarse como rediseño | Integración preserva función y experiencia visual | Inventario, comparación visual, E2E y registro de diferencias definidos como puertas |
| Gemini/Google AI | Apps externas futuras podrían contener SDK, prompts o dependencias | Eliminación total al incorporar RestApp/PosApp; sin sustituto IA automático | Prohibición explícita y tratamiento de funciones dependientes documentados |
| Firebase/Firestore | Arquitectura heredada externa podría competir con PostgreSQL | Se elimina cuando contradiga nexi; identidad/persistencia siguen arquitectura compartida | Restricción incorporada sin tocar código actual |
| Autenticación local | Apps externas podrían traer usuarios, PIN o autorización frontend | Identidad, tenant, membresías, roles, permisos y sesiones se comparten de forma segura | Sistemas paralelos inseguros y texto plano prohibidos |
| Acceso administrativo público | Landing histórica mostraba panel y starters podían incluir `/admin` | Sitios públicos no muestran administración; apps internas sí tienen configuración protegida | Regla diferenciada documentada transversalmente |
| Colegio | `AGENTS.md` excluía módulos escolares del MVP inicial | Colegio pertenece a B1, con contrato mínimo y datos de menores | Formalizados acceso RUT+contraseña, datos permitidos y controles reforzados |
| Portal Colegio | Riesgo de portal genérico con datos adicionales | B1 expone solo nombre, curso, notas, asistencia, atrasos y anotaciones | Contrato limitado y minimización explícita |
| Dominios | Memoria registraba dudas de evidencia legal | Solicitud en plataforma; contratación/configuración manual por nexi; dominios contratados por nexi son de nexi | Decisión operativa consolidada; automatización sigue fuera |
| Planes | Seeds y cifras históricas podían parecer tarifas | Esencial/Pro son nombres iniciales; precios y límites no congelados | Tarifas históricas clasificadas como hipótesis, no billing |
| Onboarding/WhatsApp | WhatsApp podía confundirse con integración API | Canal humano híbrido; información relevante termina en nexi | Diferencia registrada sin prometer WhatsApp Business API |
| Roadmap | Memoria priorizaba decidir Gym o staging y numeración de etapas | La prioridad es una Alfa Restaurant vertical, persistente y segura | Creada línea crítica basada en bloqueos y evidencia de salida |
| IA futura general | ADR-007 permite un gateway futuro | No autoriza Gemini heredado ni IA productiva actual | Índice del ADR aclara el límite; ADR técnico permanece intacto |

No se encontró evidencia versionada de precios finales, checkout Flow,
automatización DNS o nombres alternativos oficiales para RestApp/PosApp. Por
ello no se inventaron decisiones adicionales.

## 5. Clasificación Alfa/Beta/B1

| Clase | Capacidades |
| --- | --- |
| A — Bloqueante Alfa | Proveedor de identidad real; PostgreSQL persistente; almacenamiento multimedia persistente; entorno piloto; tenant y usuario reales; recorrido Restaurant completo; URL pública controlada; backup/restore mínimo; logs y respuesta operativa; validación de aislamiento |
| B — Bloqueante Beta | Operación repetible multi-piloto; administración comercial mínima; notificaciones reales; métricas/alertas y soporte operacional; recuperación y retención probadas; política de dominios operable |
| C — B1 posterior | Activación completa Gym; Flow para suscripción nexi; pagos comerciales; Tienda Online; RestApp; PosApp; Colegio; landing comercial autogestionable si no bloquea Alfa |
| D — Posterior | IA productiva, marketplace, agentes, microservicios sin necesidad demostrada y capacidades no comprometidas en B1 |

La clasificación no retira elementos de B1. Únicamente evita bloquear la Alfa
Restaurant con dominios que requieren contratos e integraciones mayores.

## 6. Cobertura actual del recorrido Alfa

| Paso | Restaurant local/CI | Brecha Alfa |
| --- | --- | --- |
| Acceso nexi | Sí, proveedor sintético y adaptador Supabase | Proyecto real, configuración y recuperación verificadas |
| Cliente Administrador | Sí | Identidad piloto y soporte operativo |
| Empresa/tenant | Sí, RLS y membresías | Aprovisionamiento persistente controlado |
| Mis soluciones/sitios | Sí | Validación con tenant piloto real |
| Sitio asociado | Sí | Dominio/subdominio del entorno piloto |
| Edición | Sí, contenido estructurado Restaurant | Validación UX con contenido real autorizado |
| Multimedia | Sí, local/CI | Object storage/procesamiento persistentes |
| Preview | Sí | Verificación en entorno piloto |
| Publicación | Sí, inmutable e idempotente | Ejecución persistente y rollback operativo |
| Acceso público | Sí, resolver y ruta local/CI | Host real, TLS y cache seguro |
| Onboarding | Sí, recorrido completo | Identidad/correo y operación humana reales |
| Seguridad | Sí en local/CI | Pruebas en infraestructura objetivo y respuesta operativa |

El producto no necesita otra plantilla ni otro rubro para demostrar la Alfa. El
bloqueo real es promover de forma segura el recorrido Restaurant ya existente a
infraestructura persistente y operable.

## 7. Línea crítica hacia Alfa

### Incremento 1 — Contrato de entorno Alfa y proveedores mínimos

- **Objetivo:** seleccionar un entorno piloto de costo cero/free tier y fijar
  contratos para identidad, PostgreSQL, multimedia, host, secretos y correo.
- **Dependencia:** 10B.0 aprobado.
- **Razón:** ningún flujo puede validarse fuera de datos sintéticos sin una
  frontera ambiental explícita.
- **Áreas estimadas:** `site/src/config`, adaptadores `src/auth`, `src/db`,
  `src/media`, `.env.example`, documentación y CI/promoción.
- **Riesgo:** alto; configuración incorrecta puede debilitar aislamiento o
  exponer secretos.
- **Evidencia de salida:** matriz de proveedores, costo esperado cero,
  threat model, variables/secretos, rollback y criterios go/no-go aprobados.
- **Desbloquea:** aprovisionamiento del entorno Alfa.

### Incremento 2 — Infraestructura persistente y seguridad base

- **Objetivo:** desplegar una instancia no productiva persistente con identidad
  real, PostgreSQL/RLS, secretos externos, TLS y observabilidad mínima.
- **Dependencia:** contratos del incremento 1.
- **Razón:** convierte la plataforma de local/CI en un sistema pilotable.
- **Áreas estimadas:** adaptadores existentes, migrador, configuración de
  despliegue, health, logs y runbooks; sin cambiar dominios funcionales.
- **Riesgo:** crítico; tenant context, roles DB, MFA y recovery.
- **Evidencia de salida:** migraciones reproducibles, pruebas cross-tenant,
  login/recuperación, AAL2 admin, secretos ausentes de Git y rollback del
  despliegue.
- **Desbloquea:** datos y usuarios piloto persistentes.

### Incremento 3 — Multimedia y publicación Restaurant persistentes

- **Objetivo:** conectar object storage/procesamiento autorizados y validar
  edición → medios → preview → publicación → resolución pública.
- **Dependencia:** entorno persistente y proveedor multimedia aprobado.
- **Razón:** el recorrido principal no es demostrable con medios efímeros.
- **Áreas estimadas:** `src/media`, adaptadores de almacenamiento,
  procesamiento/cola si corresponde, URLs privadas/públicas y retención.
- **Riesgo:** alto; fuga cross-tenant, objetos huérfanos o URLs indebidas.
- **Evidencia de salida:** upload y variantes, aislamiento, snapshot,
  restauración, limpieza segura, límites y E2E sobre el entorno Alfa.
- **Desbloquea:** sitio Restaurant real y persistente.

### Incremento 4 — Piloto vertical Restaurant operable

- **Objetivo:** aprovisionar un tenant piloto, ejecutar onboarding híbrido y
  operar el sitio completo desde nexi hasta una URL pública controlada.
- **Dependencia:** incrementos 2 y 3.
- **Razón:** valida valor de producto, no solo infraestructura.
- **Áreas estimadas:** onboarding, panel cliente/admin, dominios manuales,
  correo de invitación/notificación y contenido Restaurant existente.
- **Riesgo:** alto; datos reales, operación manual y recuperación.
- **Evidencia de salida:** guion E2E firmado, sitio publicado, restauración,
  onboarding trazable, ningún enlace admin público y soporte operativo.
- **Desbloquea:** demostración Alfa con usuario real controlado.

### Incremento 5 — Puerta Alfa de seguridad y continuidad

- **Objetivo:** demostrar aislamiento, respaldo, restauración, observabilidad y
  respuesta a incidentes antes de declarar Alfa.
- **Dependencia:** piloto vertical completo.
- **Razón:** una demo persistente sin continuidad no es una Alfa utilizable.
- **Áreas estimadas:** pruebas E2E/seguridad, backups, runbooks, alertas,
  retención y checklist de promoción.
- **Riesgo:** crítico; pérdida o exposición de datos.
- **Evidencia de salida:** 0 fallos críticos, restore ensayado, RLS/cross-tenant
  verde, métricas/logs útiles, rollback probado y aprobación humana.
- **Desbloquea:** declaración de Alfa funcional y demostrable.

## 8. Camino posterior sin bloquear Alfa

Después de la puerta Alfa, la planificación debe elegir incrementos B/C según
evidencia del piloto. El orden recomendado inicial es:

1. operación Beta repetible y administración comercial mínima;
2. completar Gym desde editor/selección hasta publicación y onboarding mediante
   readiness de siete días;
3. contrato técnico Flow y pagos de suscripción nexi sin recurrencia automática;
4. Tienda Online con modalidades online/manual;
5. inventario y saneamiento previo de RestApp y PosApp;
6. contrato de datos y threat model específico de Colegio antes de código.

Ese orden puede cambiar por decisión del Product Owner, pero ninguna capacidad
debe saltarse sus controles de seguridad o preservación funcional/visual.

## 9. Límites preservados

10B.0 no implementa Flow, RestApp, PosApp, Tienda Online, Colegio, nuevas
funciones Gym, proveedores productivos, staging o producción. No modifica
schemas, renderers, migraciones, RLS, tests, dependencias o runtime.

Gym continúa sin selección, editor, guardado operativo, publicación,
restauración, onboarding o resolución pública.

## 10. Siguiente incremento recomendado

El único siguiente incremento recomendado es:

**Contrato de entorno Alfa y proveedores mínimos.**

Es el menor bloque que elimina el riesgo dominante y acerca materialmente al
piloto sin introducir funcionalidad comercial nueva. Requiere autorización
explícita del Product Owner; 10B.0 no lo inicia.

## 11. Validación local

La validación utilizó Node.js `24.14.0` y pnpm `11.9.0`, sin modificar el
lockfile ni instalar dependencias nuevas.

| Control | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Aprobado; grafo ya actualizado |
| `pnpm verify` | Aprobado |
| ESLint | 0 errores; 6 advertencias `no-img-element` heredadas |
| TypeScript | Aprobado |
| Pruebas de `verify` | 78/78 |
| Build Vinext | Aprobado |
| Escaneo de secretos | Aprobado; 299 archivos de texto tras retirar wrappers temporales |
| `pnpm security:audit` | 0 vulnerabilidades conocidas |
| Enlaces Markdown locales | Aprobados |
| `git diff --check` | Aprobado |
| Pruebas funcionales afectadas | Ninguna; no se modificó código funcional |

El runtime empaquetado más reciente del entorno ofrecía Node `24.19.0` y pnpm
`11.19.0`; el control de engines rechazó correctamente esa primera invocación.
La cadena oficial se repitió y aprobó con las versiones exactas del proyecto.
El primer audit no pudo acceder al registro por el sandbox (`EACCES`); la
repetición read-only con red autorizada aprobó sin vulnerabilidades.

## 12. Cumplimiento local de Definition of Done

- contrato B1 vigente documentado;
- RestApp y PosApp formalizados como aplicaciones independientes;
- preservación funcional/visual y eliminación futura total de Gemini/Google
  AI/Firebase incompatible formalizadas;
- Flow reconocido dentro de B1 y separado entre pagos nexi/comercio;
- modalidades online y manual/WhatsApp de Tienda documentadas;
- regla administrativa público/interno consolidada;
- contrato mínimo Colegio B1 documentado;
- estado Gym preservado sin desbloquear capacidades;
- precios históricos no tratados como tarifas;
- contradicciones identificadas y fuentes vivas corregidas;
- línea crítica Alfa definida por dependencias y criterios de salida;
- cero cambios funcionales, migraciones o dependencias;
- validación local verde.

Commit, Pull Request y CI se registrarán como evidencia de entrega; no se
considerará integrada la etapa sin revisión humana y merge autorizado.
