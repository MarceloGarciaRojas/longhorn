# ADR-010: Supabase Auth y sesiones opacas de aplicación

- Estado: aceptado para V1
- Fecha: 2026-07-25
- Proyecto: Longhorn
- Marca comercial: nexi

## Contexto

Longhorn necesita autenticar Clientes Administradores y personal interno sin
almacenar contraseñas. El runtime efectivo es Vinext/App Router con destino
Cloudflare y compatibilidad Node, mientras PostgreSQL y RLS ya aíslan los datos
por tenant. La solución debe comenzar sin inversión y ser reproducible en CI.

## Alternativas

| Alternativa | Costo inicial | Runtime | MFA y recuperación | Operación | Decisión |
| --- | ---: | --- | --- | --- | --- |
| Supabase Auth | Free tier | API HTTP compatible | TOTP básico y recuperación | Baja | Elegida |
| OIDC gestionado | Free tier variable | Estándar | Maduro; límites comerciales variables | Baja | Adaptable en el futuro |
| Keycloak | Sin licencia | OIDC | Completo | Alta; otro servicio crítico | Diferido |
| Autenticación propia | Sin licencia | Compatible | Debe construirse y auditarse | Muy alta | Rechazada |
| Proveedor de pruebas | Sin costo | Local/CI | Determinista | Baja | Solo `local/test` |

Referencias:

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase MFA TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Supabase pricing](https://supabase.com/pricing)
- [Keycloak en contenedor](https://www.keycloak.org/getting-started/getting-started-docker)

## Decisión

- Supabase Auth será el proveedor productivo inicial.
- La aplicación consume su API detrás de `IdentityProvider`; ningún módulo de
  negocio recibe objetos o tokens de Supabase.
- En `local/test` se usa un adaptador determinista cargado solo desde variables
  de entorno. La configuración lo prohíbe en otros ambientes.
- Longhorn mantiene una sesión propia opaca en PostgreSQL. La cookie contiene
  únicamente 256 bits aleatorios; la base conserva su hash SHA-256.
- Roles, personal interno, membresías, tenant activo, revocación y auditoría
  pertenecen a Longhorn.
- Los tokens de Supabase existen únicamente durante la llamada server-side. La
  excepción es una concesión de recuperación cifrada, HttpOnly, con diez
  minutos de vigencia y nonce de un solo uso registrado por hash.
- El Administrador nexi necesita `platform_staff.role = nexi_admin`, estado
  activo y AAL2. El acceso productivo falla de forma cerrada sin TOTP.
- No se usa middleware como único límite. Server Components, handlers y
  funciones `SECURITY DEFINER` vuelven a validar cada condición.

## Provisionamiento

La V1 no crea administradores públicos. Un operador autorizado debe:

1. crear o invitar la identidad en Supabase;
2. crear `users` y `auth_identities`;
3. crear `tenant_memberships` o `platform_staff`;
4. exigir verificación del correo;
5. completar TOTP antes de permitir acceso interno.

El seed incluido es sintético, no contiene contraseñas y solo sirve para
local/CI. Las credenciales de prueba se generan en memoria al ejecutar tests.

## Recuperación

Supabase debe configurar una URL autorizada bajo
`/api/auth/recovery/verify`. La plantilla de correo debe entregar el
`token_hash` de un solo uso al endpoint server-side; no debe enviar el token de
sesión a código cliente. No se conecta SMTP productivo en esta etapa.

## Consecuencias

Positivas:

- contraseñas y MFA quedan fuera de las tablas de aplicación;
- proveedor reemplazable;
- sesiones y autorización revocables inmediatamente;
- CI no depende de un servicio cloud;
- TOTP básico está disponible en el plan gratuito documentado.

Costos y límites:

- todavía debe crearse y validar un proyecto Supabase antes de staging;
- la inscripción TOTP inicial se completa como parte del provisionamiento
  asistido; no existe todavía una pantalla de autoservicio;
- no hay renovación deslizante: al expirar, se exige autenticación nueva;
- PostgreSQL es la protección distribuida inicial para rate limiting y requiere
  una política futura de limpieza de filas.
