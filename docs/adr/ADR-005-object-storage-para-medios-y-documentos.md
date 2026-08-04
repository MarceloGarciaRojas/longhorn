# ADR-005: Object storage para medios y documentos

- Estado: aceptado
- Fecha: 2026-07-14
- Proyecto: Longhorn
- Marca: nexi

## Contexto

Longhorn debe administrar imágenes y documentos de múltiples tenants. Almacenar
los binarios directamente en PostgreSQL aumentaría el tamaño de la base de
datos, el costo operativo, la complejidad de los backups y el acoplamiento.

La base de datos debe conservar los metadatos, las referencias y las reglas de
acceso, mientras los binarios permanecen fuera de PostgreSQL.

## Decisión

1. Los medios y documentos se almacenan en un servicio de object storage.
2. PostgreSQL no almacena el contenido binario de los archivos.
3. La base conserva metadatos como propietario, tenant, tipo, tamaño, checksum,
   estado, referencia de almacenamiento y fechas.
4. Toda referencia de archivo debe quedar asociada al tenant correspondiente.
5. Los archivos públicos y privados deben diferenciarse mediante políticas de
   acceso.
6. Los archivos privados deben entregarse mediante mecanismos temporales y
   controlados, como URLs firmadas.
7. La eliminación debe considerar usos activos, referencias, retención y ciclo
   de vida.
8. La lógica del dominio no debe depender directamente del SDK de un proveedor
   específico.
9. El proveedor definitivo puede cambiar sin alterar el modelo de dominio.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Guardar binarios en PostgreSQL | Aumenta tamaño, backups, costo y complejidad operacional |
| Guardar archivos directamente en el sistema de archivos del servidor | Dificulta escalabilidad, despliegues y disponibilidad |
| Usar URLs externas sin control de Longhorn | Pierde trazabilidad, permisos y control de ciclo de vida |
| Acoplar el dominio a un proveedor específico | Aumenta dependencia y dificulta migración futura |

## Consecuencias

- Se necesita gestionar metadatos y referencias de almacenamiento.
- Los archivos privados requieren autorización y entrega temporal.
- Los backups de PostgreSQL no incluyen por sí solos los binarios.
- Debe existir una estrategia separada de respaldo y recuperación de archivos.
- La eliminación debe evitar borrar archivos todavía referenciados.
- El procesamiento de imágenes puede ejecutarse de forma asíncrona cuando
  corresponda.
- El proveedor productivo y su configuración quedan pendientes de una decisión
  posterior.
- La solución debe mantener aislamiento por tenant.

## Estado actual de implementación

- La decisión arquitectónica está aceptada.
- La implementación productiva del proveedor de object storage sigue pendiente.
- No existe autorización de staging ni producción por medio de este ADR.
- Este documento no selecciona Supabase Storage, Cloudflare R2 ni otro
  proveedor.
- Cualquier proveedor futuro debe respetar esta decisión y los límites de costo
  vigentes.
