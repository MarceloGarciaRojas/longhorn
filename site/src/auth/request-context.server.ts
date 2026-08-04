import "server-only";

import type { PoolClient } from "pg";
import { withApplicationDatabase } from "@/src/db/application-database.server";
import { withTenantContext } from "@/src/db/tenant-context";
import { resolveCorrelationId } from "@/src/observability/correlation";
import type { AuthSession } from "./types";

export interface AuthenticatedRequestContext {
  correlationId: string;
  actorUserId: string;
  identitySubject: string;
  authenticationLevel: "aal1" | "aal2";
  tenantId: string | null;
  platformRole: "nexi_admin" | null;
  sessionId: string;
  requestOrigin: string;
}

export function createAuthenticatedRequestContext(
  request: Request,
  session: Readonly<AuthSession>,
): Readonly<AuthenticatedRequestContext> {
  return Object.freeze({
    correlationId: resolveCorrelationId(request),
    actorUserId: session.userId,
    identitySubject: session.identitySubject,
    authenticationLevel: session.assuranceLevel,
    tenantId: session.activeTenantId,
    platformRole:
      session.audience === "nexi_admin" ? ("nexi_admin" as const) : null,
    sessionId: session.sessionId,
    requestOrigin: new URL(request.url).origin,
  });
}

export async function withAuthenticatedTenantDatabase<T>(
  context: Readonly<AuthenticatedRequestContext>,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!context.tenantId || context.platformRole) {
    throw new Error("An active client tenant is required");
  }
  return withApplicationDatabase((pool) =>
    withTenantContext(
      pool,
      {
        tenantId: context.tenantId!,
        actorUserId: context.actorUserId,
        correlationId: context.correlationId,
      },
      operation,
    ),
  );
}
