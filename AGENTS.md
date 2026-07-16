# Reglas del Proyecto Longhorn

- Longhorn es una plataforma SaaS B2B multi-tenant para pymes.
- La etapa actual corresponde exclusivamente a la preparación documental del proyecto.
- No se debe iniciar desarrollo funcional sin una tarea explícitamente aprobada.
- La arquitectura prevista para el MVP será una aplicación web responsiva, TypeScript, monolito modular, PostgreSQL y aislamiento multi-tenant mediante `tenant_id` y Row Level Security.
- Nunca se debe confiar en `tenant_id` enviado por el navegador.
- Toda autorización deberá validarse posteriormente en backend.
- No se deben almacenar secretos, tokens ni credenciales en el repositorio.
- El proyecto debe operar inicialmente con herramientas gratuitas, open source o free tier.
- No se deben habilitar cobros automáticos ni servicios pagados sin aprobación expresa.
- El MVP estará limitado a un rubro piloto y tres plantillas.
- Quedan fuera del MVP inicial: reservas, pagos, portales de clientes, inteligencia artificial productiva, módulos escolares o clínicos, marketplace, agentes y microservicios.
- Los documentos de `docs/fuentes` serán considerados referencias oficiales del proyecto.
- Ante contradicciones entre documentos, Codex debe informar el conflicto y no decidir silenciosamente.
- Antes de modificar código, Codex deberá presentar un plan.
- Codex no debe declarar una tarea terminada sin indicar archivos modificados, validaciones realizadas y riesgos pendientes.
