import Link from "next/link";
import { requireAuthSession } from "@/src/auth/session.server";
import { invitationsFor } from "@/src/admin/admin-service.server";
import { pageNumber } from "@/src/admin/validation";
import { SubmitButton } from "../submit-button";
import {
  EmptyState,
  formatDate,
  Notice,
  PageHeader,
  Pagination,
  StatusBadge,
} from "../ui";

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    error?: string;
    synthetic?: string;
  }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const query = await searchParams;
  const page = pageNumber(query.page || null);
  const result = await invitationsFor(session, {
    status: query.status || null,
    page,
  });
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Accesos"
        title="Invitaciones"
        description="Consulta, renueva o revoca invitaciones de Clientes Administradores."
      />
      <Notice status={query.status} error={query.error} />
      {query.synthetic ? (
        <div className="admin-notice local-only">
          <strong>Invitación sintética local</strong>
          <p>No se envió correo. Este enlace existe únicamente para validar local y CI.</p>
          <Link href={`/invitacion/aceptar?token=${encodeURIComponent(query.synthetic)}`}>
            Abrir invitación de prueba
          </Link>
        </div>
      ) : null}
      <form className="filter-bar" method="get">
        <label>
          <span>Estado</span>
          <select name="status" defaultValue={query.status || ""}>
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="accepted">Aceptada</option>
            <option value="expired">Expirada</option>
            <option value="revoked">Revocada</option>
            <option value="failed">Fallida</option>
          </select>
        </label>
        <button className="admin-button secondary" type="submit">Aplicar</button>
      </form>
      {result.items.length === 0 ? (
        <EmptyState
          title="No hay invitaciones para mostrar"
          copy="Las invitaciones se generan desde el detalle de cada cliente."
          href="/nexi-interno/clientes"
          label="Ir a clientes"
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invitado</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Vence</th>
                  <th>Intentos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((invitation) => (
                  <tr key={invitation.invitationId}>
                    <td><strong>{invitation.invitationName}</strong><br />{invitation.invitationEmail}</td>
                    <td>
                      <Link href={`/nexi-interno/clientes/${invitation.tenantId}`}>
                        {invitation.tenantName}
                      </Link>
                    </td>
                    <td><StatusBadge value={invitation.invitationStatus} /></td>
                    <td>{formatDate(invitation.invitationExpiresAt)}</td>
                    <td>{invitation.invitationAttemptCount}</td>
                    <td>
                      {["pending", "expired", "failed"].includes(invitation.invitationStatus) ? (
                        <details className="table-action">
                          <summary>Gestionar</summary>
                          <div className="stacked-actions">
                            <form action="/api/admin/actions" method="post">
                              <input type="hidden" name="action" value="invitation_resend" />
                              <input type="hidden" name="invitation_id" value={invitation.invitationId} />
                              <SubmitButton className="text-button">Renovar invitación</SubmitButton>
                            </form>
                            <form action="/api/admin/actions" method="post" className="inline-confirmation">
                              <input type="hidden" name="action" value="invitation_revoke" />
                              <input type="hidden" name="invitation_id" value={invitation.invitationId} />
                              <label><span>Motivo de revocación</span><textarea name="reason" required minLength={5} maxLength={500} /></label>
                              <SubmitButton className="admin-button danger">Revocar</SubmitButton>
                            </form>
                          </div>
                        </details>
                      ) : "—"}
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
            basePath="/nexi-interno/invitaciones"
            query={query.status ? `status=${encodeURIComponent(query.status)}` : ""}
          />
        </>
      )}
    </main>
  );
}
