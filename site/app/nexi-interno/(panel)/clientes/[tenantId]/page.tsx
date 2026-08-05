import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthSession } from "@/src/auth/session.server";
import { tenantDetailFor } from "@/src/admin/admin-service.server";
import { TENANT_LOCALES, TENANT_TIMEZONES } from "@/src/admin/validation";
import { SubmitButton } from "../../submit-button";
import {
  actionLabel,
  EmptyState,
  formatDate,
  Notice,
  PageHeader,
  StatusBadge,
} from "../../ui";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ status?: string; error?: string; synthetic?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const { tenantId } = await params;
  const query = await searchParams;
  const detail = await tenantDetailFor(session, tenantId);
  if (!detail) notFound();
  const { tenant, memberships, invitations, audit } = detail;
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Detalle del cliente"
        title={tenant.tenantName}
        description={`${tenant.tenantSlug}.nexi.cl`}
        action={<Link href="/nexi-interno/clientes">Volver a clientes</Link>}
      />
      <Notice status={query.status} error={query.error} />
      {query.synthetic ? (
        <div className="admin-notice local-only" role="status">
          <strong>Invitación sintética local</strong>
          <p>No se envió correo. Usa este enlace únicamente para probar el flujo local.</p>
          <Link href={`/invitacion/aceptar?token=${encodeURIComponent(query.synthetic)}`}>
            Abrir invitación de prueba
          </Link>
        </div>
      ) : null}
      <section className="admin-detail-hero">
        <div>
          <span>Estado actual</span>
          <StatusBadge value={tenant.tenantStatus} />
        </div>
        <div><span>Creado</span><strong>{formatDate(tenant.tenantCreatedAt)}</strong></div>
        <div><span>Último cambio</span><strong>{formatDate(tenant.tenantUpdatedAt)}</strong></div>
      </section>

      <section className="admin-section">
        <div className="section-heading"><h2>Datos generales</h2></div>
        <form className="admin-form-card" action="/api/admin/actions" method="post">
          <input type="hidden" name="action" value="tenant_update" />
          <input type="hidden" name="tenant_id" value={tenant.tenantId} />
          <input
            type="hidden"
            name="expected_updated_at"
            value={new Date(tenant.tenantUpdatedAt).toISOString()}
          />
          <div className="form-grid">
            <label>
              <span>Nombre visible</span>
              <input name="display_name" defaultValue={tenant.tenantName} required maxLength={120} />
            </label>
            <label>
              <span>Dirección</span>
              <input name="slug" defaultValue={tenant.tenantSlug} required minLength={3} maxLength={63} />
              <small className="field-hint">Se mostrará como {tenant.tenantSlug}.nexi.cl</small>
            </label>
            <label>
              <span>Zona horaria</span>
              <select name="timezone" defaultValue={tenant.tenantTimezone}>
                {TENANT_TIMEZONES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Idioma</span>
              <select name="locale" defaultValue={tenant.tenantLocale}>
                {TENANT_LOCALES.map((value) => <option key={value} value={value}>Español (Chile)</option>)}
              </select>
            </label>
          </div>
          <SubmitButton>Guardar cambios</SubmitButton>
        </form>
      </section>

      <section className="admin-section danger-zone">
        <div className="section-heading">
          <div><h2>Estado operativo</h2><p>Suspender conserva los datos y accesos registrados.</p></div>
        </div>
        {tenant.tenantStatus === "suspended" || tenant.tenantStatus === "draft" ? (
          <details>
            <summary>{tenant.tenantStatus === "draft" ? "Activar cliente" : "Reactivar cliente"}</summary>
            <form action="/api/admin/actions" method="post" className="inline-confirmation">
              <input type="hidden" name="action" value="tenant_status" />
              <input type="hidden" name="tenant_id" value={tenant.tenantId} />
              <input type="hidden" name="target_status" value="active" />
              <label><span>Motivo de la {tenant.tenantStatus === "draft" ? "activación" : "reactivación"}</span><textarea name="reason" required minLength={5} maxLength={500} /></label>
              <p>El Cliente Administrador podrá volver a entrar cuando su membresía esté activa.</p>
              <SubmitButton>Confirmar {tenant.tenantStatus === "draft" ? "activación" : "reactivación"}</SubmitButton>
            </form>
          </details>
        ) : (
          <details>
            <summary>Suspender cliente</summary>
            <form action="/api/admin/actions" method="post" className="inline-confirmation">
              <input type="hidden" name="action" value="tenant_status" />
              <input type="hidden" name="tenant_id" value={tenant.tenantId} />
              <input type="hidden" name="target_status" value="suspended" />
              <label><span>Motivo de la suspensión</span><textarea name="reason" required minLength={5} maxLength={500} /></label>
              <p>Se bloqueará el acceso a esta empresa. No se eliminarán datos ni se afectarán otras empresas del usuario.</p>
              <SubmitButton className="admin-button danger">Confirmar suspensión</SubmitButton>
            </form>
          </details>
        )}
      </section>

      <section className="admin-section">
        <div className="section-heading"><div><h2>Clientes Administradores</h2><p>Accesos vinculados a esta empresa.</p></div></div>
        {memberships.length === 0 ? (
          <EmptyState title="Aún no hay accesos" copy="Envía una invitación para vincular al primer Cliente Administrador." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Persona</th><th>Correo</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>
                {memberships.map((membership) => (
                  <tr key={membership.membershipId}>
                    <td>{membership.userName}</td>
                    <td>{membership.userEmail}</td>
                    <td><StatusBadge value={membership.membershipStatus} /></td>
                    <td>
                      <details className="table-action">
                        <summary>{membership.membershipStatus === "active" ? "Desactivar" : "Reactivar"}</summary>
                        <form action="/api/admin/actions" method="post" className="inline-confirmation">
                          <input type="hidden" name="action" value="membership_status" />
                          <input type="hidden" name="tenant_id" value={tenant.tenantId} />
                          <input type="hidden" name="membership_id" value={membership.membershipId} />
                          <input type="hidden" name="target_status" value={membership.membershipStatus === "active" ? "disabled" : "active"} />
                          <label><span>Motivo</span><textarea name="reason" required minLength={5} maxLength={500} /></label>
                          <SubmitButton>Confirmar</SubmitButton>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <div className="section-heading"><div><h2>Invitar Cliente Administrador</h2><p>El rol está limitado a la administración de esta empresa.</p></div></div>
        <form className="admin-form-card compact" action="/api/admin/actions" method="post">
          <input type="hidden" name="action" value="invitation_create" />
          <input type="hidden" name="tenant_id" value={tenant.tenantId} />
          <input type="hidden" name="idempotency_key" value={randomUUID()} />
          <div className="form-grid">
            <label><span>Nombre</span><input name="display_name" required maxLength={120} autoComplete="name" /></label>
            <label><span>Correo</span><input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
          </div>
          <SubmitButton>Generar invitación</SubmitButton>
        </form>
        {invitations.length > 0 ? (
          <div className="table-wrap spaced">
            <table>
              <thead><tr><th>Invitado</th><th>Estado</th><th>Vence</th></tr></thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.invitationId}>
                    <td><strong>{invitation.invitationName}</strong><br />{invitation.invitationEmail}</td>
                    <td><StatusBadge value={invitation.invitationStatus} /></td>
                    <td>{formatDate(invitation.invitationExpiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="admin-section">
        <div className="section-heading"><h2>Actividad reciente</h2></div>
        {audit.length === 0 ? (
          <EmptyState title="Sin actividad" copy="Los cambios de este cliente aparecerán aquí." />
        ) : (
          <ul className="activity-list">
            {audit.map((event) => (
              <li key={event.auditId}>
                <div><strong>{actionLabel(event.action)}</strong><span>{event.actorName || "Sistema"}</span></div>
                <time>{formatDate(event.occurredAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="admin-future-note">La gestión de sitios se incorporará en una siguiente etapa.</div>
    </main>
  );
}
