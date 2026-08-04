import Link from "next/link";
import { requireAuthSession } from "@/src/auth/session.server";
import { tenantsFor } from "@/src/admin/admin-service.server";
import { pageNumber } from "@/src/admin/validation";
import {
  EmptyState,
  formatDate,
  PageHeader,
  Pagination,
  StatusBadge,
} from "../ui";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const query = await searchParams;
  const page = pageNumber(query.page || null);
  const result = await tenantsFor(session, {
    search: query.q || null,
    status: query.status || null,
    sort: query.sort || null,
    page,
  });
  const preserved = new URLSearchParams();
  if (query.q) preserved.set("q", query.q);
  if (query.status) preserved.set("status", query.status);
  if (query.sort) preserved.set("sort", query.sort);
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Empresas"
        title="Clientes"
        description="Busca, revisa y administra el estado general de cada empresa."
        action={
          <Link className="admin-button" href="/nexi-interno/clientes/nuevo">
            Crear cliente
          </Link>
        }
      />
      <form className="filter-bar" method="get">
        <label>
          <span>Buscar</span>
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="Nombre o dirección"
            maxLength={80}
          />
        </label>
        <label>
          <span>Estado</span>
          <select name="status" defaultValue={query.status || ""}>
            <option value="">Todos</option>
            <option value="draft">Borrador</option>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
          </select>
        </label>
        <label>
          <span>Orden</span>
          <select name="sort" defaultValue={query.sort || "created_desc"}>
            <option value="created_desc">Más recientes</option>
            <option value="name_asc">Nombre A–Z</option>
          </select>
        </label>
        <button className="admin-button secondary" type="submit">Aplicar</button>
      </form>
      {result.items.length === 0 ? (
        <EmptyState
          title={result.total === 0 && !query.q && !query.status
            ? "Aún no hay clientes registrados"
            : "No encontramos resultados"}
          copy={result.total === 0 && !query.q && !query.status
            ? "Crea la primera empresa para comenzar su alta asistida."
            : "Prueba con otro nombre o elimina alguno de los filtros."}
          href={result.total === 0 && !query.q && !query.status
            ? "/nexi-interno/clientes/nuevo"
            : undefined}
          label="Crear cliente"
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((tenant) => (
                  <tr key={tenant.tenantId}>
                    <td><strong>{tenant.tenantName}</strong></td>
                    <td>{tenant.tenantSlug}.nexi.cl</td>
                    <td><StatusBadge value={tenant.tenantStatus} /></td>
                    <td>{formatDate(tenant.tenantCreatedAt)}</td>
                    <td>
                      <Link href={`/nexi-interno/clientes/${tenant.tenantId}`}>
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/nexi-interno/clientes"
            query={preserved.toString()}
          />
        </>
      )}
    </main>
  );
}
