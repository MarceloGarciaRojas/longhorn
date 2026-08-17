# ADR-013: Infraestructura Alfa Cloudflare y Supabase

- Estado: aceptada para preparación Alfa; aprovisionamiento pendiente
- Fecha: 2026-08-17
- Proyecto: Longhorn
- Marca comercial: nexi

## Contexto

nexi necesita promover el recorrido Restaurant desde local/CI a un entorno
persistente sin sustituir PostgreSQL, debilitar RLS, crear una identidad
paralela ni asumir costos. El runtime existente es Vinext sobre Cloudflare y ya
existen adaptadores para Supabase Auth y object storage.

R2 era una recomendación preliminar en ADR-012, no una decisión productiva. Su
activación requiere una suscripción separada y potencial medio de pago. Para la
Alfa, Supabase Storage ya está incluido en el mismo plan Free requerido para
PostgreSQL/Auth y sus límites cubren la prueba controlada.

## Decisión

1. La aplicación Alfa se ejecutará inicialmente en Cloudflare Workers Free con
   URL `workers.dev`, observabilidad Workers Logs y Hyperdrive Free. Esta
   selección queda condicionada al smoke real del primer deployment: las rutas
   Restaurant de autenticación, panel, edición, preview, publicación y
   resolución pública deben operar sin exceder el límite efectivo de CPU del
   plan Free ni presentar throttling. Si falla, se reevaluará únicamente el
   adaptador/runtime, sin cambiar PostgreSQL, RLS, Supabase Auth, Storage ni los
   contratos del dominio.
2. Un proyecto Supabase Free en São Paulo proveerá PostgreSQL y Auth detrás de
   los adaptadores existentes.
3. Ese mismo proyecto proveerá un bucket privado Supabase Storage para objetos
   Alfa mediante `ObjectStorage`; la aplicación seguirá autorizando cada
   lectura y nunca expondrá la secret key.
4. El runtime web utilizará exclusivamente `nexi_app` a través de una única
   configuración Hyperdrive con query caching completamente deshabilitado
   (`--caching-disabled`). Alpha prioriza read-after-write y revocación de
   sesiones/permisos; no se creará un segundo Hyperdrive cacheado.
   Aprovisionamiento y migraciones usarán credenciales separadas que no se
   despliegan.
5. `local/test` conservan identidad sintética, PostgreSQL efímero y storage
   local. CI no recibe ni consulta recursos Alfa.
6. Supabase Free no se considera mecanismo de backup. Se realizarán dumps
   lógicos fuera del repositorio y restore rehearsal aislado antes del piloto.
7. El procesamiento `sharp` no se ejecutará dentro del Worker. Hasta conectar
   un procesador Node persistente, uploads Alfa fallan cerrados.
8. Ningún plan pagado, tarjeta, add-on, dominio comercial o despliegue queda
   autorizado por esta decisión.

## Alternativas

| Alternativa | Resultado |
| --- | --- |
| Vercel Hobby | Rechazada: uso comercial no permitido por el plan Free. |
| Vercel Pro | Diferida: costo y arquitectura distinta sin necesidad Alfa. |
| Neon + proveedor Auth + storage | Rechazada: más proveedores y operación. |
| Cloudflare R2 | Diferida: buen encaje técnico, pero suscripción separada y mayor superficie de billing. |
| Supabase completo incluido Storage | Elegida para Alfa por reutilización, costo cero y portabilidad suficiente. |
| D1 | Rechazada: reemplazaría PostgreSQL y sus controles ya validados. |

## Consecuencias

- La Alfa puede mantenerse en USD 0 dentro de cuotas, con riesgo de pausa y
  restricción por límites.
- Workers Free es un runtime Alfa condicionado, no una aceptación definitiva:
  el go/no-go exige evidencia real de CPU, outcome y throttling del SHA exacto.
- Deshabilitar el caché de Hyperdrive sacrifica optimización de lectura para
  evitar lecturas obsoletas después de escrituras o revocaciones sensibles.
- El lock-in queda acotado a adaptadores HTTP/Hyperdrive; datos PostgreSQL y
  claves de objeto siguen exportables.
- La secret key de Supabase tiene alto privilegio sobre Storage y debe
  permanecer solo server-side; aislamiento y rutas controladas se prueban en
  nexi.
- La Alfa no se declara funcional hasta conectar procesamiento multimedia,
  probar recuperación, backup/restore y completar el recorrido Restaurant.
