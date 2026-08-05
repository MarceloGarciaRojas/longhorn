import type { ReactNode } from "react";

export function ClientPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="client-page-header">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function ClientEmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="client-empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

export function ClientStatus({ value }: { value: string }) {
  const labels: Record<string, string> = {
    active: "Activo",
    preparing: "En preparación",
    suspended: "Suspendido",
    pending: "Pendiente",
    paused: "Pausado",
    ended: "Finalizado",
    deletion_requested: "Eliminación solicitada",
    archived: "Archivado",
    submitted: "Solicitud recibida",
    reviewing: "En revisión",
    awaiting_client: "Esperando tu respuesta",
    awaiting_nexi: "Esperando a nexi",
    registering: "Registro en proceso",
    pending_dns: "Configuración en proceso",
    verifying: "Verificando",
    rejected: "Rechazada",
    canceled: "Cancelada",
    closed: "Cerrada",
    open: "Abierta",
    received: "Recibido",
    pending_review: "En revisión",
    waiting_information: "Esperando información",
    internal_review: "Revisión nexi",
    waiting_client_approval: "Esperando tu aprobación",
    ready_to_publish: "Listo para publicar",
    published: "Publicado",
    completed: "Completado",
    not_applicable: "No aplica",
  };
  return (
    <span className={`client-status status-${value}`}>
      {labels[value] ?? value}
    </span>
  );
}

const clientMessages: Record<string, string> = {
  "deletion-requested": "Recibimos tu solicitud de eliminación.",
  "deletion-canceled": "La solicitud de eliminación fue cancelada.",
  "domain-requested": "Recibimos tu solicitud de dominio propio.",
  created: "La conversación fue creada.",
  sent: "Tu mensaje fue enviado.",
  updated: "El estado fue actualizado.",
  "draft-saved": "El borrador fue guardado.",
  published: "El contenido fue publicado.",
  saved: "Guardamos la información de tu incorporación.",
  decision: "Registramos tu decisión.",
  restored: "La publicación anterior fue restaurada como una nueva versión.",
};

const clientErrors: Record<string, string> = {
  invalid: "Revisa los datos e inténtalo nuevamente.",
  duplicate: "Ya existe una solicitud activa para este sitio.",
  conflict: "La información cambió. Recarga la página antes de continuar.",
  not_found: "El registro no está disponible o no pertenece a tu empresa.",
  plan: "Esta función no está incluida en el plan actual.",
  denied: "No tienes permiso para realizar esta acción.",
  too_early: "La acción todavía no está disponible.",
  rate: "Alcanzaste el límite temporal de operaciones. Intenta más tarde.",
};

export function ClientNotice({
  status,
  error,
  field,
}: {
  status?: string;
  error?: string;
  field?: string;
}) {
  if (error) {
    return (
      <div className="client-form-notice error" role="alert">
        {field
          ? `Revisa el campo “${field.replaceAll(".", " › ")}”. No se publicaron cambios.`
          : clientErrors[error] ?? clientErrors.invalid}
      </div>
    );
  }
  if (status && clientMessages[status]) {
    return (
      <div className="client-form-notice success" role="status">
        {clientMessages[status]}
      </div>
    );
  }
  return null;
}

export function formatClientDate(value: Date | string | null): string {
  if (!value) return "No informada";
  const dateOnly =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value;

  return new Date(dateOnly).toLocaleDateString("es-CL", {
    dateStyle: "long",
    timeZone: "America/Santiago",
  });
}
