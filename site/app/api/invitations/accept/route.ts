import { handleInvitationAcceptance } from "@/src/admin/http.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleInvitationAcceptance(request);
}
