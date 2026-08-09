# Documentación del Proyecto Longhorn

| Número | Documento | Código | Versión | Fecha | Estado | Archivo | Vigencia | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Diseño de la landing principal | — | 1 | 2026-07 | Referencia | [diseno-landing-principal.md](diseno-landing-principal.md) | Parcial | Algunas decisiones visuales y de marca fueron reemplazadas por la implementación actual. |
| 4 | Prueba técnica de persistencia multi-tenant | — | 1 | 2026-07 | Implementada y validada | [etapa-4-persistencia-multitenant.md](etapa-4-persistencia-multitenant.md) | Vigente | SQL, roles, RLS, comandos y pruebas de aislamiento. |
| 5 | Autenticación, sesiones y tenant confiable | — | 1 | 2026-07 | Implementada y validada local/CI | [etapa-5-autenticacion-sesiones.md](etapa-5-autenticacion-sesiones.md) | Vigente | Adaptadores, sesiones opacas, MFA, recuperación, auditoría y E2E. |
| 6 | Panel base del Administrador nexi | — | 1 | 2026-07 | Aprobada con deuda no bloqueante | [etapa-6-panel-administrador-nexi.md](etapa-6-panel-administrador-nexi.md) | Vigente | Clientes, invitaciones, membresías, auditoría y cierre de seguridad. |
| 7A | Panel central base del Cliente Administrador | — | 1 | 2026-07 | Aprobada con deuda no bloqueante | [etapa-7a-panel-cliente-administrador.md](etapa-7a-panel-cliente-administrador.md) | Vigente | Selector multiempresa, dashboard, sitios y plan en consulta, perfiles editables y mensajes informativo. |
| 7B | Operación básica de sitios, solicitudes y mensajería | — | 1 | 2026-07 | Implementada y validada local/CI | [etapa-7b-sitios-solicitudes-mensajeria.md](etapa-7b-sitios-solicitudes-mensajeria.md) | Vigente | Sitios, eliminación diferida, dominios, soporte interno, outbox sintético, auditoría y RLS. |
| 8A | Plantillas, contenido estructurado y primer editor publicable | — | 1 | 2026-07 | Implementada y validada localmente | [etapa-8a-plantillas-contenido-editor.md](etapa-8a-plantillas-contenido-editor.md) | Vigente | `restaurant.v1`, borrador, preview, publicaciones inmutables, restauración, renderer, resolución pública y RLS. |
| 8B | Multimedia, restaurant.v2 y segunda plantilla | — | 1 | 2026-07 | Aprobada con deuda no bloqueante local/CI | [etapa-8b-multimedia-plantillas.md](etapa-8b-multimedia-plantillas.md) | Vigente | Biblioteca aislada, procesamiento local, variantes, referencias, segunda plantilla y cambio controlado. |
| 8B.1 | Aislamiento de pruebas y atomicidad de seeds | — | 1 | 2026-07 | Aprobada con deuda no bloqueante | [etapa-8b-1-aislamiento-seeds.md](etapa-8b-1-aislamiento-seeds.md) | Vigente | Reparación acotada de contaminación entre suites y seed multimedia transaccional. |
| 9A.1 | Cierre formal del onboarding y línea base | — | 1 | 2026-08 | Aprobada con deuda no bloqueante local/CI | [etapa-9a-onboarding-operativo.md](etapa-9a-onboarding-operativo.md) | Vigente | Solicitud, conversión, respuestas, aprobación vinculada, publicación verificada, RLS, E2E y cierre A–Z. |
| 9A-M | Preparación para merge del Pull Request #3 | — | 1 | 2026-08 | Apto con deuda no bloqueante | [informe-preparacion-merge-pr-3.md](informe-preparacion-merge-pr-3.md) | Vigente | Git, PR, CI alojada, validación local, seguridad, migraciones y recomendación de revisión humana. |
| 9B.1–9B.4 | Contrato, renderer y flujo completo de Restaurante Editorial | — | 1 | 2026-08 | Implementada y validada local/CI | [etapa-9b-contrato-restaurant-editorial.md](etapa-9b-contrato-restaurant-editorial.md) | Vigente | Contrato, renderer cerrado, catálogo de tres plantillas, preview, selección, publicación, restauración y onboarding; no constituye disponibilidad comercial. |
| 9B-M | Cierre integral de la Etapa 9B | — | 1 | 2026-08 | Preparada para revisión humana | [etapa-9b-cierre-restaurante-editorial.md](etapa-9b-cierre-restaurante-editorial.md) | Vigente | Auditoría integral, seguridad, CI, patches, deuda restante, límites ambientales y mapa de revisión del PR #4. |
| 10A.1-G | Contrato visual, de contenido y compatibilidad de Landing Gimnasio | — | 1 | 2026-08 | Contrato aprobado y alcance B1 autorizado; implementación no iniciada | [etapa-10a-contrato-gimnasio.md](etapa-10a-contrato-gimnasio.md) | Vigente | Autorización del Product Owner versionada; una plantilla con variantes Volt/Studio/Forge y siguiente etapa 10A.2, sin código funcional. |
| 10A.2 | Generalización mínima del núcleo Restaurant + Gym | — | 1 | 2026-08 | Implementada y validada localmente; revisión humana pendiente | [etapa-10a2-generalizacion-multirubro.md](etapa-10a2-generalizacion-multirubro.md) | Vigente | Industrias cerradas Restaurant/Gym, núcleo fail-closed y persistencia preparada; `gym.v1`, renderer, plantilla, editor y onboarding Gym continúan no implementados. |
| DT | Registro central de deuda técnica | DT-001–DT-009 | 1 | 2026-08 | Vigente | [deuda-tecnica.md](deuda-tecnica.md) | Sí | Remediaciones cerradas y condiciones pendientes para merge, staging y producción. |
| ADR-000 | Plantilla para decisiones de arquitectura | ADR | 1 | 2026-07 | Vigente | [adr/ADR-000-plantilla.md](adr/ADR-000-plantilla.md) | Sí | Utilizar para nuevas decisiones técnicas. |
| ADR-001 | Usar monolito modular para el MVP | ADR | 1 | 2026-07 | Aceptado como línea base de arquitectura | [adr/ADR-001-monolito-modular-para-el-mvp.md](adr/ADR-001-monolito-modular-para-el-mvp.md) | Sí | Un despliegue principal con módulos internos y contratos definidos. |
| ADR-002 | Aplicación web responsiva antes que aplicaciones nativas | ADR | 1 | 2026-07 | Aceptado como línea base de arquitectura | [adr/ADR-002-aplicacion-web-responsiva.md](adr/ADR-002-aplicacion-web-responsiva.md) | Sí | Experiencia web mobile-first; aplicaciones nativas fuera del MVP. |
| ADR-003 | PostgreSQL como fuente transaccional | ADR | 1 | 2026-07 | Aceptado como línea base de arquitectura | [adr/ADR-003-postgresql-fuente-transaccional.md](adr/ADR-003-postgresql-fuente-transaccional.md) | Sí | Relaciones explícitas, transacciones, constraints y migraciones versionadas. |
| ADR-004 | Aislamiento compartido con tenant_id y RLS en el MVP | ADR | 1 | 2026-07 | Aceptado como línea base de arquitectura | [adr/ADR-004-aislamiento-tenant-id-rls.md](adr/ADR-004-aislamiento-tenant-id-rls.md) | Sí | Contexto tenant confiable, autorización server-side y RLS. |
| ADR-005 | Object storage para medios y documentos | ADR | 1 | 2026-07 | Aceptado | [adr/ADR-005-object-storage-para-medios-y-documentos.md](adr/ADR-005-object-storage-para-medios-y-documentos.md) | Parcial | Decisión histórica; proveedor productivo pendiente. |
| ADR-006 | API y servicios server-side como frontera de seguridad | ADR | 1 | 2026-07 | Aceptado como línea base de arquitectura | [adr/ADR-006-frontera-server-side.md](adr/ADR-006-frontera-server-side.md) | Sí | El servidor deriva contexto y valida toda operación sensible. |
| ADR-007 | Gateway de IA e integraciones | ADR | 1 | 2026-07 | Aceptado como línea base de arquitectura | [adr/ADR-007-gateway-ia-e-integraciones.md](adr/ADR-007-gateway-ia-e-integraciones.md) | Parcial | Adaptadores desacoplados; IA productiva e integraciones avanzadas diferidas. |
| ADR-008 | Orquestación transaccional del onboarding y aprobación vinculada | ADR | 1 | 2026-07 | Aceptado local/CI | [adr/ADR-008-orquestacion-onboarding-y-aprobacion.md](adr/ADR-008-orquestacion-onboarding-y-aprobacion.md) | Parcial | Conversión reanudable, checksum e integración con publicación existente. |
| ADR-009 | PostgreSQL y RLS multi-tenant | ADR | 1 | 2026-07 | Aceptado para prueba técnica | [adr/ADR-009-postgresql-rls-multitenant.md](adr/ADR-009-postgresql-rls-multitenant.md) | Sí | Selección de `pg`, SQL versionado y contexto transaccional. |
| ADR-010 | Supabase Auth y sesiones opacas | ADR | 1 | 2026-07 | Aceptado para V1 | [adr/ADR-010-supabase-auth-sesiones-opacas.md](adr/ADR-010-supabase-auth-sesiones-opacas.md) | Sí | Proveedor desacoplado, MFA y sesión PostgreSQL. |
| ADR-011 | Operaciones administrativas PostgreSQL | ADR | 1 | 2026-07 | Aceptado para V1 | [adr/ADR-011-operaciones-administrativas-postgresql.md](adr/ADR-011-operaciones-administrativas-postgresql.md) | Sí | Funciones administrativas acotadas, doble autorización y mínimos privilegios. |
| ADR-012 | Almacenamiento y procesamiento multimedia | ADR | 1 | 2026-07 | Aceptado local/CI | [adr/ADR-012-almacenamiento-y-procesamiento-multimedia.md](adr/ADR-012-almacenamiento-y-procesamiento-multimedia.md) | Parcial | Proveedor productivo pendiente; R2 solo recomendado. |

## Documentos esperados

1. Visión del Producto.
2. Project Charter.
3. Modelo de Negocio.
4. SRS de Requisitos de Software.
5. Arquitectura del Sistema.
6. Modelo de Base de Datos.
7. UX/UI y Wireframes.
8. Backlog del Proyecto.
9. Roadmap de Producto.
10. Manual Técnico.
11. Esquema SQL de referencia.
12. Mapa Maestro de Ejecución.

Los documentos fuente oficiales todavía deben incorporarse de forma controlada
a `docs/fuentes/`. El directorio conserva por ahora únicamente su marcador y no
debe interpretarse como una copia completa de la línea base documental.
