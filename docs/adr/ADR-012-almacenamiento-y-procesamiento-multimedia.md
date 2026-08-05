# ADR-012: Almacenamiento y procesamiento multimedia

- Estado: aceptada para local y CI; pendiente para staging/producción
- Fecha: 2026-07-26
- Proyecto: Longhorn
- Marca: nexi

## Contexto

Vinext genera una aplicación destinada a Cloudflare Workers. El filesystem del
Worker es temporal, su memoria es limitada y `sharp` no debe incorporarse al
bundle ni ejecutar procesamiento pesado dentro de una solicitud productiva.
La Etapa 8B necesita transformar imágenes reales sin contratar servicios ni
decidir credenciales productivas.

## Decisión

1. El dominio utiliza un contrato de objetos independiente del proveedor.
2. Local y CI usan un filesystem acotado a una raíz temporal marcada, fuera del
   repositorio, `public/` y OneDrive.
3. Un proceso Node, enlazado solo a loopback, ejecuta `sharp` con concurrencia y
   límites. La aplicación se comunica por HTTP y nunca entrega rutas al browser.
4. PostgreSQL conserva estados, cuotas, referencias y object keys privados.
5. La entrega privada valida sesión/tenant/sitio. La pública sirve únicamente
   variantes de la publicación actual mediante funciones acotadas y URLs
   content-addressed.
6. Staging y producción fallan cerrados: `local` está prohibido y
   `unconfigured` no procesa ni entrega objetos.
7. Cloudflare R2 es la recomendación preliminar futura. No está aprovisionado,
   conectado ni autorizado.

## Alternativas

| Alternativa | Ventaja | Motivo de descarte actual |
|---|---|---|
| Filesystem del Worker | Sin servicio adicional | Efímero; no es persistencia |
| Supabase Storage | Integración con Supabase | Menor afinidad con el runtime; límites por validar |
| Cloudflare Images | Procesamiento administrado | Servicio no autorizado/potencialmente pagado |
| R2 + cola | Arquitectura productiva natural | Requiere aprobación y diseño asíncrono |
| Node local + adaptador | Real y sin inversión | Solo local/CI |

## Consecuencias

- `sharp@0.35.0`, Apache-2.0, queda como dependencia directa Node-only y no se
  importa desde el grafo de la aplicación/Worker.
- El procesamiento productivo sigue bloqueado hasta aprobar objetos y colas.
- El rollback SQL no borra objetos; `pnpm media:clean-test` limpia únicamente
  una raíz marcada y segura.
- El rollback local/test elimina eventos 8B cuyos tipos ya no existen en el
  esquema anterior.
