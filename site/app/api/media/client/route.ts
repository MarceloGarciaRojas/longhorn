import { NextResponse } from "next/server";
import { resolveCorrelationId } from "@/src/observability/correlation";
import { authorizeOperationRequest } from "@/src/operations/http.server";
import {
  setMediaArchived,
  updateMediaMetadata,
  uploadMedia,
  MediaOperationError,
} from "@/src/media/service.server";
import { OperationValidationError } from "@/src/operations/validation";

export const runtime = "nodejs";

function failure(error: unknown): NextResponse {
  const code = error instanceof MediaOperationError
    ? error.mediaCode
    : error instanceof OperationValidationError ? error.code : "invalid";
  return NextResponse.json(
    { ok: false, code },
    { status: code === "denied" ? 403 : code === "conflict" ? 409 : 422 },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = resolveCorrelationId(request);
  const access = await authorizeOperationRequest(
    request,
    "client_admin",
    correlationId,
  );
  if (access.response) return access.response;
  try {
    const form = await request.formData();
    const action = String(form.get("action") || "");
    if (action === "upload") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new OperationValidationError("invalid");
      const assetId = await uploadMedia(access.session, {
        siteId: String(form.get("site_id") || ""),
        idempotencyKey: String(form.get("idempotency_key") || ""),
        filename: file.name,
        displayName: String(form.get("display_name") || file.name),
        declaredMimeType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
        correlationId,
      });
      return NextResponse.json({ ok: true, assetId }, { status: 201 });
    }
    const siteId = action === "metadata"
      ? await updateMediaMetadata(access.session, form, correlationId)
      : action === "archive"
        ? await setMediaArchived(access.session, form, correlationId, true)
        : action === "restore"
          ? await setMediaArchived(access.session, form, correlationId, false)
          : null;
    if (!siteId) throw new OperationValidationError("denied");
    return NextResponse.json({ ok: true, siteId });
  } catch (error) {
    return failure(error);
  }
}
