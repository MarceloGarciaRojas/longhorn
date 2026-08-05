import { handleLogout } from "@/src/auth/http.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleLogout(request);
}
