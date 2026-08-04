import { NextResponse } from "next/server";
import { publicMediaObject } from "@/src/media/service.server";
import type { MediaVariantName } from "@/src/media/types";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ assetId: string; variant: string; checksum: string }>;
  },
): Promise<Response> {
  const { assetId, variant, checksum } = await context.params;
  const etag = `"${checksum}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { etag, "cache-control": "public, max-age=31536000, immutable" },
    });
  }
  const object = await publicMediaObject(
    assetId,
    variant as MediaVariantName,
    checksum,
  ).catch(() => null);
  if (!object) return new NextResponse("No encontrado", { status: 404 });
  return new Response(object.body as BodyInit, {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.byteSize),
      etag,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
