import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireAuthSession } from "@/src/auth/session.server";
import { TENANT_LOCALES, TENANT_TIMEZONES } from "@/src/admin/validation";
import { Notice, PageHeader } from "../../ui";
import { SubmitButton } from "../../submit-button";
import { SlugField } from "./slug-field";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAuthSession("nexi_admin");
  const query = await searchParams;
  return (
    <main className="admin-content narrow">
      <PageHeader
        eyebrow="Alta asistida"
        title="Crear cliente"
        description="La empresa comenzará como borrador. No se crearán sitios ni servicios."
        action={<Link href="/nexi-interno/clientes">Volver</Link>}
      />
      <Notice error={query.error} />
      <form className="admin-form-card" action="/api/admin/actions" method="post">
        <input type="hidden" name="action" value="tenant_create" />
        <input type="hidden" name="idempotency_key" value={randomUUID()} />
        <label>
          <span>Nombre de la empresa</span>
          <input
            name="display_name"
            required
            minLength={1}
            maxLength={120}
            autoComplete="organization"
          />
        </label>
        <SlugField />
        <div className="form-grid">
          <label>
            <span>Zona horaria</span>
            <select name="timezone" defaultValue="America/Santiago">
              {TENANT_TIMEZONES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Idioma</span>
            <select name="locale" defaultValue="es-CL">
              {TENANT_LOCALES.map((value) => (
                <option key={value} value={value}>Español (Chile)</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-note">
          <strong>Qué ocurrirá</strong>
          <p>Se registrará la empresa en estado borrador y quedará auditada. No se enviarán cobros ni se publicará contenido.</p>
        </div>
        <SubmitButton>Crear cliente</SubmitButton>
      </form>
    </main>
  );
}
