import { randomUUID } from "node:crypto";
import Link from "next/link";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import {
  adminSites,
  adminTenantOptions,
} from "@/src/operations/service.server";
import { EmptyState, Notice, PageHeader, StatusBadge } from "../ui";

export default async function AdminSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; tenant?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const [sites, tenants, query] = await Promise.all([
    adminSites(session),
    adminTenantOptions(session),
    searchParams,
  ]);
  const visible = query.tenant
    ? sites.filter((site) => site.tenantId === query.tenant)
    : sites;
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Operación de sitios"
        title="Sitios"
        description="Crea y administra asignaciones operativas. El contenido y las plantillas no forman parte de esta etapa."
      />
      <Notice status={query.status} error={query.error} />
      <section className="admin-section">
        <div className="section-heading">
          <div><span className="admin-eyebrow">Alta controlada</span><h2>Crear sitio</h2></div>
        </div>
        <form className="admin-form-card compact" action="/api/admin/operations" method="post">
          <input type="hidden" name="action" value="site_create" />
          <input type="hidden" name="idempotency_key" value={randomUUID()} />
          <div className="form-grid">
            <label>
              <span>Cliente</span>
              <select name="tenant_id" required defaultValue="">
                <option value="" disabled>Selecciona un cliente</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Nombre visible</span>
              <input name="display_name" required maxLength={120} />
            </label>
            <label>
              <span>Slug interno</span>
              <input name="slug" required minLength={3} maxLength={80} pattern="[a-z0-9-]+" />
            </label>
          </div>
          <p className="form-note">El sitio se crea en estado “En preparación”, sin plantilla, contenido ni dominio automático.</p>
          <OperationSubmit className="admin-button" pendingLabel="Creando…">
            Crear sitio
          </OperationSubmit>
        </form>
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Sitios registrados</h2><p>{visible.length} resultados</p></div></div>
        {visible.length === 0 ? (
          <EmptyState title="No hay sitios" copy="Crea el primer sitio para un cliente habilitado." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sitio</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>
                {visible.map((site) => (
                  <tr key={site.id}>
                    <td>{site.displayName}</td>
                    <td>{site.tenantName}</td>
                    <td>{site.hostname ?? "Pendiente"}</td>
                    <td><StatusBadge value={site.status} /></td>
                    <td><Link href={`/nexi-interno/sitios/${site.id}`}>Administrar</Link></td>
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
