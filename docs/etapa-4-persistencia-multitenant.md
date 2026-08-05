# Etapa 4: prueba técnica de persistencia multi-tenant

## Alcance

Esta etapa incorpora PostgreSQL, migraciones, tres entidades mínimas, roles
técnicos separados, contexto de tenant y políticas Row Level Security. No
incorpora autenticación, paneles, contenido, dominios, planes, pagos, mensajes,
onboarding ni funciones comerciales.

La landing no consulta PostgreSQL y puede continuar iniciando sin variables de
base de datos.

## Modelo

| Tabla | Propósito | Restricciones principales | RLS |
| --- | --- | --- | --- |
| `tenants` | Empresa aislada | UUID, slug global único y normalizado, estado controlado | Solo tenant actual con actor miembro |
| `users` | Identidad global futura | UUID, email normalizado único, sin contraseña | Solo usuarios vinculados al tenant actual |
| `tenant_memberships` | Unión usuario-tenant | FKs, combinación tenant/usuario única, estado controlado | Lectura del tenant; escrituras limitadas al actor |

La tabla `nexi_internal.schema_migrations` es metadato técnico y no una entidad
de dominio.

## Roles

### `nexi_migrator`

- propietario del esquema y tablas;
- aplica y revierte migraciones;
- prepara los datos sintéticos;
- no debe utilizarse en solicitudes de la aplicación;
- no es superusuario ni posee `BYPASSRLS`.

### `nexi_app`

- no posee tablas ni puede modificar el esquema;
- no tiene `SUPERUSER`, `CREATEDB`, `CREATEROLE` ni `BYPASSRLS`;
- puede leer las tres tablas únicamente bajo RLS;
- tiene DML limitado sobre membresías y sujeto a políticas;
- utiliza un tiempo máximo de sentencia local.

El superusuario `postgres` existe únicamente dentro del contenedor local o el
servicio temporal de CI para crear los dos roles anteriores.

## Contexto de tenant

El servidor abre una transacción, valida UUID y correlation ID, y establece:

```text
app.current_tenant_id
app.current_user_id
app.current_correlation_id
```

Los valores se establecen mediante `set_config(nombre, valor, true)`. El tercer
argumento limita el valor a la transacción. Antes de ejecutar el caso de uso se
verifica que el actor sea una membresía activa del tenant.

Al confirmar o revertir la transacción, la conexión se libera. Las pruebas
utilizan un pool con una sola conexión para obligar su reutilización y comprobar
que el contexto anterior desaparece.

## Políticas RLS

- `tenants_select_current`: permite leer únicamente el tenant del contexto
  cuando el actor mantiene una membresía activa.
- `users_select_current_tenant`: permite leer usuarios que tengan una membresía
  activa dentro del tenant contextualizado.
- `memberships_select_current`: permite listar solo las membresías del tenant.
- `memberships_insert_self`: impide insertar una membresía para otro tenant o
  para un UUID de usuario ajeno.
- `memberships_update_self`: impide modificar filas ajenas y cambiar
  `tenant_id`.
- `memberships_delete_self`: impide eliminar membresías de otro tenant.

Una consulta sin contexto obtiene cero filas. Un UUID de contexto inválido
falla durante el cast PostgreSQL y un actor sin membresía es rechazado antes del
caso de uso.

## Migraciones

1. `0001_core_schema`
   - crea las tres tablas, restricciones, índices y triggers de `updated_at`;
   - rollback: elimina únicamente estas tablas en una base local o de prueba.
2. `0002_tenant_context_and_rls`
   - crea funciones de contexto, función privada de membresía, grants y
     políticas;
   - rollback: retira grants, políticas, RLS y funciones.

El ejecutor registra versión y checksum en `nexi_internal.schema_migrations`.
Una migración ya aplicada con un checksum diferente falla explícitamente.
`db:reset` solo acepta hosts locales y bases terminadas en `_test`, `_local` o
`_dev`.

## Operación local

Requisitos:

- Node.js y pnpm definidos por el proyecto;
- Docker con Docker Compose.

Preparación:

```powershell
Copy-Item .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm test:db
```

Comandos:

| Comando | Función |
| --- | --- |
| `pnpm db:up` | Inicia PostgreSQL saludable y crea roles locales |
| `pnpm db:down` | Detiene el contenedor y conserva el volumen |
| `pnpm db:clean` | Detiene PostgreSQL y elimina el volumen local |
| `pnpm db:bootstrap` | Crea roles y grants locales/CI |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:status` | Muestra estado de las migraciones |
| `pnpm db:seed` | Inserta Tenant A y Tenant B ficticios |
| `pnpm db:reset` | Revierte, migra y carga seeds en local/test |
| `pnpm db:check` | Comprueba conexión con `nexi_app` restringido |
| `pnpm test:db` | Ejecuta migraciones y aislamiento real |
| `pnpm test:tenant-isolation` | Ejecuta solo casos RLS |

## Datos sintéticos

- Tenant A: `Cobre Norte Ficticia`, usuario
  `ana.demo@example.invalid`.
- Tenant B: `Taller Laguna Ficticio`, usuario
  `bruno.demo@example.invalid`.

Los UUID son determinísticos para que las pruebas intenten accesos cruzados.
Todos los nombres y correos son ficticios.

## CI

GitHub Actions inicia `postgres:17-alpine` como servicio temporal con
credenciales exclusivas de prueba. Después:

1. instala las dependencias bloqueadas;
2. crea los roles restringidos;
3. aplica migraciones;
4. carga datos sintéticos;
5. ejecuta pruebas de migración y aislamiento;
6. ejecuta todos los controles anteriores;
7. ejecuta la auditoría de dependencias.

No hay conexión a una base externa ni despliegue.

## Acceso global futuro del Administrador nexi

No existe bypass global en esta etapa. El acceso futuro deberá utilizar:

- identidad interna con MFA;
- rol técnico separado del rol tenant;
- operaciones exclusivamente server-side;
- auditoría obligatoria;
- políticas o conexión administrativa explícitas;
- prohibición de seleccionar el tenant mediante parámetros públicos.

## Limitaciones pendientes

- autenticar al usuario y derivar `actor_user_id`;
- resolver el tenant desde una sesión o dominio verificado;
- decidir el proveedor PostgreSQL y el adaptador de despliegue;
- evaluar Hyperdrive y el ciclo de vida por solicitud en Workers;
- definir auditoría de operaciones administrativas;
- ejecutar la prueba local en una máquina con Docker.
