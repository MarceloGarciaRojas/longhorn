# Contrato rector de producto B1 — Longhorn / nexi

- **Versión:** 1
- **Fecha:** 2026-08-16
- **Autoridad:** decisiones vigentes del Product Owner
- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Estado:** VIGENTE

## 1. Autoridad y alcance

Este documento concentra la fuente viva del alcance B1. Representa decisiones
del Product Owner posteriores a parte de la documentación inicial del 14–15 de
julio de 2026. Cuando una decisión histórica de producto lo contradiga,
prevalece este contrato. Los documentos anteriores se conservan como evidencia
de contexto y los ADR continúan vigentes para decisiones técnicas compatibles.

Este contrato ordena producto; no implementa funciones, no contrata servicios,
no habilita staging o producción y no autoriza cobros automáticos.

## 2. Identidad y principio rector

- Longhorn es el nombre interno y técnico del proyecto.
- nexi es la marca visible para clientes.
- No se realizará un renombrado masivo de repositorio, arquitectura o
  identificadores técnicos sin una etapa específica.
- La prioridad es simplicidad para el cliente sin sacrificar aislamiento,
  seguridad o mantenibilidad.
- El cliente administra contenido y configuraciones permitidas; no modifica
  código, HTML/CSS libre, infraestructura, base de datos o servidores.

## 3. Actores

### Administrador nexi

Operador interno con acceso separado, protegido y no enlazado desde landings o
sitios públicos. Las acciones sensibles requieren autorización server-side,
tenant y recurso confiables, rol, permiso, auditoría y AAL2 cuando corresponda.

### Cliente Administrador

Administra sus empresas y soluciones mediante el login centralizado de nexi.
No crea infraestructura ni accede directamente a PostgreSQL. Puede editar solo
contenido y configuraciones autorizadas para recursos de sus tenants.

### Cliente Final

Visita sitios o experiencias públicas. Nunca recibe controles administrativos
ni se mezcla con la experiencia del Cliente Administrador.

### Perfiles operativos

RestApp y PosApp podrán definir permisos operativos específicos. Estos perfiles
comparten el sistema seguro de identidad, tenant, membresías, roles, permisos y
sesiones; no crean identidades paralelas inseguras.

## 4. Invariantes de arquitectura y seguridad

- aplicación compartida y monolito modular mientras siga siendo suficiente;
- tenant derivado server-side desde sesión, host o recurso confiable;
- `tenant_id` y Row Level Security;
- autorización en servidor; ocultar un control nunca concede ni revoca permiso;
- sesiones opacas, auditoría y prevención de enumeración insegura;
- contenido separado de presentación;
- schemas, renderers, capacidades y compatibilidad cerrados y explícitos;
- publicaciones inmutables, revisiones, checksums e idempotencia;
- migraciones versionadas, reversibles cuando corresponda y fail-closed;
- secretos y credenciales fuera del repositorio;
- ningún repositorio o despliegue duplicado por cliente.

Nunca se confiará en `tenant_id`, industria, rol, permiso o propiedad enviados
por el navegador como autoridad.

## 5. Regla de acceso administrativo

### Sitios y landings públicas

No muestran “Admin”, “Dueño”, “Editar”, “Configuración”, enlaces ocultos para
propietarios ni accesos al panel. La administración ocurre exclusivamente por:

`nexi → login centralizado → Mis soluciones → solución autorizada`

### Aplicaciones operativas

RestApp y PosApp pueden incluir configuración dentro de la propia aplicación
porque sirven a la operación interna. Esa configuración exige autenticación,
tenant, rol y permiso. Toda vista pública para Cliente Final permanece sin
controles administrativos.

## 6. Mapa de productos y verticales B1

| Dominio | Naturaleza | Estado al aprobar 10B.0 |
| --- | --- | --- |
| Restaurante | Sitio público administrable | Recorrido completo local/CI con tres plantillas |
| Gimnasio | Sitio público administrable | Contrato, renderer, catálogo y preview privados; activación bloqueada |
| Colegio | Experiencia escolar controlada | Contrato B1 documentado; no implementado |
| Tienda Online | Catálogo y venta pública | Contrato de modalidades documentado; no implementado |
| RestApp | Aplicación operativa para restaurantes/cafeterías | Nombre y límites formalizados; no incorporada |
| PosApp | Aplicación operativa POS/inventario | Nombre y límites formalizados; no incorporada |

Esta pertenencia a B1 no exige implementar todos los dominios antes de la
primera Alfa. La clasificación A/B/C/D determina orden, no pertenencia.

## 7. Gimnasio

Estado técnico reconocido:

- industria `gym`;
- schema y borradores `gym.v1`;
- renderer `gym-pulso-v1`;
- template `gym-pulso` y Pulso Club;
- variantes Volt, Studio y Forge;
- catálogo privado;
- preview para Cliente Administrador y Administrador nexi.

Continúan bloqueados selección, editor, guardado operativo, publicación,
restauración, onboarding y resolución pública. 10B.0 no cambia esos bloqueos.

Los borradores aceptan horarios parciales. Una futura publicación deberá exigir
readiness completo y cobertura horaria de siete días conforme al contrato Gym
aprobado. No habrá fallback a Restaurant.

## 8. Colegio

Colegio forma parte de B1 y requiere control reforzado por tratar datos de
menores. No está implementado.

El establecimiento cargará y mantendrá la información desde el panel del
Cliente Administrador, sin código ni acceso directo a PostgreSQL.

El acceso B1 del apoderado o usuario autorizado será mediante:

`RUT del alumno + contraseña`

La consulta se limita a nombre del alumno, curso, notas,
asistencia/inasistencia, atrasos y anotaciones positivas o negativas. No se
agregará información personal adicional sin una decisión posterior.

Son obligatorios minimización de datos, aislamiento tenant, autenticación y
autorización server-side, contraseñas protegidas, auditoría, rate limiting y
prevención de enumeración de alumnos. No se autoriza un portal genérico que
exponga otros datos.

## 9. RestApp

`RestApp` es el nombre técnico oficial de la aplicación operativa para
restaurantes y cafeterías. Debe usarse en arquitectura, módulos, carpetas,
contratos, pruebas, migraciones, observabilidad y despliegues cuando se
implemente. Un nombre comercial podrá definirse después.

RestApp no es una plantilla web ni una sección improvisada del CMS. Conserva un
límite de dominio propio y puede compartir con nexi identidad, tenant, roles,
permisos y servicios comunes justificados.

## 10. PosApp

`PosApp` es el nombre técnico oficial de la aplicación operativa POS e
inventario. No se fusionará con RestApp ni con Tienda Online.

Ventas, caja, inventario, productos y movimientos pertenecen a sus propias
responsabilidades. La interoperabilidad futura requerirá contratos explícitos;
no se compartirán tablas internas indiscriminadamente.

## 11. Preservación funcional y visual

Integrar RestApp o PosApp no autoriza rediseñarlas. Aunque retirar componentes
incompatibles exija reescritura, deben preservarse salvo decisión expresa:

- funcionalidades y flujos;
- navegación y comportamiento;
- estructura y jerarquía de pantallas;
- identidad visual, estilos y animaciones;
- componentes equivalentes y experiencia general.

Toda integración futura exigirá inventario funcional previo, comparación
visual, pruebas E2E y registro explícito de diferencias. Modernizar código no
justifica una pérdida funcional o visual.

## 12. Eliminación de tecnología heredada incompatible

Al incorporar RestApp o PosApp se eliminarán totalmente, cuando existan:

- Gemini, Google AI, SDK, prompts, llamadas, variables y referencias asociadas;
- Firebase/Firestore incompatible con PostgreSQL y la arquitectura nexi;
- autenticación local paralela, usuarios o claves almacenados localmente;
- contraseñas o PIN en texto plano;
- secretos embebidos y autorización basada solo en frontend;
- documentación, comentarios y código muerto de esas rutas.

No se conservará Gemini “por si se utiliza después”. Si una función depende de
esa tecnología, primero se inventariará su contrato de experiencia y luego se
reemplazará o se aplicará una degradación controlada expresamente aprobada. No
se incorporará automáticamente otro proveedor de IA.

## 13. Identidad y autorización de aplicaciones

RestApp y PosApp deben compartir la dirección arquitectónica segura de nexi:
identidad, tenant, membresías, roles, permisos y sesiones. Sus permisos
operativos pueden ser propios, pero no deben introducir un sistema paralelo
inseguro. Toda excepción requiere contrato y revisión antes de implementarse.

## 14. Pagos B1 y Flow

La infraestructura de pagos necesaria para B1 pertenece al roadmap ejecutable.
Flow es el proveedor preferido actual, sujeto a verificación técnica antes de
implementar. 10B.0 no crea checkout, integración ni credenciales.

### Suscripción nexi

nexi podrá registrar plan, valor, fecha de pago, vencimiento, estado e
historial. B1 no presupone débito recurrente o renovación automática. El
cliente paga mediante el mecanismo habilitado; cualquier automatización de
cobro requiere autorización posterior.

### Pagos de comercios

Los pagos de clientes finales pertenecen al comercio, no a nexi. Cuando Flow lo
permita, cada comercio vinculará su propia cuenta. El diseño evitará que nexi
reciba primero el dinero para transferirlo después. Las capacidades reales de
Flow deben comprobarse antes de fijar el contrato técnico.

## 15. Tienda Online

Tienda Online es una experiencia pública de catálogo y venta distinta de
PosApp. Cada comercio podrá configurar al menos:

- **Modo A:** pago online;
- **Modo B:** pago manual o coordinación mediante WhatsApp.

No se hardcodeará un único modelo comercial. WhatsApp como canal no equivale a
una integración productiva de WhatsApp Business API. Tienda y PosApp podrán
interoperar solo mediante contratos explícitos.

## 16. Onboarding

La incorporación V1/B1 es híbrida. El Cliente Administrador puede entregar
antecedentes mediante formulario, interacción asistida o WhatsApp. El
Administrador nexi registra en la plataforma toda información relevante.
Actualmente WhatsApp es un canal humano, no una API productiva.

## 17. Dominios

El cliente puede solicitar dominio propio. nexi gestiona inicialmente
contratación y configuración fuera del sistema, mientras la plataforma registra
y asocia el dominio al sitio. Los dominios contratados por nexi son propiedad
de nexi conforme a la decisión operativa vigente.

10B.0 no automatiza NIC Chile, compra, DNS, certificados, renovación o
transferencia. La operación inicial permanece manual y trazable.

## 18. Eliminación de sitios

La solicitud puede originarse desde el cliente, tiene espera configurada de 48
horas y puede cancelarse según el flujo. La acción final inicial archiva; no
existe eliminación física inmediata.

## 19. Planes comerciales

Los planes iniciales se denominan `Esencial` y `Pro`. Sus precios, límites y
descripciones finales no están congelados. Cualquier cifra histórica es una
hipótesis y no debe alimentar billing ni promesas comerciales vigentes.

## 20. Alfa, Beta y B1

### A — Bloqueante Alfa

Necesario para un primer piloto controlado del recorrido principal: acceso,
tenant, solución Restaurant, edición, medios, preview, publicación, acceso
público, onboarding, infraestructura persistente mínima y seguridad.

### B — Bloqueante Beta

Necesario antes de ampliar pilotos: operación repetible, observabilidad,
respaldo, notificaciones y administración comercial mínima.

### C — B1 posterior

Comprometido en B1 pero no necesario para la primera Alfa: activación completa
Gym, Flow y pagos, Tienda Online, RestApp, PosApp y Colegio, salvo que una
decisión posterior adelante una capacidad sin debilitar la línea crítica.

### D — Posterior

Fuera de B1 o sin prioridad vigente: capacidades no comprometidas, IA
productiva, marketplace, agentes, microservicios sin necesidad demostrada y
automatizaciones no autorizadas.

La clasificación ordena ejecución; no elimina compromisos B1.

## 21. Integridad y costo

La velocidad se obtiene mediante orden, reutilización, contratos claros y
menor retrabajo. No justifica pérdida funcional, rediseño accidental,
debilitamiento de RLS o autorización, eliminación de pruebas, migraciones
destructivas, acoplamiento improvisado, duplicación por cliente, secretos,
credenciales en texto plano o pérdida de trazabilidad.

Se priorizarán herramientas gratuitas, open source o free tier. Ningún servicio
pagado, proveedor productivo o cobro se habilita sin aprobación expresa.

## 22. Trazabilidad

La auditoría que originó este contrato, la matriz de contradicciones y la línea
crítica hacia Alfa están en
[`etapa-10b0-consolidacion-b1-alfa.md`](etapa-10b0-consolidacion-b1-alfa.md).
