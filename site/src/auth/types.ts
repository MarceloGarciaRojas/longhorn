export const AUTH_AUDIENCES = ["client_admin", "nexi_admin"] as const;
export const ASSURANCE_LEVELS = ["aal1", "aal2"] as const;
export const AUTH_PROVIDER_NAMES = ["supabase", "test"] as const;

export type AuthAudience = (typeof AUTH_AUDIENCES)[number];
export type AssuranceLevel = (typeof ASSURANCE_LEVELS)[number];
export type AuthProviderName = (typeof AUTH_PROVIDER_NAMES)[number];

export interface ProviderIdentity {
  provider: AuthProviderName;
  subject: string;
  email: string;
  emailVerified: boolean;
  assuranceLevel: AssuranceLevel;
}

export interface AuthenticateInput {
  email: string;
  password: string;
  oneTimeCode?: string;
  requireMfa: boolean;
}

export interface IdentityProvider {
  readonly name: AuthProviderName;
  authenticate(input: Readonly<AuthenticateInput>): Promise<ProviderIdentity>;
  requestPasswordRecovery(email: string, redirectTo: string): Promise<void>;
  verifyPasswordRecovery(tokenHash: string): Promise<RecoveryGrant>;
  updatePassword(accessToken: string, newPassword: string): Promise<void>;
  sendInvitation(
    email: string,
    displayName: string,
    redirectTo: string,
  ): Promise<InvitationDispatch>;
  verifyInvitation(token: string): Promise<VerifiedInvitationIdentity>;
}

export interface RecoveryGrant {
  accessToken: string;
  identity: ProviderIdentity;
}

export interface InvitationDispatch {
  providerReference: string;
  acceptanceToken?: string;
}

export interface VerifiedInvitationIdentity {
  providerReference: string;
  identity: ProviderIdentity;
}

export interface LinkedIdentity {
  userId: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
}

export interface AuthTenant {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  identityProvider: AuthProviderName;
  identitySubject: string;
  email: string;
  displayName: string;
  audience: AuthAudience;
  assuranceLevel: AssuranceLevel;
  activeTenantId: string | null;
  activeTenantName: string | null;
  expiresAt: Date;
}

export interface RecoveryEnvelope extends RecoveryGrant {
  nonce: string;
}
