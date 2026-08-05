import Link from "next/link";
import { requireAuthSession } from "@/src/auth/session.server";
import { clientSites } from "@/src/operations/service.server";
import {
  ClientEmptyState,
  ClientPageHeader,
  ClientStatus,
  formatClientDate,
} from "../ui";

export const dynamic = "force-dynamic";

export default async function ClientSitesPage() {
  const session = await requireAuthSession("client_admin");
  const sites = await clientSites(session);
  return (
    <>
      <ClientPageHeader
        eyebrow="Mi empresa"
        title="Mis sitios"
        description="Consulta los espacios digitales que el equipo nexi ha asignado a tu empresa."
      />
      {sites.length === 0 ? (
        <ClientEmptyState title="Aún no tienes sitios asignados">
          No tienes sitios asignados. El equipo nexi está preparando tu espacio
          digital.
        </ClientEmptyState>
      ) : (
        <section className="client-site-list" aria-label="Sitios asignados">
          {sites.map((site) => (
            <article key={site.id}>
              <div>
                <ClientStatus value={site.status} />
                <h2>{site.displayName}</h2>
                <p>{site.hostname ?? "Dirección pendiente de asignación"}</p>
                <small>
                  Última actualización: {formatClientDate(site.updatedAt)}
                </small>
              </div>
              <div className="client-card-actions">
                <Link
                  className="client-button secondary"
                  href={`/cuenta/sitios/${site.id}`}
                >
                  Modificar
                </Link>
                {site.deletionStatus === "pending" ||
                site.deletionStatus === "approved" ? (
                  <span className="client-disabled-action">
                    Eliminación solicitada
                  </span>
                ) : null}
                {site.domainRequestStatus &&
                !["active", "rejected", "canceled", "failed"].includes(
                  site.domainRequestStatus,
                ) ? (
                  <span className="client-disabled-action">
                    Dominio en proceso
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
