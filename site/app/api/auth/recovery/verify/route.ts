import { handleRecoveryVerification } from "@/src/auth/http.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRecoveryVerification(request);
}
