import { handleClientAction } from "@/src/client-portal/http.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleClientAction(request);
}
