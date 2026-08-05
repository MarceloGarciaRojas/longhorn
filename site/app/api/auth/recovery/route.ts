import { handlePasswordRecovery } from "@/src/auth/http.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePasswordRecovery(request);
}
