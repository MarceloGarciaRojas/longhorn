import Link from "next/link";
import { requireAuthSession } from "@/src/auth/session.server";
import { auditFor, dashboardFor } from "@/src/admin/admin-service.server";
import {
  actionLabel,
  EmptyState,
  formatDate,
  Notice,
  PageHeader,
  StatusBadge,
} from "./ui";

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const [summary, activity] = await Promise.all([
    dashboardFor(session),
    auditFor(session, {
      action: null,
      tenantId: null,
      actorSearch: null,
      from: null,
      to: null,
      outcome: null,
      page: 1,
    }),
  ]);
  const query = await searchParams;
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Resumen operativo"
        title="Inicio"
        description="Estado real de clientes, accesos e invitaciones."
        action={
          <Link className="admin-button" href="/nexi-interno/clientes/nuevo">
            Crear cliente
          </Link>
        }
      />
      <Notice error={query.error} />
      <section className="metric-grid" aria-label="Indicadores operativos">
        {[
          ["Clientes totales", summary.tenantTotal],
          ["Clientes activos", summary.tenantActive],
          ["Clientes suspendidos", summary.tenantSuspended],
          ["Invitaciones pendientes", summary.invitationPending],
          ["Invitaciones expiradas", summary.invitationExpired],
          ["Accesos activos", summary.membershipActive],
        ].map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="admin-section">
        <div className="section-heading">
          <div>
            <span className="admin-eyebrow">Trazabilidad</span>
            <h2>Actividad reciente</h2>
          </div>
          <Link href="/nexi-interno/auditoria">Ver auditoría</Link>
        </div>
        {activity.items.length === 0 ? (
          <EmptyState
            title="Aún no hay actividad administrativa"
            copy="Las acciones realizadas desde este panel aparecerán aquí."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Cliente</th>
                  <th>Resultado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {activity.items.slice(0, 8).map((event) => (
                  <tr key={event.auditId}>
                    <td>{actionLabel(event.action)}</td>
                    <td>{event.tenantName || "Plataforma"}</td>
                    <td><StatusBadge value={event.outcome} /></td>
                    <td>{formatDate(event.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
