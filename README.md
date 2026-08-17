# Longhorn

Longhorn es una plataforma SaaS B2B multi-tenant orientada a pymes.
La marca comercial visible del producto es **nexi**.

## Estado actual

El repositorio contiene la landing de nexi, persistencia PostgreSQL con Row
Level Security, autenticación y sesiones opacas, los paneles administrativo y
cliente, contenido estructurado `restaurant.v1/v2`, biblioteca multimedia
local/CI y un onboarding operativo completo desde solicitud hasta publicación
verificada. El núcleo reconoce Restaurante y Gimnasio de forma cerrada. El
catálogo local/CI tiene tres plantillas de Restaurante operativas —Classic,
Modern y Restaurante Editorial— y una plantilla Pulso Club disponible solo en
catálogo y preview privados de Gimnasio. Gym no tiene selección, editor,
publicación, restauración, onboarding ni resolución pública. Proveedores
productivos, pagos y tienda no están implementados.

El alcance B1 vigente incorpora también, en orden posterior según la línea
Alfa/Beta, Flow, Tienda Online, Colegio y las aplicaciones operativas RestApp y
PosApp. Esta planificación no equivale a disponibilidad actual ni autoriza su
implementación. Las decisiones rectoras están en el
[`contrato de producto B1`](docs/contrato-producto-b1.md).

La aplicación ejecutable se encuentra en [`site/`](site/README.md).

Consulta el [índice de documentación](docs/README.md).
El cierre integral de la Etapa 9B se documenta en el
[informe de Restaurante Editorial](docs/etapa-9b-cierre-restaurante-editorial.md).
La preparación del Pull Request #3 está registrada en el
[informe de preparación para merge](docs/informe-preparacion-merge-pr-3.md) y
las condiciones pendientes se mantienen en el
[registro central de deuda técnica](docs/deuda-tecnica.md).

La Etapa 9B está implementada en local y CI. No se han habilitado staging,
producción ni proveedores productivos.

La Etapa 10A.5 fue integrada mediante el Pull Request #10. La estabilización
del E2E multimedia y su cierre técnico se documentan en
[`docs/etapa-10a6-estabilizacion-ci.md`](docs/etapa-10a6-estabilizacion-ci.md).

La consolidación de alcance y la línea crítica hacia una primera Alfa se
registran en
[`docs/etapa-10b0-consolidacion-b1-alfa.md`](docs/etapa-10b0-consolidacion-b1-alfa.md).
