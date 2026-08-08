# Longhorn

Longhorn es una plataforma SaaS B2B multi-tenant orientada a pymes.
La marca comercial visible del producto es **nexi**.

## Estado actual

El repositorio contiene la landing de nexi, persistencia PostgreSQL con Row
Level Security, autenticación y sesiones opacas, los paneles administrativo y
cliente, contenido estructurado `restaurant.v1/v2`, biblioteca multimedia
local/CI y un onboarding operativo completo desde solicitud hasta publicación
verificada. Otros rubros, proveedores productivos, pagos y tienda no están
implementados. El catálogo local/CI actual tiene tres plantillas de restaurante
operativas: Classic, Modern y Restaurante Editorial.

La aplicación ejecutable se encuentra en [`site/`](site/README.md).

Consulta el [índice de documentación](docs/README.md).
La preparación del Pull Request #3 está registrada en el
[informe de preparación para merge](docs/informe-preparacion-merge-pr-3.md) y
las condiciones pendientes se mantienen en el
[registro central de deuda técnica](docs/deuda-tecnica.md).
