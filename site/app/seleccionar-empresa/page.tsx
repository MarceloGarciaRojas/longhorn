import { redirect } from "next/navigation";
import { AuthNotice, AuthShell } from "@/app/auth-shell";
import { requireAuthSession } from "@/src/auth/session.server";
import { listClientCompanies } from "@/src/client-portal/client-service.server";

export const dynamic = "force-dynamic";

export default async function SelectTenantPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ error?: string; change?: string }>;
}>) {
  const session = await requireAuthSession("client_admin");
  const { error, change } = await searchParams;
  if (session.activeTenantId && change !== "1") {
    redirect("/cuenta");
  }
  const companies = await listClientCompanies(session);

  return (
    <AuthShell eyebrow="Mi empresa" title="Selecciona una empresa">
      <p className="auth-copy">
        Elige una empresa disponible. La selección se vuelve a validar de forma
        segura antes de cambiar tu espacio de trabajo.
      </p>
      {error && (
        <AuthNotice tone="error">
          No fue posible seleccionar esa empresa.
        </AuthNotice>
      )}
      {companies.length === 0 ? (
        <AuthNotice tone="error">
          No tienes empresas disponibles. Contacta a soporte nexi para revisar
          tu incorporación.
        </AuthNotice>
      ) : (
        <div className="tenant-options">
          {companies.map((company) =>
            company.isAvailable ? (
              <form
                action="/api/auth/select-tenant"
                method="post"
                key={company.tenantId}
              >
                <input
                  type="hidden"
                  name="tenant_id"
                  value={company.tenantId}
                />
                <button type="submit">
                  <b>{company.tenantName}</b>
                  <span>
                    {company.tenantId === session.activeTenantId
                      ? "Empresa actual"
                      : "Disponible"}
                  </span>
                </button>
              </form>
            ) : (
              <div className="tenant-unavailable" key={company.tenantId}>
                <b>{company.tenantName}</b>
                <span>
                  {company.membershipStatus === "disabled"
                    ? "Tu acceso está desactivado. Contacta a soporte nexi."
                    : "Esta empresa está suspendida. Contacta a soporte nexi."}
                </span>
              </div>
            ),
          )}
        </div>
      )}
      <form action="/api/auth/logout" method="post">
        <button className="auth-link auth-button-link" type="submit">
          Cerrar sesión
        </button>
      </form>
    </AuthShell>
  );
}
