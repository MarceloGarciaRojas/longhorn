import { requireAuthSession } from "@/src/auth/session.server";
import { loadPlan } from "@/src/client-portal/client-service.server";
import {
  ClientEmptyState,
  ClientPageHeader,
  ClientStatus,
  formatClientDate,
} from "../ui";

export const dynamic = "force-dynamic";

export default async function ClientPlanPage() {
  const session = await requireAuthSession("client_admin");
  const plan = await loadPlan(session);
  return (
    <>
      <ClientPageHeader
        eyebrow="Mi cuenta"
        title="Mi plan"
        description="Consulta las condiciones actualmente configuradas para tu empresa."
      />
      {!plan ? (
        <ClientEmptyState title="Tu plan aún no está configurado">
          Contacta a soporte nexi para revisar la configuración de tu cuenta.
        </ClientEmptyState>
      ) : (
        <section className="client-plan-card">
          <div className="client-plan-heading">
            <div>
              <ClientStatus value={plan.status} />
              <h2>{plan.displayName}</h2>
              <p>{plan.description}</p>
            </div>
            <dl>
              <div>
                <dt>Inicio</dt>
                <dd>{formatClientDate(plan.startsAt)}</dd>
              </div>
              <div>
                <dt>Próxima fecha de referencia</dt>
                <dd>{formatClientDate(plan.referenceDate)}</dd>
              </div>
            </dl>
          </div>
          <h3>Características principales</h3>
          <ul>
            {plan.features.map((feature) => (
              <li key={feature.key}>
                <strong>{feature.displayName}</strong>
                {feature.detail ? <span>{feature.detail}</span> : null}
              </li>
            ))}
          </ul>
          {plan.code === "pro" ? (
            <p className="client-plan-note">
              Preparado para incorporar dominio propio y futuras funciones de
              tienda online. La tienda online todavía no está operativa.
            </p>
          ) : null}
          <p className="client-support-note">
            La asignación y los cambios de plan son gestionados por soporte
            nexi.
          </p>
        </section>
      )}
    </>
  );
}
