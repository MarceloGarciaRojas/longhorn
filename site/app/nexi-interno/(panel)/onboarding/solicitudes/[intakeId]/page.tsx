import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationSubmit } from "@/app/operation-submit";
import { requireAuthSession } from "@/src/auth/session.server";
import {
  adminIntake,
  adminIntakeInternalNotes,
  adminOnboardingOptions,
} from "@/src/onboarding/service.server";
import { normalizeSlug } from "@/src/admin/validation";
import { Notice, PageHeader, StatusBadge } from "../../../ui";

export default async function IntakeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ intakeId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const { intakeId } = await params;
  const [intake, notes, options, query] = await Promise.all([
    adminIntake(session, intakeId),
    adminIntakeInternalNotes(session, intakeId),
    adminOnboardingOptions(session),
    searchParams,
  ]);
  if (!intake) notFound();
  const editable = !["converted","rejected","canceled"].includes(intake.status);
  const slug = normalizeSlug(intake.businessName);
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Solicitud de incorporación"
        title={intake.businessName}
        description={`${intake.contactName} · ${intake.contactEmail}`}
        action={<Link className="admin-button secondary" href="/nexi-interno/onboarding">Volver</Link>}
      />
      <Notice status={query.status} error={query.error} />
      <section className="admin-detail-hero">
        <div><span>Estado</span><StatusBadge value={intake.status} /></div>
        <div><span>Rubro</span><strong>{intake.businessCategory}</strong></div>
        <div><span>Soporte técnico</span><strong>{intake.supportedCategory ? "Disponible" : "No disponible"}</strong></div>
        <div><span>Origen</span><strong>{intake.source}</strong></div>
      </section>
      {notes.length ? (
        <section className="admin-section">
          <div className="section-heading">
            <div>
              <h2>Notas internas</h2>
              <p>No se muestran al cliente.</p>
            </div>
          </div>
          <ul className="activity-list">
            {notes.map((note) => (
              <li key={note.id}>
                <div>
                  <strong>{note.authorName}</strong>
                  <span>{note.note}</span>
                </div>
                <time>{note.createdAt.toLocaleString("es-CL")}</time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="admin-section">
        <div className="section-heading"><div><h2>Información inicial</h2></div></div>
        <dl className="admin-data-list">
          <div><dt>Objetivo</dt><dd>{intake.primaryGoal}</dd></div>
          <div><dt>Presencia actual</dt><dd>{intake.currentDigitalPresence}</dd></div>
          <div><dt>Ciudad</dt><dd>{intake.city ?? "No indicada"}</dd></div>
          <div><dt>Nota entregada</dt><dd>{intake.shortNotes ?? "Sin nota"}</dd></div>
        </dl>
      </section>
      {editable ? (
        <section className="admin-section">
          <div className="section-heading"><div><h2>Revisión</h2><p>Estas acciones no crean tenant ni sitio.</p></div></div>
          <div className="admin-action-grid">
            <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
              <input type="hidden" name="action" value="intake_review" />
              <input type="hidden" name="intake_id" value={intake.id} />
              <input type="hidden" name="version" value={intake.version} />
              <input type="hidden" name="target_status" value="accepted" />
              <OperationSubmit className="admin-button">Aceptar solicitud</OperationSubmit>
            </form>
            <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
              <input type="hidden" name="action" value="intake_review" />
              <input type="hidden" name="intake_id" value={intake.id} />
              <input type="hidden" name="version" value={intake.version} />
              <input type="hidden" name="target_status" value="waiting_information" />
              <label><span>Información requerida</span><input name="reason" required maxLength={500} /></label>
              <OperationSubmit className="admin-button secondary">Solicitar información</OperationSubmit>
            </form>
            <form className="admin-form-card compact" action="/api/onboarding/admin" method="post">
              <input type="hidden" name="action" value="intake_review" />
              <input type="hidden" name="intake_id" value={intake.id} />
              <input type="hidden" name="version" value={intake.version} />
              <input type="hidden" name="target_status" value="rejected" />
              <label><span>Motivo operativo</span><input name="reason" required maxLength={500} /></label>
              <OperationSubmit className="admin-button danger" confirmMessage="¿Rechazar esta solicitud?">
                Rechazar
              </OperationSubmit>
            </form>
          </div>
        </section>
      ) : null}
      {intake.status === "accepted" && intake.supportedCategory ? (
        <section className="admin-section">
          <div className="section-heading">
            <div><h2>Convertir en caso operativo</h2><p>La operación es reanudable e idempotente.</p></div>
          </div>
          <form className="admin-form-card" action="/api/onboarding/admin" method="post">
            <input type="hidden" name="action" value="intake_convert" />
            <input type="hidden" name="intake_id" value={intake.id} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <div className="form-grid">
              <label><span>Tenant</span><select name="tenant_id" defaultValue="">
                <option value="">Crear uno nuevo</option>
                {options.tenants.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select></label>
              <label><span>Slug de empresa</span><input name="tenant_slug" defaultValue={slug} required /></label>
              <label><span>Slug del sitio</span><input name="site_slug" defaultValue={slug} required /></label>
              <label><span>Plan</span><select name="plan_id" required defaultValue={options.plans[0]?.id}>
                {options.plans.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select></label>
              <label><span>Plantilla</span><select name="template_version_id" required defaultValue={options.templates[0]?.id}>
                {options.templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select></label>
              <label><span>Responsable</span><select name="assigned_admin_user_id" defaultValue={session.userId}>
                <option value="">Sin asignar</option>
                {options.admins.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select></label>
              <label><span>Prioridad</span><select name="priority" defaultValue="normal">
                <option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
              </select></label>
            </div>
            <p className="form-note">
              Se prepararán tenant, perfil, plan, sitio, subdominio local,
              plantilla, caso, checklist, conversación e invitación sintética.
            </p>
            <OperationSubmit className="admin-button" confirmMessage="¿Confirmas la conversión controlada?">
              Convertir solicitud
            </OperationSubmit>
          </form>
        </section>
      ) : null}
      {!intake.supportedCategory ? (
        <p className="admin-notice local-only">
          Este rubro queda registrado como interés comercial. No puede recibir
          una plantilla restaurant.v2.
        </p>
      ) : null}
    </main>
  );
}
