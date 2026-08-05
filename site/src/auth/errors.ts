export type IdentityProviderErrorCode =
  | "invalid_credentials"
  | "mfa_required"
  | "mfa_not_enrolled"
  | "provider_unavailable";

export class IdentityProviderError extends Error {
  readonly code: IdentityProviderErrorCode;

  constructor(code: IdentityProviderErrorCode) {
    super(code);
    this.name = "IdentityProviderError";
    this.code = code;
  }
}

export class AuthConfigurationError extends Error {
  readonly variableName: string;

  constructor(variableName: string, reason: string) {
    super(`Invalid authentication configuration for ${variableName}: ${reason}`);
    this.name = "AuthConfigurationError";
    this.variableName = variableName;
  }
}
