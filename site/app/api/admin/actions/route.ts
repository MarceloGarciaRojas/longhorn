import { handleAdminAction } from "@/src/admin/http.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleAdminAction(request);
}
