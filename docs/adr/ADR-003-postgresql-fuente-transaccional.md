# ADR-003: PostgreSQL como fuente transaccional

- Estado: aceptado como línea base de arquitectura
- Fecha: 2026-07-14
- Proyecto: Longhorn
- Marca: nexi

## Contexto

Longhorn administra relaciones entre tenants, usuarios, membresías, sitios,
contenido, plantillas, formularios, publicación y auditoría. Estas relaciones
necesitan integridad, transacciones, constraints, migraciones y consultas
consistentes. El aislamiento multi-tenant también necesita controles aplicables
desde la base de datos.

## Decisión

1. PostgreSQL será la fuente transaccional principal de Longhorn.
2. Las relaciones centrales deben modelarse explícitamente.
3. Las reglas críticas deben protegerse mediante constraints, claves,
   transacciones y validaciones de servidor.
4. Los cambios de esquema se realizarán mediante migraciones versionadas.
5. JSONB se reservará para configuración extensible o snapshots, no para
   reemplazar relaciones centrales.
6. Los archivos binarios permanecerán fuera de PostgreSQL.
7. Las consultas multi-tenant deben considerar tenant_id e índices adecuados.
8. Los cambios incompatibles deben utilizar estrategias seguras de migración.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Base documental como fuente principal | No representa con la misma claridad las relaciones centrales y sus reglas de integridad |
| Archivos locales como persistencia del dominio | No ofrecen una fuente transaccional adecuada para relaciones multi-tenant |
| Almacenar relaciones centrales únicamente en JSON | Debilita el modelado explícito, los constraints y las consultas consistentes |
| Modificar manualmente el esquema en producción | Impide una evolución versionada, repetible y controlada |
| Guardar archivos binarios dentro de la base | Aumenta el tamaño y la complejidad de backups de PostgreSQL |

## Consecuencias

- Se requiere disciplina de migraciones.
- Deben probarse constraints, bloqueos e índices.
- PostgreSQL permite transacciones y consistencia.
- El esquema debe evolucionar de forma controlada.
- Los backups de la base no sustituyen los respaldos de object storage.
- La base puede aplicar RLS como capa adicional de aislamiento.

## Estado actual de implementación

- PostgreSQL está utilizado en local y CI.
- La infraestructura productiva sigue pendiente.
- Este ADR no selecciona un proveedor administrado específico.
