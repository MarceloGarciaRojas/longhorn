import "server-only";

import { createHash } from "node:crypto";
import { normalizeEmail } from "@/src/auth/security";
import { withApplicationDatabase } from "@/src/db/application-database.server";
import {
  ONBOARDING_INDUSTRIES,
  type OnboardingIndustry,
} from "./types";
import { loadOnboardingConfig } from "./config";

const EXECUTABLE =
  /<[^>]*>|\bjavascript\s*:|\bdata\s*:\s*text|\bon\w+\s*=|&lt;\s*(?:script|iframe)/i;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PublicOnboardingError extends Error {
  constructor(readonly code: "invalid" | "disabled" | "conflict") {
    super(code);
    this.name = "PublicOnboardingError";
  }
}

function clean(
  value: string | null,
  minimum: number,
  maximum: number,
  optional = false,
): string | null {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  if (optional && !normalized) return null;
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    EXECUTABLE.test(normalized)
  ) {
    throw new PublicOnboardingError("invalid");
  }
  return normalized;
}

function phone(value: string | null): string | null {
  const normalized = (value || "").trim();
  if (!normalized) return null;
  const compact = `${normalized.startsWith("+") ? "+" : ""}${normalized.replace(/\D/g, "")}`;
  if (!/^\+?[0-9]{7,15}$/.test(compact)) {
    throw new PublicOnboardingError("invalid");
  }
  return compact;
}

export interface PublicIntakeInput {
  idempotencyKey: string;
  businessName: string;
  businessCategory: OnboardingIndustry;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  preferredContactMethod: "email" | "phone" | "whatsapp";
  city: string | null;
  currentDigitalPresence: string;
  primaryGoal: string;
  shortNotes: string | null;
  sourceHint: string | null;
}

export function parsePublicIntake(
  params: URLSearchParams,
): PublicIntakeInput {
  const config = loadOnboardingConfig();
  if (!config.publicFormEnabled) throw new PublicOnboardingError("disabled");
  const idempotencyKey = params.get("idempotency_key") || "";
  const category = params.get("business_category") || "";
  const method = params.get("preferred_contact_method") || "";
  const email = normalizeEmail(params.get("contact_email") || "");
  if (
    !UUID.test(idempotencyKey) ||
    !ONBOARDING_INDUSTRIES.includes(category as OnboardingIndustry) ||
    !["email", "phone", "whatsapp"].includes(method) ||
    !email ||
    params.get("privacy_acknowledgement") !== "accepted"
  ) {
    throw new PublicOnboardingError("invalid");
  }
  return {
    idempotencyKey: idempotencyKey.toLowerCase(),
    businessName: clean(params.get("business_name"), 2, 120)!,
    businessCategory: category as OnboardingIndustry,
    contactName: clean(params.get("contact_name"), 2, 120)!,
    contactEmail: email,
    contactPhone: phone(params.get("contact_phone")),
    preferredContactMethod: method as "email" | "phone" | "whatsapp",
    city: clean(params.get("city"), 2, 120, true),
    currentDigitalPresence: clean(
      params.get("current_digital_presence"),
      1,
      500,
    )!,
    primaryGoal: clean(params.get("primary_goal"), 2, 500)!,
    shortNotes: clean(
      params.get("short_notes"),
      1,
      config.maxNotesLength,
      true,
    ),
    sourceHint: clean(params.get("source_hint"), 1, 120, true),
  };
}

export function publicIntakeFingerprint(input: PublicIntakeInput): string {
  return createHash("sha256")
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
}

export async function submitPublicIntake(
  input: Readonly<PublicIntakeInput>,
): Promise<string> {
  const fingerprint = publicIntakeFingerprint(input);
  try {
    return await withApplicationDatabase(async (pool) => {
      const result = await pool.query<{ id: string }>(
        `SELECT app_private.onboarding_submit_intake(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
         ) AS id`,
        [
          input.idempotencyKey,
          fingerprint,
          input.businessName,
          input.businessCategory,
          input.contactName,
          input.contactEmail,
          input.contactPhone,
          input.preferredContactMethod,
          input.city,
          input.currentDigitalPresence,
          input.primaryGoal,
          input.shortNotes,
          input.sourceHint,
        ],
      );
      return result.rows[0].id;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new PublicOnboardingError("conflict");
    }
    throw error;
  }
}
