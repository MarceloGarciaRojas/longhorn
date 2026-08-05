import "server-only";

import { IdentityProviderError } from "./errors";
import { normalizeEmail } from "./security";
import type {
  AuthenticateInput,
  IdentityProvider,
  InvitationDispatch,
  ProviderIdentity,
  RecoveryGrant,
  VerifiedInvitationIdentity,
} from "./types";

interface SupabaseFactor {
  id?: string;
  factor_type?: string;
  status?: string;
}

interface SupabaseUser {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  factors?: SupabaseFactor[];
}

interface SupabaseTokenResponse {
  access_token?: string;
  user?: SupabaseUser;
}

export class SupabaseIdentityProvider implements IdentityProvider {
  readonly name = "supabase" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly publishableKey: string,
    private readonly secretKey?: string,
  ) {}

  private async call(
    path: string,
    init: RequestInit,
    accessToken?: string,
  ): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl.replace(/\/$/, "")}/auth/v1${path}`, {
        ...init,
        headers: {
          apikey: this.publishableKey,
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new IdentityProviderError("provider_unavailable");
    }
  }

  async authenticate(
    input: Readonly<AuthenticateInput>,
  ): Promise<ProviderIdentity> {
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new IdentityProviderError("invalid_credentials");
    }

    const loginResponse = await this.call("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password: input.password }),
    });
    if (!loginResponse.ok) {
      throw new IdentityProviderError(
        loginResponse.status >= 500
          ? "provider_unavailable"
          : "invalid_credentials",
      );
    }

    const login = (await loginResponse.json()) as SupabaseTokenResponse;
    const providerEmail = normalizeEmail(login.user?.email || "");
    if (!login.access_token || !login.user?.id || !providerEmail) {
      throw new IdentityProviderError("provider_unavailable");
    }

    let assuranceLevel: "aal1" | "aal2" = "aal1";
    if (input.requireMfa) {
      const factor = login.user.factors?.find(
        (item) =>
          item.factor_type === "totp" &&
          item.status === "verified" &&
          typeof item.id === "string",
      );
      if (!factor?.id) {
        throw new IdentityProviderError("mfa_not_enrolled");
      }
      if (!input.oneTimeCode) {
        throw new IdentityProviderError("mfa_required");
      }

      const challengeResponse = await this.call(
        `/factors/${encodeURIComponent(factor.id)}/challenge`,
        { method: "POST", body: "{}" },
        login.access_token,
      );
      if (!challengeResponse.ok) {
        throw new IdentityProviderError(
          challengeResponse.status >= 500
            ? "provider_unavailable"
            : "mfa_required",
        );
      }
      const challenge = (await challengeResponse.json()) as {
        id?: string;
      };
      if (!challenge.id) {
        throw new IdentityProviderError("provider_unavailable");
      }

      const verifyResponse = await this.call(
        `/factors/${encodeURIComponent(factor.id)}/verify`,
        {
          method: "POST",
          body: JSON.stringify({
            challenge_id: challenge.id,
            code: input.oneTimeCode,
          }),
        },
        login.access_token,
      );
      if (!verifyResponse.ok) {
        throw new IdentityProviderError(
          verifyResponse.status >= 500
            ? "provider_unavailable"
            : "mfa_required",
        );
      }
      assuranceLevel = "aal2";
    }

    return {
      provider: "supabase",
      subject: login.user.id,
      email: providerEmail,
      emailVerified: Boolean(
        login.user.email_confirmed_at || login.user.confirmed_at,
      ),
      assuranceLevel,
    };
  }

  async requestPasswordRecovery(
    email: string,
    redirectTo: string,
  ): Promise<void> {
    const response = await this.call(
      `/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
      method: "POST",
        body: JSON.stringify({ email }),
      },
    );
    if (response.status >= 500) {
      throw new IdentityProviderError("provider_unavailable");
    }
  }

  async verifyPasswordRecovery(tokenHash: string): Promise<RecoveryGrant> {
    const response = await this.call("/verify", {
      method: "POST",
      body: JSON.stringify({ token_hash: tokenHash, type: "recovery" }),
    });
    if (!response.ok) {
      throw new IdentityProviderError(
        response.status >= 500
          ? "provider_unavailable"
          : "invalid_credentials",
      );
    }
    const data = (await response.json()) as SupabaseTokenResponse;
    const email = normalizeEmail(data.user?.email || "");
    if (!data.access_token || !data.user?.id || !email) {
      throw new IdentityProviderError("provider_unavailable");
    }
    return {
      accessToken: data.access_token,
      identity: {
        provider: "supabase",
        subject: data.user.id,
        email,
        emailVerified: Boolean(
          data.user.email_confirmed_at || data.user.confirmed_at,
        ),
        assuranceLevel: "aal1",
      },
    };
  }

  async updatePassword(
    accessToken: string,
    newPassword: string,
  ): Promise<void> {
    const response = await this.call(
      "/user",
      { method: "PUT", body: JSON.stringify({ password: newPassword }) },
      accessToken,
    );
    if (!response.ok) {
      throw new IdentityProviderError(
        response.status >= 500
          ? "provider_unavailable"
          : "invalid_credentials",
      );
    }
  }

  async sendInvitation(
    emailValue: string,
    displayName: string,
    redirectTo: string,
  ): Promise<InvitationDispatch> {
    const email = normalizeEmail(emailValue);
    if (!email || !this.secretKey) {
      throw new IdentityProviderError("provider_unavailable");
    }
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`,
        {
          method: "POST",
          headers: {
            apikey: this.secretKey,
            authorization: `Bearer ${this.secretKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            data: { display_name: displayName },
          }),
          signal: AbortSignal.timeout(8_000),
        },
      );
    } catch {
      throw new IdentityProviderError("provider_unavailable");
    }
    if (!response.ok) {
      throw new IdentityProviderError(
        response.status >= 500
          ? "provider_unavailable"
          : "invalid_credentials",
      );
    }
    const user = (await response.json()) as SupabaseUser;
    if (!user.id) {
      throw new IdentityProviderError("provider_unavailable");
    }
    return { providerReference: user.id };
  }

  async verifyInvitation(token: string): Promise<VerifiedInvitationIdentity> {
    const response = await this.call("/verify", {
      method: "POST",
      body: JSON.stringify({ token_hash: token, type: "invite" }),
    });
    if (!response.ok) {
      throw new IdentityProviderError(
        response.status >= 500
          ? "provider_unavailable"
          : "invalid_credentials",
      );
    }
    const data = (await response.json()) as SupabaseTokenResponse;
    const user = data.user;
    const email = normalizeEmail(user?.email || "");
    if (
      !user?.id ||
      !email ||
      !(user.email_confirmed_at || user.confirmed_at)
    ) {
      throw new IdentityProviderError("invalid_credentials");
    }
    return {
      providerReference: user.id,
      identity: {
        provider: "supabase",
        subject: user.id,
        email,
        emailVerified: true,
        assuranceLevel: "aal1",
      },
    };
  }
}
