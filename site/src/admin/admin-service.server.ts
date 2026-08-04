import "server-only";

import { loadAuthConfig } from "@/src/auth/config";
import { createIdentityProvider } from "@/src/auth/identity-provider.server";
import { normalizeEmail } from "@/src/auth/security";
import type { AuthSession } from "@/src/auth/types";
import {
  acceptInvitation,
  completeInvitation,
  createTenant,
  failInvitation,
  getTenant,
  listAudit,
  listInvitations,
  listMemberships,
  listTenants,
  prepareInvitationResend,
  readDashboard,
  reserveInvitation,
  revokeInvitation,
  setMembershipStatus,
  setTenantStatus,
  updateTenant,
} from "./admin-repository.server";
import type {
  AdminActor,
  AuditOutcome,
  InvitationStatus,
  TenantStatus,
} from "./types";
import {
  isKnownLocale,
  isKnownTimezone,
  isValidSlug,
  normalizeSearch,
  normalizeSlug,
  requestFingerprint,
} from "./validation";

export class AdminValidationError extends Error {
  constructor(
    readonly code:
      | "invalid"
      | "duplicate"
      | "not_found"
      | "conflict"
      | "provider",
  ) {
    super(code);
    this.name = "AdminValidationError";
  }
}

export function adminActor(session: Readonly<AuthSession>): AdminActor {
  return { sessionId: session.sessionId, userId: session.userId };
}

function displayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > 120) {
    throw new AdminValidationError("invalid");
  }
  return normalized;
}

function reason(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 5 || normalized.length > 500) {
    throw new AdminValidationError("invalid");
  }
  return normalized;
}

export async function dashboardFor(session: Readonly<AuthSession>) {
  return readDashboard(adminActor(session));
}

export async function tenantsFor(
  session: Readonly<AuthSession>,
  input: Readonly<{
    search: string | null;
    status: string | null;
    sort: string | null;
    page: number;
  }>,
) {
  const pageSize = 12;
  const status = ["draft", "active", "suspended"].includes(input.status || "")
    ? (input.status as TenantStatus)
    : null;
  const sort = input.sort === "name_asc" ? "name_asc" : "created_desc";
  const rows = await listTenants(adminActor(session), {
    search: normalizeSearch(input.search),
    status,
    sort,
    limit: pageSize,
    offset: (input.page - 1) * pageSize,
  });
  return {
    items: rows,
    total: rows[0]?.totalCount ?? 0,
    page: input.page,
    pageSize,
  };
}

export async function tenantDetailFor(
  session: Readonly<AuthSession>,
  tenantId: string,
) {
  const actor = adminActor(session);
  const tenant = await getTenant(actor, tenantId);
  if (!tenant) {
    return null;
  }
  const [memberships, invitations, audit] = await Promise.all([
    listMemberships(actor, tenantId),
    listInvitations(actor, {
      tenantId,
      status: null,
      limit: 20,
      offset: 0,
    }),
    listAudit(actor, {
      action: null,
      tenantId,
      actorSearch: null,
      from: null,
      to: null,
      outcome: null,
      limit: 12,
      offset: 0,
    }),
  ]);
  return { tenant, memberships, invitations, audit };
}

export async function invitationsFor(
  session: Readonly<AuthSession>,
  input: Readonly<{
    status: string | null;
    page: number;
  }>,
) {
  const pageSize = 15;
  const status = [
    "pending",
    "accepted",
    "expired",
    "revoked",
    "failed",
  ].includes(input.status || "")
    ? (input.status as InvitationStatus)
    : null;
  const rows = await listInvitations(adminActor(session), {
    tenantId: null,
    status,
    limit: pageSize,
    offset: (input.page - 1) * pageSize,
  });
  return {
    items: rows,
    total: rows[0]?.totalCount ?? 0,
    page: input.page,
    pageSize,
  };
}

export async function auditFor(
  session: Readonly<AuthSession>,
  input: Readonly<{
    action: string | null;
    tenantId: string | null;
    actorSearch: string | null;
    from: string | null;
    to: string | null;
    outcome: string | null;
    page: number;
  }>,
) {
  const pageSize = 20;
  const from = input.from ? new Date(`${input.from}T00:00:00.000Z`) : null;
  const to = input.to ? new Date(`${input.to}T23:59:59.999Z`) : null;
  const outcome = ["succeeded", "failed", "blocked"].includes(
    input.outcome || "",
  )
    ? (input.outcome as AuditOutcome)
    : null;
  const rows = await listAudit(adminActor(session), {
    action: normalizeSearch(input.action),
    tenantId: input.tenantId || null,
    actorSearch: normalizeSearch(input.actorSearch),
    from: from && !Number.isNaN(from.valueOf()) ? from : null,
    to: to && !Number.isNaN(to.valueOf()) ? to : null,
    outcome,
    limit: pageSize,
    offset: (input.page - 1) * pageSize,
  });
  return {
    items: rows,
    total: rows[0]?.totalCount ?? 0,
    page: input.page,
    pageSize,
  };
}

export async function createTenantFromForm(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const name = displayName(String(form.get("display_name") || ""));
  const slug = normalizeSlug(String(form.get("slug") || name));
  const timezone = String(form.get("timezone") || "");
  const locale = String(form.get("locale") || "");
  const idempotencyKey = String(form.get("idempotency_key") || "");
  if (
    !isValidSlug(slug) ||
    !isKnownTimezone(timezone) ||
    !isKnownLocale(locale) ||
    !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
  ) {
    throw new AdminValidationError("invalid");
  }
  try {
    return await createTenant(adminActor(session), {
      idempotencyKey,
      fingerprint: requestFingerprint([name, slug, timezone, locale]),
      displayName: name,
      slug,
      timezone,
      locale,
      correlationId,
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateTenantFromForm(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const tenantId = String(form.get("tenant_id") || "");
  const name = displayName(String(form.get("display_name") || ""));
  const slug = normalizeSlug(String(form.get("slug") || name));
  const timezone = String(form.get("timezone") || "");
  const locale = String(form.get("locale") || "");
  const expectedUpdatedAt = new Date(String(form.get("expected_updated_at") || ""));
  if (
    !isValidSlug(slug) ||
    !isKnownTimezone(timezone) ||
    !isKnownLocale(locale) ||
    !/^[0-9a-f-]{36}$/i.test(tenantId) ||
    Number.isNaN(expectedUpdatedAt.valueOf())
  ) {
    throw new AdminValidationError("invalid");
  }
  try {
    await updateTenant(adminActor(session), {
      tenantId,
      expectedUpdatedAt,
      displayName: name,
      slug,
      timezone,
      locale,
      correlationId,
    });
    return tenantId;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function setTenantStatusFromForm(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const tenantId = String(form.get("tenant_id") || "");
  const status = String(form.get("target_status") || "");
  if (
    !/^[0-9a-f-]{36}$/i.test(tenantId) ||
    (status !== "active" && status !== "suspended")
  ) {
    throw new AdminValidationError("invalid");
  }
  try {
    await setTenantStatus(
      adminActor(session),
      tenantId,
      status,
      reason(String(form.get("reason") || "")),
      correlationId,
    );
    return tenantId;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function createInvitationFromForm(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<{ tenantId: string; acceptanceToken?: string }> {
  const config = loadAuthConfig();
  const tenantId = String(form.get("tenant_id") || "");
  const email = normalizeEmail(String(form.get("email") || ""));
  const name = displayName(String(form.get("display_name") || ""));
  const idempotencyKey = String(form.get("idempotency_key") || "");
  if (
    !/^[0-9a-f-]{36}$/i.test(tenantId) ||
    !email ||
    !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
  ) {
    throw new AdminValidationError("invalid");
  }
  const expiresAt = new Date(Date.now() + config.invitationTtlSeconds * 1000);
  let reservation;
  try {
    reservation = await reserveInvitation(adminActor(session), {
      tenantId,
      idempotencyKey,
      fingerprint: requestFingerprint([tenantId, email, name, config.provider]),
      email,
      displayName: name,
      provider: config.provider,
      expiresAt,
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
  if (!reservation.shouldDispatch) {
    return { tenantId };
  }
  try {
    const provider = createIdentityProvider(config);
    const dispatch = await provider.sendInvitation(
      email,
      name,
      `${config.publicUrl}/invitacion/aceptar`,
    );
    await completeInvitation(
      adminActor(session),
      reservation.invitationId,
      dispatch.providerReference,
      expiresAt,
      correlationId,
    );
    return { tenantId, acceptanceToken: dispatch.acceptanceToken };
  } catch {
    await failInvitation(
      adminActor(session),
      reservation.invitationId,
      "El proveedor de identidad no pudo generar la invitación.",
      correlationId,
    ).catch(() => undefined);
    throw new AdminValidationError("provider");
  }
}

export async function resendInvitationFromForm(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<{ acceptanceToken?: string }> {
  const config = loadAuthConfig();
  const invitationId = String(form.get("invitation_id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
    throw new AdminValidationError("invalid");
  }
  const expiresAt = new Date(Date.now() + config.invitationTtlSeconds * 1000);
  let invitation;
  try {
    invitation = await prepareInvitationResend(
      adminActor(session),
      invitationId,
      expiresAt,
    );
  } catch (error) {
    throw mapDatabaseError(error);
  }
  try {
    const provider = createIdentityProvider(config);
    const dispatch = await provider.sendInvitation(
      invitation.invitationEmail,
      invitation.invitationName,
      `${config.publicUrl}/invitacion/aceptar`,
    );
    await completeInvitation(
      adminActor(session),
      invitationId,
      dispatch.providerReference,
      expiresAt,
      correlationId,
    );
    return { acceptanceToken: dispatch.acceptanceToken };
  } catch {
    await failInvitation(
      adminActor(session),
      invitationId,
      "El proveedor de identidad no pudo renovar la invitación.",
      correlationId,
    ).catch(() => undefined);
    throw new AdminValidationError("provider");
  }
}

export async function revokeInvitationFromForm(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<void> {
  const invitationId = String(form.get("invitation_id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
    throw new AdminValidationError("invalid");
  }
  try {
    await revokeInvitation(
      adminActor(session),
      invitationId,
      reason(String(form.get("reason") || "")),
      correlationId,
    );
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function setMembershipStatusFromForm(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const membershipId = String(form.get("membership_id") || "");
  const tenantId = String(form.get("tenant_id") || "");
  const status = String(form.get("target_status") || "");
  if (
    !/^[0-9a-f-]{36}$/i.test(membershipId) ||
    !/^[0-9a-f-]{36}$/i.test(tenantId) ||
    (status !== "active" && status !== "disabled")
  ) {
    throw new AdminValidationError("invalid");
  }
  try {
    await setMembershipStatus(
      adminActor(session),
      membershipId,
      status,
      reason(String(form.get("reason") || "")),
      correlationId,
    );
    return tenantId;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function acceptInvitationToken(
  token: string,
  correlationId: string,
) {
  const config = loadAuthConfig();
  const provider = createIdentityProvider(config);
  const verified = await provider.verifyInvitation(token);
  if (!verified.identity.emailVerified) {
    throw new AdminValidationError("invalid");
  }
  try {
    return await acceptInvitation({
      provider: verified.identity.provider,
      providerReference: verified.providerReference,
      providerSubject: verified.identity.subject,
      email: verified.identity.email,
      displayName: verified.identity.email.split("@")[0],
      correlationId,
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

function mapDatabaseError(error: unknown): AdminValidationError {
  const code = (error as { code?: string })?.code;
  let mapped: AdminValidationError;
  if (code === "23505") {
    mapped = new AdminValidationError("duplicate");
  } else if (code === "P0002") {
    mapped = new AdminValidationError("not_found");
  } else if (code === "40001") {
    mapped = new AdminValidationError("conflict");
  } else if (error instanceof AdminValidationError) {
    return error;
  } else {
    mapped = new AdminValidationError("invalid");
  }
  Object.defineProperty(mapped, "cause", { value: error, enumerable: false });
  return mapped;
}
