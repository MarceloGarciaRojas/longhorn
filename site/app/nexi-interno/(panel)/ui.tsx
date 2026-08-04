import Link from "next/link";
import type { ReactNode } from "react";

const messages: Record<string, string> = {
  created: "Cliente creado en estado borrador.",
  updated: "Los datos del cliente se actualizaron.",
  "state-changed": "El estado del cliente se actualizó.",
  invited: "La invitación quedó pendiente.",
  resent: "La invitación se renovó.",
  revoked: "La invitación quedó revocada.",
  "membership-changed": "El acceso del cliente se actualizó.",
  accepted: "La invitación fue aceptada.",
  "domain-assigned": "El dominio fue registrado.",
  "domain-updated": "El estado del dominio fue actualizado.",
  sent: "El mensaje fue enviado.",
  notifications: "Las notificaciones sintéticas pendientes fueron procesadas.",
  "template-assigned": "La plantilla fue asignada al sitio.",
  "content-initialized": "El borrador inicial fue creado sin publicar.",
};

const errors: Record<string, string> = {
  invalid: "Revisa los datos e inténtalo nuevamente. No se guardaron cambios.",
  duplicate: "Ya existe un registro activo con esos datos.",
  not_found: "El registro ya no está disponible.",
  conflict: "Otra persona actualizó estos datos. Recarga antes de continuar.",
  provider: "El proveedor de identidad no respondió. La invitación no fue enviada.",
  rate: "Se alcanzó el límite temporal de operaciones. Intenta más tarde.",
  too_early: "La solicitud aún no cumple el periodo de espera.",
  denied: "No tienes permiso para realizar esta acción.",
  plan: "El plan actual no incluye esta capacidad.",
};

export function PageHeader({
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
    <header className="admin-page-header">
      <div>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Notice({
  status,
  error,
}: {
  status?: string;
  error?: string;
}) {
  if (error && errors[error]) {
    return (
      <div className="admin-notice error" role="alert">
        {errors[error]}
      </div>
    );
  }
  if (status && messages[status]) {
    return (
      <div className="admin-notice success" role="status">
        {messages[status]}
      </div>
    );
  }
  return null;
}

export function StatusBadge({ value }: { value: string }) {
  const label: Record<string, string> = {
    draft: "Borrador",
    active: "Activo",
    suspended: "Suspendido",
    pending: "Pendiente",
    accepted: "Aceptada",
    expired: "Expirada",
    revoked: "Revocada",
    failed: "Fallida",
    disabled: "Desactivado",
    preparing: "En preparación",
    deletion_requested: "Eliminación solicitada",
    archived: "Archivado",
    approved: "Aprobada",
    rejected: "Rechazada",
    canceled: "Cancelada",
    executed: "Ejecutada",
    submitted: "Recibida",
    reviewing: "En revisión",
    awaiting_client: "Esperando al cliente",
    awaiting_nexi: "Esperando a nexi",
    registering: "Registrando",
    pending_dns: "Configuración pendiente",
    verifying: "Verificando",
    open: "Abierta",
    closed: "Cerrada",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
    error: "Error",
    succeeded: "Correcto",
    blocked: "Bloqueado",
  };
  return <span className={`status-badge status-${value}`}>{label[value] || value}</span>;
}

export function EmptyState({
  title,
  copy,
  href,
  label,
}: {
  title: string;
  copy: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="admin-empty">
      <h2>{title}</h2>
      <p>{copy}</p>
      {href && label ? (
        <Link className="admin-button" href={href}>
          {label}
        </Link>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  query = "",
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) {
    return null;
  }
  const separator = query ? `&${query}` : "";
  return (
    <nav className="admin-pagination" aria-label="Paginación">
      {page > 1 ? (
        <Link href={`${basePath}?page=${page - 1}${separator}`}>Anterior</Link>
      ) : (
        <span />
      )}
      <span>
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={`${basePath}?page=${page + 1}${separator}`}>Siguiente</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  });
}

export function actionLabel(value: string): string {
  return (
    {
      tenant_created: "Cliente creado",
      tenant_updated: "Cliente actualizado",
      tenant_activated: "Cliente activado",
      tenant_suspended: "Cliente suspendido",
      tenant_reactivated: "Cliente reactivado",
      invitation_created: "Invitación creada",
      invitation_resent: "Invitación renovada",
      invitation_failed: "Invitación fallida",
      invitation_revoked: "Invitación revocada",
      invitation_accepted: "Invitación aceptada",
      membership_created: "Acceso creado",
      membership_disabled: "Acceso desactivado",
      membership_reactivated: "Acceso reactivado",
      admin_access_denied: "Acceso interno rechazado",
      client_panel_accessed: "Acceso al panel del cliente",
      personal_profile_updated: "Datos personales actualizados",
      tenant_profile_updated: "Datos de empresa actualizados",
      site_created: "Sitio creado",
      site_updated: "Sitio actualizado",
      subdomain_assigned: "Subdominio asignado",
      deletion_requested: "Eliminación solicitada",
      deletion_canceled: "Solicitud cancelada",
      deletion_approved: "Eliminación aprobada",
      deletion_rejected: "Eliminación rechazada",
      site_archived: "Sitio archivado",
      domain_requested: "Dominio solicitado",
      domain_status_changed: "Estado de dominio actualizado",
      domain_registered: "Dominio registrado",
      conversation_created: "Conversación creada",
      conversation_closed: "Conversación cerrada",
      conversation_reopened: "Conversación reabierta",
      conversation_priority_changed: "Prioridad actualizada",
      support_message_sent: "Mensaje enviado",
      template_assigned: "Plantilla asignada",
      template_version_changed: "Versión de plantilla cambiada",
      content_initialized: "Contenido inicializado",
      content_draft_saved: "Borrador guardado",
      content_edit_conflict: "Conflicto de edición",
      content_previewed: "Vista previa consultada",
      content_published: "Publicación creada",
      content_restored: "Publicación restaurada",
      content_publish_rejected: "Publicación rechazada",
      content_cross_tenant_rejected: "Acceso cruzado rechazado",
      renderer_unknown: "Renderer desconocido",
      public_resolution_failed: "Resolución pública fallida",
    }[value] || value
  );
}
