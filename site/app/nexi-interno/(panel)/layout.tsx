import type { ReactNode } from "react";
import { requireAuthSession } from "@/src/auth/session.server";
import { AdminShell } from "./admin-shell";
import { adminUnreadCount } from "@/src/operations/service.server";

export const dynamic = "force-dynamic";

export default async function InternalPanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAuthSession("nexi_admin");
  const unreadCount = await adminUnreadCount(session);
  return (
    <AdminShell session={session} unreadCount={unreadCount}>
      {children}
    </AdminShell>
  );
}
