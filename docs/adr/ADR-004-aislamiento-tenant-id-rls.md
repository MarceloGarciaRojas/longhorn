# ADR-004: Aislamiento compartido con tenant_id y RLS en el MVP

- Estado: aceptado como línea base de arquitectura
- Fecha: 2026-07-14
- Proyecto: Longhorn
- Marca: nexi

## Contexto

Longhorn es una plataforma multi-tenant. Varias empresas compartirán aplicación
y base de datos. Ningún usuario debe consultar, inferir o modificar información
de otro tenant. Crear una base independiente por empresa aumentaría costo y
complejidad operacional para el MVP.

## Decisión

1. El MVP utilizará un esquema PostgreSQL compartido.
2. Las entidades pertenecientes a empresas deben incluir tenant_id.
3. tenant_id debe provenir de contexto confiable del servidor.
4. No se debe confiar en tenant_id enviado por el navegador como autoridad.
5. RLS debe aplicarse a las entidades multi-tenant correspondientes.
6. La autorización server-side y RLS deben funcionar conjuntamente.
7. Las consultas, índices, auditoría y cachés deben incluir correctamente el
   contexto del tenant.
8. Deben existir pruebas negativas de acceso cruzado.
9. Las identidades globales pueden existir fuera de un tenant, pero sus
   membresías y permisos deben estar contextualizados.
10. Un tenant especial podría aislarse de otra forma en el futuro si existe una
    necesidad demostrada.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Base de datos independiente por tenant desde el MVP | Aumenta el costo y la complejidad operacional |
| Esquema PostgreSQL independiente por tenant | Multiplica la administración y la evolución del esquema |
| Aislamiento únicamente mediante filtros del frontend | El navegador puede manipularse y no constituye una frontera de autorización |
| Aislamiento solo mediante lógica de aplicación sin RLS | Elimina una capa adicional de protección en la base de datos |
| Confiar en identificadores enviados por el cliente | El navegador no es una fuente confiable de contexto tenant |

## Consecuencias

- Mejor relación entre costo y operación para muchas empresas pequeñas.
- Las políticas RLS y pruebas de aislamiento son obligatorias.
- Los repositorios deben operar con contexto tenant confiable.
- Una configuración incorrecta puede producir un incidente crítico.
- Se necesita monitorear consultas e índices que comiencen por tenant_id.
- La arquitectura conserva la posibilidad de aislar tenants especiales más
  adelante.

## Estado actual de implementación

- El aislamiento tenant_id + RLS está aplicado y probado en local y CI.
- Los roles de aplicación no deben tener BYPASSRLS.
- Este ADR no autoriza datos sensibles ni producción.
