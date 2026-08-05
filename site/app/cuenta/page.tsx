import Link from "next/link";
import { requireAuthSession } from "@/src/auth/session.server";
import { loadDashboard } from "@/src/client-portal/client-service.server";
import { clientUnreadCount } from "@/src/operations/service.server";
import { ClientEmptyState, ClientPageHeader, ClientStatus } from "./ui";

export const dynamic = "force-dynamic";

export default async function ClientDashboardPage() {
  const session = await requireAuthSession("client_admin");
  const [dashboard, unreadCount] = await Promise.all([
    loadDashboard(session),
    clientUnreadCount(session),
  ]);

  return (
    <>
      <ClientPageHeader
        eyebrow="Mi empresa"
        title={`Hola, ${session.displayName}`}
        description={`Este es el resumen de ${dashboard.tenantName}.`}
      />
      <section className="client-metrics" aria-label="Resumen de mi cuenta">
        <article>
          <span>Sitios asignados</span>
          <strong>{dashboard.siteCount}</strong>
          <Link href="/cuenta/sitios">Ver mis sitios</Link>
        </article>
        <article>
          <span>Mi plan</span>
          <strong>{dashboard.planName ?? "Sin configurar"}</strong>
          {dashboard.planStatus ? (
            <ClientStatus value={dashboard.planStatus} />
          ) : (
            <small>Contacta a soporte nexi</small>
          )}
        </article>
        <article>
          <span>Mensajes</span>
          <strong>{unreadCount}</strong>
          <small>
            {unreadCount === 1 ? "mensaje no leído" : "mensajes no leídos"}
          </small>
          <Link href="/cuenta/mensajes">Abrir mensajes</Link>
        </article>
      </section>
      {dashboard.siteCount === 0 ? (
        <ClientEmptyState title="Tu espacio digital está en preparación">
          No tienes sitios asignados. El equipo nexi está preparando tu espacio
          digital.
        </ClientEmptyState>
      ) : null}
      {!dashboard.planName ? (
        <ClientEmptyState title="Plan pendiente de configuración">
          Tu plan aún no ha sido configurado. Contacta a soporte nexi.
        </ClientEmptyState>
      ) : null}
      <section className="client-quick-links">
        <h2>Accesos rápidos</h2>
        <div>
          <Link href="/cuenta/datos">Revisar mis datos</Link>
          <Link href="/cuenta/plan">Consultar mi plan</Link>
          <Link href="/cuenta/sitios">Ver sitios asignados</Link>
        </div>
      </section>
    </>
  );
}
