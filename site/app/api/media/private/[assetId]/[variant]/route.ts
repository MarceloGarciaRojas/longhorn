import { NextResponse } from "next/server";
import { resolveCorrelationId } from "@/src/observability/correlation";
import { authorizeOperationRequest } from "@/src/operations/http.server";
import { privateMediaObject } from "@/src/media/service.server";
import type { MediaVariantName } from "@/src/media/types";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string; variant: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request);
  const audience = new URL(request.url).searchParams.get("audience") === "admin"
    ? "nexi_admin"
    : "client_admin";
  const access = await authorizeOperationRequest(request, audience, correlationId);
  if (access.response) return access.response;
  const { assetId, variant } = await context.params;
  const object = await privateMediaObject(
    access.session,
    assetId,
    variant as MediaVariantName,
  ).catch(() => null);
  if (!object) return new NextResponse("No encontrado", { status: 404 });
  return new Response(object.body as BodyInit, {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.byteSize),
      etag: `"${object.etag}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
