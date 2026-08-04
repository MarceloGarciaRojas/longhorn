import { redirect } from "next/navigation";
import { requireAuthSession } from "@/src/auth/session.server";
import { clientOnboarding } from "@/src/onboarding/service.server";

export const dynamic = "force-dynamic";

export default async function ClientOnboardingIndexPage() {
  const session = await requireAuthSession("client_admin");
  const onboarding = await clientOnboarding(session);
  if (!onboarding) redirect("/cuenta");
  redirect(`/cuenta/incorporacion/${onboarding.id}`);
}
