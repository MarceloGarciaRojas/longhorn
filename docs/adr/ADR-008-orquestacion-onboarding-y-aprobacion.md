# ADR-008: Orquestación transaccional del onboarding y aprobación vinculada

- Estado: aceptado para local y CI
- Fecha: 2026-07-26
- Proyecto: Longhorn
- Marca: nexi

## Contexto

La incorporación crea y relaciona tenant, perfil, invitación, membresía, plan,
sitio, plantilla, caso, checklist y conversación. La invitación utiliza un
adaptador de identidad externo al límite transaccional de PostgreSQL. La
publicación ya dispone de un servicio probado e inmutable. Una aprobación
genérica o una segunda implementación de publicación permitirían publicar
contenido distinto del revisado.

## Decisión

1. La solicitud pública solo crea un registro de entrada.
2. La preparación de recursos operativos ocurre dentro de una transacción
   PostgreSQL, con claves idempotentes y vínculos persistidos.
3. El envío de la invitación se ejecuta después de preparar esos recursos. El
   estado de conversión queda persistido y un reintento reutiliza recursos e
   invitación; no se intenta simular una transacción distribuida.
4. Las respuestas se guardan como `restaurant_onboarding.v1`, con revisión
   optimista. La transformación a `restaurant.v2` es determinista y
   transaccional.
5. Cada aprobación identifica sitio, revisión del borrador, versión de
   plantilla, esquema y checksum lógico. Cambiar contenido, plantilla o
   referencias multimedia invalida la aprobación.
6. Onboarding reutiliza la misma transacción de publicación del dominio de
   contenido. Solo cierra el caso después de resolver y validar el sitio
   público.
7. Los bloqueos `FOR UPDATE`, versiones y claves idempotentes convierten dos
   intentos concurrentes en una sola publicación.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Crear tenant desde el formulario público | Elimina la revisión humana y facilita abuso de recursos |
| Compensar eliminando todo ante fallo de identidad | Puede destruir recursos válidos o reutilizados |
| Guardar un estado solo en memoria | No permite reanudación ni diagnóstico |
| Aprobar “el sitio” sin revisión ni checksum | La aprobación quedaría obsoleta silenciosamente |
| Duplicar la publicación dentro de onboarding | Diverge de invariantes, RLS y snapshots existentes |
| Orquestador, cola o microservicio | Sobredimensionado para V1 y contrario a cero inversión |

## Consecuencias

- La conversión es reanudable, pero el proveedor de identidad real sigue
  pendiente para staging.
- Una publicación puede quedar creada y aún no verificada si la resolución
  pública falla; el reintento verifica la misma publicación y termina el caso.
- La aprobación no caduca por tiempo en esta etapa; caduca por cambio material.
- Los mensajes y su historial no caducan.
- Las pruebas necesitan una base canónica y no pueden depender de residuos de
  suites anteriores.
