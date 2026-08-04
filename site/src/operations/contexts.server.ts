import "server-only";

import type { PoolClient } from "pg";
import type { AuthSession } from "@/src/auth/types";
import { withApplicationDatabase } from "@/src/db/application-database.server";
import { withTenantContext } from "@/src/db/tenant-context";

export async function withClientOperation<T>(
  session: Readonly<AuthSession>,
  correlationId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (session.audience !== "client_admin" || !session.activeTenantId) {
    throw Object.assign(new Error("client access denied"), { code: "42501" });
  }
  return withApplicationDatabase((pool) =>
    withTenantContext(
      pool,
      {
        tenantId: session.activeTenantId!,
        actorUserId: session.userId,
        correlationId,
      },
      operation,
    ),
  );
}

export async function withAdminOperation<T>(
  session: Readonly<AuthSession>,
  correlationId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (
    session.audience !== "nexi_admin" ||
    session.assuranceLevel !== "aal2"
  ) {
    throw Object.assign(new Error("admin access denied"), { code: "42501" });
  }
  return withApplicationDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT
           set_config('app.current_session_id', $1, true),
           set_config('app.current_user_id', $2, true),
           set_config('app.current_correlation_id', $3, true)`,
        [session.sessionId, session.userId, correlationId],
      );
      const allowed = await client.query<{ allowed: boolean }>(
        "SELECT app_private.current_actor_is_nexi_admin() AS allowed",
      );
      if (allowed.rows[0]?.allowed !== true) {
        throw Object.assign(new Error("admin access denied"), { code: "42501" });
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
  });
}
