# ADR-001: Usar monolito modular para el MVP

- Estado: aceptado como línea base de arquitectura
- Fecha: 2026-07-14
- Proyecto: Longhorn
- Marca: nexi

## Contexto

Longhorn es desarrollado inicialmente por un equipo pequeño. El dominio
todavía está evolucionando y el proyecto necesita entregar valor rápidamente.
Introducir múltiples servicios independientes aumentaría la complejidad
operacional, el despliegue, la observabilidad y el costo del MVP.

## Decisión

1. Longhorn utilizará un monolito modular durante el MVP.
2. Existirá un despliegue principal con módulos internos claramente separados.
3. Los módulos deben mantener responsabilidades y contratos definidos.
4. La lógica de negocio no debe quedar mezclada indiscriminadamente entre
   módulos.
5. La arquitectura debe permitir extraer un módulo en el futuro si existe
   evidencia real de carga, independencia de despliegue o necesidad de equipo.
6. No se introducirán microservicios únicamente por expectativa de crecimiento.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Microservicios desde el inicio | Aumentan la complejidad operacional, el despliegue, la observabilidad y el costo del MVP |
| Aplicaciones independientes por cada módulo | Multiplican despliegues, pruebas y mantenimiento sin una necesidad demostrada |
| Un monolito sin límites internos | Mezcla responsabilidades y dificulta una extracción futura |
| Duplicar aplicaciones por cliente | Multiplica el mantenimiento e impide que una sola aplicación atienda múltiples tenants |

## Consecuencias

- Menor complejidad de infraestructura.
- Despliegue, pruebas y diagnóstico más simples.
- Se necesita disciplina para respetar límites internos.
- La extracción futura de módulos sigue siendo posible.
- Una sola aplicación puede atender múltiples tenants.
- Los microservicios quedan sujetos a evidencia posterior.

## Estado actual de implementación

- El monolito modular está aplicado en local y CI.
- No existe autorización implícita de staging o producción por este ADR.
- La decisión no impide separar componentes en el futuro.
