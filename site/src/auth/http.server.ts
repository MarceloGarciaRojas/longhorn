import "server-only";

import { NextResponse } from "next/server";
import { resolveCorrelationId } from "@/src/observability/correlation";
import { loadAuthConfig } from "./config";
import { IdentityProviderError } from "./errors";
import { createIdentityProvider } from "./identity-provider.server";
import {
  consumeAuthRateLimit,
  consumeRecoveryGrant,
  createAuthSession,
  isActivePlatformStaff,
  listAuthTenants,
  readAuthSession,
  registerRecoveryGrant,
  resolveLinkedIdentity,
  revokeAllAuthSessions,
  revokeAuthSession,
  rotateAuthSessionTenant,
  writeAuthAuditEvent,
} from "./auth-repository.server";
import {
  createSessionToken,
  hashOptionalValue,
  hashPrivateIdentifier,
  hashSessionToken,
  hasTrustedOrigin,
  isUuid,
  normalizeEmail,
  openRecoveryGrant,
  readCookie,
  resolveClientAddress,
  sealRecoveryGrant,
} from "./security";
import type { AuthAudience, AuthSession } from "./types";

const GENERIC_LOGIN_ERROR = "invalid";

function redirectResponse(
  request: Request,
  path: string,
  status = 303,
): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), status);
}

function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  const config = loadAuthConfig();
  response.cookies.set(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

function clearSessionCookie(response: NextResponse): void {
  const config = loadAuthConfig();
  response.cookies.set(config.cookieName, "", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

function setRecoveryCookie(response: NextResponse, value: string): void {
  const config = loadAuthConfig();
  response.cookies.set(config.recoveryCookieName, value, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
  });
}

function clearRecoveryCookie(response: NextResponse): void {
  const config = loadAuthConfig();
  response.cookies.set(config.recoveryCookieName, "", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

function loginPath(audience: AuthAudience): string {
  return audience === "nexi_admin" ? "/nexi-interno/ingresar" : "/ingresar";
}

function destinationPath(
  audience: AuthAudience,
  tenantCount: number,
): string {
  if (audience === "nexi_admin") {
    return "/nexi-interno";
  }
  return tenantCount === 1 ? "/cuenta" : "/seleccionar-empresa";
}

async function readSessionFromRequest(
  request: Request,
): Promise<{ token: string; session: AuthSession } | null> {
  const config = loadAuthConfig();
  const token = readCookie(request, config.cookieName);
  if (!token) {
    return null;
  }
  const session = await readAuthSession(hashSessionToken(token));
  return session ? { token, session } : null;
}

async function rateLimitLogin(
  request: Request,
  email: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const config = loadAuthConfig();
  const address = resolveClientAddress(request, config.environment);
  const [byIp, byIdentity] = await Promise.all([
    consumeAuthRateLimit(
      "login_ip",
      hashPrivateIdentifier(config, `login-ip:${address}`),
      20,
      15 * 60,
      15 * 60,
    ),
    consumeAuthRateLimit(
      "login_identity",
      hashPrivateIdentifier(config, `login-identity:${email}`),
      8,
      15 * 60,
      15 * 60,
    ),
  ]);
  return {
    allowed: byIp.allowed && byIdentity.allowed,
    retryAfterSeconds: Math.max(
      byIp.retryAfterSeconds,
      byIdentity.retryAfterSeconds,
    ),
  };
}

export async function handleLogin(request: Request): Promise<NextResponse> {
  const config = loadAuthConfig();
  const correlationId = resolveCorrelationId(request);
  const form = await request.formData();
  const audience =
    form.get("audience") === "nexi_admin"
      ? ("nexi_admin" as const)
      : ("client_admin" as const);
  const basePath = loginPath(audience);

  if (!hasTrustedOrigin(request, config)) {
    return redirectResponse(request, `${basePath}?error=request`);
  }

  const email = normalizeEmail(String(form.get("email") || ""));
  const password = String(form.get("password") || "");
  const oneTimeCode = String(form.get("one_time_code") || "").trim();
  if (!email || password.length < 1 || password.length > 1024) {
    return redirectResponse(request, `${basePath}?error=${GENERIC_LOGIN_ERROR}`);
  }

  const limiter = await rateLimitLogin(request, email);
  if (!limiter.allowed) {
    await writeAuthAuditEvent({
      provider: config.provider,
      audience,
      eventType: "login_rate_limited",
      outcome: "blocked",
      correlationId,
      metadata: { retry_after_seconds: limiter.retryAfterSeconds },
    });
    const response = redirectResponse(request, `${basePath}?error=rate`, 303);
    response.headers.set("retry-after", String(limiter.retryAfterSeconds));
    return response;
  }

  try {
    const provider = createIdentityProvider(config);
    const providerIdentity = await provider.authenticate({
      email,
      password,
      oneTimeCode: oneTimeCode || undefined,
      requireMfa: audience === "nexi_admin",
    });
    if (!providerIdentity.emailVerified) {
      throw new IdentityProviderError("invalid_credentials");
    }
    const account = await resolveLinkedIdentity(providerIdentity);
    if (!account || account.status !== "active") {
      throw new IdentityProviderError("invalid_credentials");
    }

    const tenants =
      audience === "client_admin"
        ? await listAuthTenants(account.userId)
        : [];
    if (
      audience === "client_admin" &&
      tenants.length === 0 &&
      (await isActivePlatformStaff(account.userId))
    ) {
      throw new IdentityProviderError("invalid_credentials");
    }
    if (
      audience === "nexi_admin" &&
      (providerIdentity.assuranceLevel !== "aal2" ||
        !(await isActivePlatformStaff(account.userId)))
    ) {
      throw new IdentityProviderError("invalid_credentials");
    }

    const token = createSessionToken();
    const ttl =
      audience === "nexi_admin"
        ? config.adminSessionTtlSeconds
        : config.sessionTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const activeTenantId =
      audience === "client_admin" && tenants.length === 1
        ? tenants[0].tenantId
        : null;
    const address = resolveClientAddress(request, config.environment);
    await createAuthSession({
      tokenHash: hashSessionToken(token),
      userId: account.userId,
      identityProvider: providerIdentity.provider,
      identitySubject: providerIdentity.subject,
      audience,
      assuranceLevel: providerIdentity.assuranceLevel,
      activeTenantId,
      expiresAt,
      userAgentHash: hashOptionalValue(request.headers.get("user-agent")),
      ipHash: hashPrivateIdentifier(config, `session-ip:${address}`),
    });
    await writeAuthAuditEvent({
      userId: account.userId,
      tenantId: activeTenantId,
      provider: config.provider,
      audience,
      eventType: "login_succeeded",
      outcome: "succeeded",
      correlationId,
    });
    if (audience === "nexi_admin") {
      await writeAuthAuditEvent({
        userId: account.userId,
        provider: config.provider,
        audience,
        eventType: "mfa_succeeded",
        outcome: "succeeded",
        correlationId,
      });
    }

    const response = redirectResponse(
      request,
      destinationPath(audience, tenants.length),
    );
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    const providerCode =
      error instanceof IdentityProviderError ? error.code : "provider_unavailable";
    await writeAuthAuditEvent({
      provider: config.provider,
      audience,
      eventType: "login_failed",
      outcome: "failed",
      correlationId,
      metadata: { reason: providerCode },
    });
    if (
      audience === "nexi_admin" &&
      (providerCode === "mfa_required" || providerCode === "mfa_not_enrolled")
    ) {
      await writeAuthAuditEvent({
        provider: config.provider,
        audience,
        eventType: "mfa_required",
        outcome: "blocked",
        correlationId,
      });
    }
    const publicCode =
      providerCode === "mfa_required" || providerCode === "mfa_not_enrolled"
        ? "mfa"
        : providerCode === "provider_unavailable"
          ? "unavailable"
          : GENERIC_LOGIN_ERROR;
    return redirectResponse(request, `${basePath}?error=${publicCode}`);
  }
}

export async function handleLogout(request: Request): Promise<NextResponse> {
  const config = loadAuthConfig();
  const correlationId = resolveCorrelationId(request);
  if (!hasTrustedOrigin(request, config)) {
    return new NextResponse("Solicitud no válida", { status: 403 });
  }
  const current = await readSessionFromRequest(request);
  if (current) {
    await revokeAuthSession(hashSessionToken(current.token), "user_logout");
    await writeAuthAuditEvent({
      userId: current.session.userId,
      tenantId: current.session.activeTenantId,
      provider: config.provider,
      audience: current.session.audience,
      eventType: "logout",
      outcome: "succeeded",
      correlationId,
    });
  }
  const response = redirectResponse(
    request,
    current?.session.audience === "nexi_admin"
      ? "/nexi-interno/ingresar"
      : "/",
  );
  clearSessionCookie(response);
  return response;
}

export async function handleTenantSelection(
  request: Request,
): Promise<NextResponse> {
  const config = loadAuthConfig();
  const correlationId = resolveCorrelationId(request);
  if (!hasTrustedOrigin(request, config)) {
    return new NextResponse("Solicitud no válida", { status: 403 });
  }
  const current = await readSessionFromRequest(request);
  if (!current || current.session.audience !== "client_admin") {
    return redirectResponse(request, "/ingresar");
  }
  const form = await request.formData();
  const tenantId = String(form.get("tenant_id") || "");
  if (!isUuid(tenantId)) {
    return redirectResponse(request, "/seleccionar-empresa?error=invalid");
  }
  const selectionLimit = await consumeAuthRateLimit(
    "tenant_selection",
    hashPrivateIdentifier(
      config,
      `tenant-selection:${current.session.userId}`,
    ),
    20,
    10 * 60,
    10 * 60,
  );
  if (!selectionLimit.allowed) {
    return redirectResponse(request, "/seleccionar-empresa?error=rate");
  }

  try {
    const newToken = createSessionToken();
    const expiresAt = current.session.expiresAt;
    const address = resolveClientAddress(request, config.environment);
    await rotateAuthSessionTenant(
      hashSessionToken(current.token),
      hashSessionToken(newToken),
      tenantId,
      expiresAt,
      hashOptionalValue(request.headers.get("user-agent")),
      hashPrivateIdentifier(config, `session-ip:${address}`),
    );
    await writeAuthAuditEvent({
      userId: current.session.userId,
      tenantId,
      provider: config.provider,
      audience: "client_admin",
      eventType: "tenant_selected",
      outcome: "succeeded",
      correlationId,
    });
    const response = redirectResponse(request, "/cuenta");
    setSessionCookie(response, newToken, expiresAt);
    return response;
  } catch {
    await writeAuthAuditEvent({
      userId: current.session.userId,
      provider: config.provider,
      audience: "client_admin",
      eventType: "tenant_selected",
      outcome: "failed",
      correlationId,
    });
    return redirectResponse(request, "/seleccionar-empresa?error=invalid");
  }
}

export async function handlePasswordRecovery(
  request: Request,
): Promise<NextResponse> {
  const config = loadAuthConfig();
  const correlationId = resolveCorrelationId(request);
  if (!hasTrustedOrigin(request, config)) {
    return new NextResponse("Solicitud no válida", { status: 403 });
  }
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") || ""));
  const fallbackEmail = "invalid@example.invalid";
  const identityKey = email || fallbackEmail;
  const address = resolveClientAddress(request, config.environment);
  const [byIp, byIdentity] = await Promise.all([
    consumeAuthRateLimit(
      "recovery_ip",
      hashPrivateIdentifier(config, `recovery-ip:${address}`),
      10,
      60 * 60,
      60 * 60,
    ),
    consumeAuthRateLimit(
      "recovery_identity",
      hashPrivateIdentifier(config, `recovery-identity:${identityKey}`),
      3,
      60 * 60,
      60 * 60,
    ),
  ]);

  if (email && byIp.allowed && byIdentity.allowed) {
    try {
      await createIdentityProvider(config).requestPasswordRecovery(
        email,
        `${config.publicUrl}/api/auth/recovery/verify`,
      );
    } catch {
      // The public response remains generic to avoid account enumeration.
    }
  }

  await writeAuthAuditEvent({
    provider: config.provider,
    eventType: "password_recovery_requested",
    outcome: byIp.allowed && byIdentity.allowed ? "succeeded" : "blocked",
    correlationId,
  });
  return redirectResponse(request, "/recuperar-clave?sent=1");
}

export async function handleRecoveryVerification(
  request: Request,
): Promise<NextResponse> {
  const config = loadAuthConfig();
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash") || "";
  if (tokenHash.length < 16 || tokenHash.length > 2048) {
    return redirectResponse(request, "/restablecer-clave?error=invalid");
  }
  const address = resolveClientAddress(request, config.environment);
  const limiter = await consumeAuthRateLimit(
    "recovery_verify_ip",
    hashPrivateIdentifier(config, `recovery-verify:${address}`),
    10,
    60 * 60,
    60 * 60,
  );
  if (!limiter.allowed) {
    return redirectResponse(request, "/restablecer-clave?error=invalid");
  }
  try {
    const grant =
      await createIdentityProvider(config).verifyPasswordRecovery(tokenHash);
    const nonce = createSessionToken();
    await registerRecoveryGrant(
      hashSessionToken(nonce),
      new Date(Date.now() + 10 * 60 * 1000),
    );
    const response = redirectResponse(request, "/restablecer-clave");
    setRecoveryCookie(
      response,
      sealRecoveryGrant(config, { ...grant, nonce }),
    );
    return response;
  } catch {
    return redirectResponse(request, "/restablecer-clave?error=invalid");
  }
}

export async function handlePasswordReset(
  request: Request,
): Promise<NextResponse> {
  const config = loadAuthConfig();
  const correlationId = resolveCorrelationId(request);
  if (!hasTrustedOrigin(request, config)) {
    return new NextResponse("Solicitud no válida", { status: 403 });
  }
  const address = resolveClientAddress(request, config.environment);
  const limiter = await consumeAuthRateLimit(
    "password_reset_ip",
    hashPrivateIdentifier(config, `password-reset:${address}`),
    8,
    60 * 60,
    60 * 60,
  );
  if (!limiter.allowed) {
    return redirectResponse(request, "/restablecer-clave?error=invalid");
  }
  const sealedGrant = readCookie(request, config.recoveryCookieName);
  const grant = sealedGrant ? openRecoveryGrant(config, sealedGrant) : null;
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const confirmation = String(form.get("password_confirmation") || "");
  if (
    !grant ||
    password.length < 12 ||
    password.length > 128 ||
    password !== confirmation
  ) {
    return redirectResponse(request, "/restablecer-clave?error=invalid");
  }

  try {
    if (!(await consumeRecoveryGrant(hashSessionToken(grant.nonce)))) {
      throw new IdentityProviderError("invalid_credentials");
    }
    await createIdentityProvider(config).updatePassword(
      grant.accessToken,
      password,
    );
    const account = await resolveLinkedIdentity(grant.identity);
    if (account) {
      await revokeAllAuthSessions(account.userId, "password_reset");
      await writeAuthAuditEvent({
        userId: account.userId,
        provider: config.provider,
        eventType: "password_reset_completed",
        outcome: "succeeded",
        correlationId,
      });
    }
    const response = redirectResponse(request, "/ingresar?reset=1");
    clearRecoveryCookie(response);
    clearSessionCookie(response);
    return response;
  } catch {
    const response = redirectResponse(
      request,
      "/restablecer-clave?error=invalid",
    );
    clearRecoveryCookie(response);
    return response;
  }
}
