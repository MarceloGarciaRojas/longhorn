import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireAuthSession } from "@/src/auth/session.server";
import { listClientCompanies } from "@/src/client-portal/client-service.server";
import { clientUnreadCount } from "@/src/operations/service.server";
import { clientOnboarding } from "@/src/onboarding/service.server";
import { ClientShell } from "./client-shell";

export const dynamic = "force-dynamic";

export default async function ClientAccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAuthSession("client_admin");
  if (!session.activeTenantId) {
    redirect("/seleccionar-empresa");
  }
  const [companies, unreadCount, onboarding] = await Promise.all([
    listClientCompanies(session),
    clientUnreadCount(session),
    clientOnboarding(session),
  ]);
  return (
    <ClientShell
      session={session}
      canChangeCompany={companies.filter((company) => company.isAvailable).length > 1}
      unreadCount={unreadCount}
      hasOnboarding={Boolean(onboarding)}
    >
      {children}
    </ClientShell>
  );
}
