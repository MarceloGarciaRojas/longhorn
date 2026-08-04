import Link from "next/link";
import { requireAuthSession } from "@/src/auth/session.server";
import { adminCases, adminIntakes } from "@/src/onboarding/service.server";
import { EmptyState, PageHeader, StatusBadge } from "../ui";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    source?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const query = await searchParams;
  const [intakes, cases] = await Promise.all([
    adminIntakes(session, {
      status: query.status,
      category: query.category,
      source: query.source,
      search: query.search,
      from: query.from,
      to: query.to,
      page: Number(query.page || 1),
    }),
    adminCases(session),
  ]);
  const waiting = cases.filter((entry) =>
    ["waiting_information","waiting_client_approval"].includes(entry.status),
  ).length;
  const ready = cases.filter((entry) => entry.status === "ready_to_publish").length;
  const blocked = cases.filter((entry) => entry.status === "paused").length;
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Operación asistida"
        title="Onboarding"
        description="Solicitudes y casos reales desde la incorporación hasta la publicación verificada."
        action={
          <Link className="admin-button" href="/nexi-interno/onboarding/nuevo">
            Registrar solicitud
          </Link>
        }
      />
      <section className="admin-detail-hero">
        <div><span>Casos activos</span><strong>{cases.filter((entry) => !["published","canceled"].includes(entry.status)).length}</strong></div>
        <div><span>Esperando cliente</span><strong>{waiting}</strong></div>
        <div><span>Listos para publicar</span><strong>{ready}</strong></div>
        <div><span>Pausados</span><strong>{blocked}</strong></div>
      </section>
      <section className="admin-section">
        <div className="section-heading">
          <div><h2>Solicitudes</h2><p>{intakes.total} registradas</p></div>
        </div>
        <form className="admin-filter-bar" method="get">
          <input name="search" defaultValue={query.search} placeholder="Empresa o contacto" />
          <select name="status" defaultValue={query.status || ""}>
            <option value="">Todos los estados</option>
            {["submitted","reviewing","waiting_information","accepted","rejected","converted","canceled"].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <select name="category" defaultValue={query.category || ""}>
            <option value="">Todos los rubros</option>
            <option value="restaurant">Restaurante</option>
            <option value="cafe">Cafetería</option>
            <option value="other">Otros</option>
          </select>
          <select name="source" defaultValue={query.source || ""}>
            <option value="">Todos los orígenes</option>
            {["public_form","whatsapp","phone","referral","manual","other"].map(
              (value) => <option key={value} value={value}>{value}</option>,
            )}
          </select>
          <label>
            Desde
            <input type="date" name="from" defaultValue={query.from} />
          </label>
          <label>
            Hasta
            <input type="date" name="to" defaultValue={query.to} />
          </label>
          <button className="admin-button secondary" type="submit">Filtrar</button>
        </form>
        {intakes.items.length === 0 ? (
          <EmptyState title="Sin solicitudes" copy="No hay resultados para los filtros seleccionados." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Empresa</th><th>Rubro</th><th>Origen</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>
                {intakes.items.map((entry) => (
                  <tr key={entry.id}>
                    <td><strong>{entry.businessName}</strong><br /><small>{entry.contactName}</small></td>
                    <td>{entry.businessCategory}{!entry.supportedCategory ? " · no soportado" : ""}</td>
                    <td>{entry.source}</td>
                    <td><StatusBadge value={entry.status} /></td>
                    <td><Link href={`/nexi-interno/onboarding/solicitudes/${entry.id}`}>Revisar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><h2>Casos operativos</h2><p>{cases.length} casos</p></div></div>
        {cases.length === 0 ? (
          <EmptyState title="Sin casos" copy="Convierte una solicitud aceptada para iniciar el flujo." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Empresa</th><th>Sitio</th><th>Estado</th><th>Prioridad</th><th>Responsable</th><th>Acción</th></tr></thead>
              <tbody>
                {cases.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.tenantName}</td>
                    <td>{entry.siteName}</td>
                    <td><StatusBadge value={entry.status} /></td>
                    <td>{entry.priority}</td>
                    <td>{entry.assignedAdminName ?? "Sin asignar"}</td>
                    <td><Link href={`/nexi-interno/onboarding/casos/${entry.id}`}>Abrir</Link></td>
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
