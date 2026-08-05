import { handlePublicOnboarding } from "@/src/onboarding/http-public.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePublicOnboarding(request);
}
