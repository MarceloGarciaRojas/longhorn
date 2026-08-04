import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { IdentityProviderError } from "./errors";
import { constantTimeEqual, normalizeEmail } from "./security";
import type {
  AuthenticateInput,
  IdentityProvider,
  InvitationDispatch,
  ProviderIdentity,
  RecoveryGrant,
  VerifiedInvitationIdentity,
} from "./types";

interface TestIdentity {
  email: string;
  password: string;
  subject: string;
  oneTimeCode?: string;
}

function readTestIdentities(): TestIdentity[] {
  const raw = process.env.AUTH_TEST_IDENTITIES;
  if (!raw) {
    return [];
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is TestIdentity => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.email === "string" &&
        typeof candidate.password === "string" &&
        typeof candidate.subject === "string" &&
        (candidate.oneTimeCode === undefined ||
          typeof candidate.oneTimeCode === "string")
      );
    });
  } catch {
    return [];
  }
}

export class TestIdentityProvider implements IdentityProvider {
  readonly name = "test" as const;

  async authenticate(
    input: Readonly<AuthenticateInput>,
  ): Promise<ProviderIdentity> {
    const email = normalizeEmail(input.email);
    const candidate = readTestIdentities().find(
      (identity) => normalizeEmail(identity.email) === email,
    );
    if (
      !email ||
      !candidate ||
      !constantTimeEqual(candidate.password, input.password)
    ) {
      throw new IdentityProviderError("invalid_credentials");
    }

    if (input.requireMfa) {
      if (!candidate.oneTimeCode) {
        throw new IdentityProviderError("mfa_not_enrolled");
      }
      if (
        !input.oneTimeCode ||
        !constantTimeEqual(candidate.oneTimeCode, input.oneTimeCode)
      ) {
        throw new IdentityProviderError("mfa_required");
      }
    }

    return {
      provider: "test",
      subject: candidate.subject,
      email,
      emailVerified: true,
      assuranceLevel: input.requireMfa ? "aal2" : "aal1",
    };
  }

  async requestPasswordRecovery(): Promise<void> {
    // Intentionally empty: local/CI never sends email.
  }

  async verifyPasswordRecovery(tokenHash: string): Promise<RecoveryGrant> {
    const expected = process.env.AUTH_TEST_RECOVERY_TOKEN;
    const identity = readTestIdentities()[0];
    const email = identity ? normalizeEmail(identity.email) : null;
    if (
      !expected ||
      !identity ||
      !email ||
      !constantTimeEqual(expected, tokenHash)
    ) {
      throw new IdentityProviderError("invalid_credentials");
    }
    return {
      accessToken: `test-recovery:${identity.subject}`,
      identity: {
        provider: "test",
        subject: identity.subject,
        email,
        emailVerified: true,
        assuranceLevel: "aal1",
      },
    };
  }

  async updatePassword(
    accessToken: string,
    newPassword: string,
  ): Promise<void> {
    if (
      !accessToken.startsWith("test-recovery:") ||
      newPassword.length < 12
    ) {
      throw new IdentityProviderError("invalid_credentials");
    }
  }

  async sendInvitation(
    emailValue: string,
    displayName: string,
    redirectTo: string,
  ): Promise<InvitationDispatch> {
    void displayName;
    void redirectTo;
    const email = normalizeEmail(emailValue);
    if (!email) {
      throw new IdentityProviderError("invalid_credentials");
    }
    const configured = readTestIdentities().find(
      (identity) => normalizeEmail(identity.email) === email,
    );
    const subject =
      configured?.subject ||
      `test-invite-${createHash("sha256")
        .update(email, "utf8")
        .digest("hex")
        .slice(0, 24)}`;
    const payload = Buffer.from(JSON.stringify({ email, subject }), "utf8")
      .toString("base64url");
    const token = `${payload}.${randomBytes(32).toString("base64url")}`;
    return {
      providerReference: createHash("sha256")
        .update(token, "utf8")
        .digest("hex"),
      acceptanceToken: token,
    };
  }

  async verifyInvitation(token: string): Promise<VerifiedInvitationIdentity> {
    try {
      const [payload, nonce, extra] = token.split(".");
      if (!payload || !nonce || extra || nonce.length < 32) {
        throw new Error("invalid");
      }
      const decoded = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as { email?: string; subject?: string };
      const email = normalizeEmail(decoded.email || "");
      if (
        !email ||
        !decoded.subject ||
        decoded.subject.length > 255 ||
        !/^[a-zA-Z0-9:_-]+$/.test(decoded.subject)
      ) {
        throw new Error("invalid");
      }
      return {
        providerReference: createHash("sha256")
          .update(token, "utf8")
          .digest("hex"),
        identity: {
          provider: "test",
          subject: decoded.subject,
          email,
          emailVerified: true,
          assuranceLevel: "aal1",
        },
      };
    } catch {
      throw new IdentityProviderError("invalid_credentials");
    }
  }
}
