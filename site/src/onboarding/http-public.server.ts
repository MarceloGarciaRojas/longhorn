import "server-only";

import { NextResponse } from "next/server";
import {
  consumeAuthRateLimit,
} from "@/src/auth/auth-repository.server";
import { loadAuthConfig } from "@/src/auth/config";
import {
  hashPrivateIdentifier,
  hasTrustedOrigin,
  resolveClientAddress,
} from "@/src/auth/security";
import { loadOnboardingConfig } from "./config";
import {
  parsePublicIntake,
  PublicOnboardingError,
  submitPublicIntake,
} from "./public-service.server";

const GENERIC =
  "Recibimos tu solicitud. El equipo nexi la revisará y se pondrá en contacto contigo.";

function response(
  request: Request,
  status: "received" | "invalid",
): NextResponse {
  const destination = new URL(`/comenzar?status=${status}`, request.url);
  const result = NextResponse.redirect(destination, 303);
  result.headers.set("cache-control", "no-store");
  return result;
}

export async function handlePublicOnboarding(
  request: Request,
): Promise<NextResponse> {
  const auth = loadAuthConfig();
  const onboarding = loadOnboardingConfig();
  if (!onboarding.publicFormEnabled) {
    return new NextResponse("Formulario no disponible.", { status: 404 });
  }
  if (!hasTrustedOrigin(request, auth)) {
    return new NextResponse("Solicitud no válida.", { status: 403 });
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > 32_768) {
    return new NextResponse("Solicitud no válida.", { status: 413 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 32_768) {
    return new NextResponse("Solicitud no válida.", { status: 413 });
  }
  const params = new URLSearchParams(body);
  if (params.get("website")) {
    return response(request, "received");
  }
  const address = resolveClientAddress(request, auth.environment);
  const limiter = await consumeAuthRateLimit(
    "onboarding_public",
    hashPrivateIdentifier(auth, `onboarding-public:${address}`),
    onboarding.publicRateLimit,
    15 * 60,
    15 * 60,
  );
  if (!limiter.allowed) {
    return new NextResponse(GENERIC, {
      status: 429,
      headers: {
        "retry-after": String(limiter.retryAfterSeconds),
        "cache-control": "no-store",
      },
    });
  }
  try {
    await submitPublicIntake(parsePublicIntake(params));
    return response(request, "received");
  } catch (error) {
    if (error instanceof PublicOnboardingError) {
      return response(
        request,
        error.code === "conflict" ? "received" : "invalid",
      );
    }
    return response(request, "invalid");
  }
}
