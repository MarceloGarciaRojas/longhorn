import type { Pool, PoolClient } from "pg";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface TenantContext {
  tenantId: string;
  actorUserId: string;
  correlationId: string;
}

export class InvalidTenantContextError extends Error {
  readonly field: keyof TenantContext;

  constructor(field: keyof TenantContext) {
    super(`Invalid trusted tenant context field: ${field}`);
    this.name = "InvalidTenantContextError";
    this.field = field;
  }
}

export class TenantContextRejectedError extends Error {
  constructor() {
    super("The trusted actor is not an active member of the tenant");
    this.name = "TenantContextRejectedError";
  }
}

function validateContext(context: TenantContext): void {
  if (!UUID_PATTERN.test(context.tenantId)) {
    throw new InvalidTenantContextError("tenantId");
  }
  if (!UUID_PATTERN.test(context.actorUserId)) {
    throw new InvalidTenantContextError("actorUserId");
  }
  if (!CORRELATION_PATTERN.test(context.correlationId)) {
    throw new InvalidTenantContextError("correlationId");
  }
}

export async function withTenantContext<T>(
  pool: Pool,
  context: Readonly<TenantContext>,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  validateContext(context);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT
         set_config('app.current_tenant_id', $1, true),
         set_config('app.current_user_id', $2, true),
         set_config('app.current_correlation_id', $3, true)`,
      [context.tenantId, context.actorUserId, context.correlationId],
    );

    const authorization = await client.query<{ allowed: boolean }>(
      "SELECT app_private.current_actor_is_active_member() AS allowed",
    );
    if (authorization.rows[0]?.allowed !== true) {
      throw new TenantContextRejectedError();
    }

    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
