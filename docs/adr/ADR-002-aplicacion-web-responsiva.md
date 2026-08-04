# ADR-002: Aplicación web responsiva antes que aplicaciones nativas

- Estado: aceptado como línea base de arquitectura
- Fecha: 2026-07-14
- Proyecto: Longhorn
- Marca: nexi

## Contexto

Longhorn debe atender visitantes, administradores de empresas y operadores.
Construir aplicaciones nativas para varias plataformas ampliaría el alcance,
las pruebas y el mantenimiento del MVP. La experiencia web permite validar el
producto con menor superficie técnica.

## Decisión

1. La experiencia inicial será una aplicación web responsiva.
2. Los sitios públicos deben diseñarse con enfoque mobile-first.
3. El panel debe estar optimizado principalmente para escritorio y tablet.
4. Las tareas breves y de consulta deben funcionar también desde móvil.
5. No se desarrollarán aplicaciones móviles nativas durante el MVP.
6. Las capacidades móviles avanzadas podrán evaluarse después de validar el
   producto.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Aplicaciones nativas para Android e iOS desde el inicio | Amplían el alcance, las pruebas y el mantenimiento del MVP |
| Aplicaciones separadas por tipo de usuario | Duplican bases de interfaz y esfuerzo de mantenimiento |
| Una interfaz exclusivamente de escritorio | No cubre las tareas breves y de consulta desde móvil |
| Empaquetar prematuramente la aplicación sin necesidad validada | Añade complejidad antes de validar capacidades móviles avanzadas |

## Consecuencias

- Una sola base de interfaz cubre navegadores modernos.
- Menor costo de desarrollo y mantenimiento.
- La experiencia debe probarse en escritorio y móvil.
- Algunas funciones nativas quedan diferidas.
- La accesibilidad y el diseño responsivo son obligatorios.

## Estado actual de implementación

- La aplicación web responsiva constituye la experiencia principal.
- Las aplicaciones móviles nativas siguen fuera del MVP.
- Este ADR no selecciona tecnología de empaquetado móvil.
