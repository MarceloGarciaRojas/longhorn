import { handleAdminOperation } from "@/src/operations/http.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAdminOperation(request);
}
