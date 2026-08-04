import { handleClientOnboarding } from "@/src/onboarding/http-authenticated.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleClientOnboarding(request);
}
