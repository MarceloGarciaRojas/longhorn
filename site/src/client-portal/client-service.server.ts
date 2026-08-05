import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthSession } from "@/src/auth/types";
import { withApplicationDatabase } from "@/src/db/application-database.server";
import { withTenantContext } from "@/src/db/tenant-context";
import {
  getClientDashboard,
  getClientPlan,
  getCompanyProfile,
  getPersonalProfile,
  listClientCompanies,
  listClientSites,
  recordClientEvent,
  updateCompanyProfile,
  updatePersonalProfile,
} from "./client-repository.server";
import type {
  CompanyProfileUpdate,
  PersonalProfileUpdate,
} from "./types";
import { ClientValidationError } from "./validation";

function requireClientTenant(session: Readonly<AuthSession>): string {
  if (session.audience !== "client_admin" || !session.activeTenantId) {
    throw new ClientValidationError("denied", "Empresa activa requerida.");
  }
  return session.activeTenantId;
}

async function withClientTenant<T>(
  session: Readonly<AuthSession>,
  correlationId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const tenantId = requireClientTenant(session);
  return withApplicationDatabase((pool) =>
    withTenantContext(
      pool,
      {
        tenantId,
        actorUserId: session.userId,
        correlationId,
      },
      operation,
    ),
  );
}

function pageCorrelationId(): string {
  return `client-page-${randomUUID()}`;
}

export { listClientCompanies };

export async function loadDashboard(session: Readonly<AuthSession>) {
  const correlationId = pageCorrelationId();
  return withClientTenant(session, correlationId, async (client) => {
    const dashboard = await getClientDashboard(client);
    if (!dashboard) {
      throw new ClientValidationError("denied", "Empresa no disponible.");
    }
    await recordClientEvent(client, {
      session,
      action: "client_panel_accessed",
      resourceType: "client_route",
      resourceId: "/cuenta",
      correlationId,
    });
    return dashboard;
  });
}

export async function loadSites(session: Readonly<AuthSession>) {
  const correlationId = pageCorrelationId();
  return withClientTenant(session, correlationId, async (client) => {
    const sites = await listClientSites(client);
    await recordClientEvent(client, {
      session,
      action: "client_panel_accessed",
      resourceType: "client_route",
      resourceId: "/cuenta/sitios",
      correlationId,
    });
    return sites;
  });
}

export async function loadPlan(session: Readonly<AuthSession>) {
  const correlationId = pageCorrelationId();
  return withClientTenant(session, correlationId, async (client) => {
    const plan = await getClientPlan(client);
    await recordClientEvent(client, {
      session,
      action: "client_panel_accessed",
      resourceType: "client_route",
      resourceId: "/cuenta/plan",
      correlationId,
    });
    return plan;
  });
}

export async function loadProfiles(session: Readonly<AuthSession>) {
  const correlationId = pageCorrelationId();
  return withClientTenant(session, correlationId, async (client) => {
    const [personal, company] = await Promise.all([
      getPersonalProfile(client),
      getCompanyProfile(client),
    ]);
    if (!personal || !company) {
      throw new ClientValidationError("denied", "Perfil no disponible.");
    }
    await recordClientEvent(client, {
      session,
      action: "client_panel_accessed",
      resourceType: "client_route",
      resourceId: "/cuenta/datos",
      correlationId,
    });
    return { personal, company };
  });
}

export async function recordMessagesAccess(session: Readonly<AuthSession>) {
  const correlationId = pageCorrelationId();
  await withClientTenant(session, correlationId, (client) =>
    recordClientEvent(client, {
      session,
      action: "client_panel_accessed",
      resourceType: "client_route",
      resourceId: "/cuenta/mensajes",
      correlationId,
    }),
  );
}

export async function savePersonalProfile(
  session: Readonly<AuthSession>,
  input: Readonly<PersonalProfileUpdate>,
  correlationId: string,
): Promise<number> {
  return withClientTenant(session, correlationId, async (client) => {
    const version = await updatePersonalProfile(client, input);
    if (version === null) {
      throw new ClientValidationError(
        "conflict",
        "El perfil cambió en otra sesión.",
      );
    }
    await recordClientEvent(client, {
      session,
      action: "personal_profile_updated",
      resourceType: "user_profile",
      resourceId: session.userId,
      correlationId,
      newState: {
        changed_fields: ["display_name", "phone", "locale"],
        version,
      },
    });
    return version;
  });
}

export async function saveCompanyProfile(
  session: Readonly<AuthSession>,
  input: Readonly<CompanyProfileUpdate>,
  correlationId: string,
): Promise<number> {
  return withClientTenant(session, correlationId, async (client) => {
    const version = await updateCompanyProfile(client, input);
    if (version === null) {
      throw new ClientValidationError(
        "conflict",
        "El perfil cambió en otra sesión.",
      );
    }
    await recordClientEvent(client, {
      session,
      action: "tenant_profile_updated",
      resourceType: "tenant_profile",
      resourceId: requireClientTenant(session),
      correlationId,
      newState: {
        changed_fields: [
          "display_name",
          "legal_name",
          "contact_email",
          "contact_phone",
          "description",
          "timezone",
          "locale",
        ],
        version,
      },
    });
    return version;
  });
}
