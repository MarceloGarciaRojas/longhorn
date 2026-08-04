# ADR-007: Gateway de IA e integraciones

- Estado: aceptado como línea base de arquitectura
- Fecha: 2026-07-14
- Proyecto: Longhorn
- Marca: nexi

## Contexto

Longhorn podrá conectarse en el futuro con proveedores de identidad,
almacenamiento, correo, mensajería, pagos, mapas e inteligencia artificial.
Acoplar el dominio directamente a SDK externos aumentaría dependencia,
dificultaría pruebas y permitiría que costos o fallos del proveedor se
propaguen por la plataforma. La IA requiere controles adicionales de
privacidad, presupuesto, observabilidad y revisión humana.

## Decisión

1. Las integraciones externas deben accederse mediante adaptadores o gateways.
2. La lógica de dominio no debe depender directamente del SDK de un proveedor.
3. Los contratos internos deben representar necesidades de Longhorn, no
   detalles particulares del proveedor.
4. Los secretos deben permanecer fuera del código y del navegador.
5. Deben existir límites, timeouts, manejo de errores y trazabilidad.
6. Los proveedores deben poder reemplazarse sin reescribir el dominio.
7. Las funciones de IA deben controlar tenant, fuentes autorizadas, costos y
   privacidad.
8. La IA no puede ejecutar acciones irreversibles sin aprobación humana.
9. Las capacidades productivas de IA permanecen fuera del MVP mientras no
   exista evidencia, presupuesto y controles aprobados.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Usar SDK externos directamente en todos los módulos | Acopla el dominio y dificulta pruebas y reemplazos |
| Acoplar reglas de negocio a un proveedor único | Aumenta la dependencia y el impacto de fallos o cambios del proveedor |
| Exponer credenciales al navegador | Compromete secretos y amplía la superficie de riesgo |
| Ofrecer IA ilimitada sin control de costos | Impide controlar presupuesto, privacidad y uso por tenant |
| Permitir acciones autónomas irreversibles | Elimina la revisión humana requerida para acciones críticas |
| Introducir microservicios solamente para envolver proveedores | Añade complejidad operacional sin una necesidad demostrada |

## Consecuencias

- Se necesita una capa adicional de abstracción.
- Las pruebas pueden utilizar adaptadores sintéticos o locales.
- Se reduce el riesgo de dependencia tecnológica.
- Cada integración requiere observabilidad y manejo de errores.
- Los costos variables pueden controlarse por ambiente, plan o tenant.
- La IA productiva continúa diferida.
- Los proveedores definitivos pueden decidirse posteriormente.

## Estado actual de implementación

- La decisión arquitectónica está aceptada.
- Existen adaptadores locales o sintéticos en algunos dominios.
- Las integraciones productivas siguen pendientes.
- La IA productiva permanece fuera del MVP.
- Este ADR no selecciona proveedor de IA, correo, pagos o mensajería.
