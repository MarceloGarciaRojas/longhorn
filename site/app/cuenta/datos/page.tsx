import { requireAuthSession } from "@/src/auth/session.server";
import { loadProfiles } from "@/src/client-portal/client-service.server";
import { ClientPageHeader } from "../ui";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ClientDataPage() {
  const session = await requireAuthSession("client_admin");
  const { personal, company } = await loadProfiles(session);

  return (
    <>
      <ClientPageHeader
        eyebrow="Mi cuenta"
        title="Mis datos"
        description="Mantén actualizada la información autorizada de tu cuenta y empresa."
      />
      <div className="client-profile-stack">
        <ProfileForm
          title="Datos personales"
          description="Estos datos identifican cómo quieres aparecer dentro de nexi."
          action="personal_profile_update"
          version={personal.version}
        >
          <label>
            Nombre visible
            <input
              name="display_name"
              defaultValue={personal.displayName}
              required
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label>
            Teléfono
            <input
              name="phone"
              defaultValue={personal.phone}
              maxLength={32}
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <label>
            Idioma
            <select name="locale" defaultValue={personal.locale}>
              <option value="es-CL">Español (Chile)</option>
            </select>
          </label>
          <label>
            Correo de acceso
            <input value={personal.email} readOnly aria-readonly="true" />
            <small>
              Para cambiar tu correo de acceso, contacta a soporte nexi.
            </small>
          </label>
        </ProfileForm>

        <ProfileForm
          title="Datos de mi empresa"
          description="Información básica utilizada por el equipo nexi para gestionar tu servicio."
          action="company_profile_update"
          version={company.version}
        >
          <label>
            Nombre comercial
            <input
              name="display_name"
              defaultValue={company.displayName}
              required
              maxLength={120}
              autoComplete="organization"
            />
          </label>
          <label>
            Nombre legal
            <input
              name="legal_name"
              defaultValue={company.legalName}
              maxLength={160}
            />
          </label>
          <label>
            Correo de contacto
            <input
              name="contact_email"
              type="email"
              defaultValue={company.contactEmail}
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <label>
            Teléfono de contacto
            <input
              name="contact_phone"
              defaultValue={company.contactPhone}
              maxLength={32}
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <label className="client-form-wide">
            Descripción breve
            <textarea
              name="description"
              defaultValue={company.description}
              maxLength={500}
              rows={4}
            />
          </label>
          <label>
            Zona horaria
            <select name="timezone" defaultValue={company.timezone}>
              <option value="America/Santiago">Santiago de Chile</option>
            </select>
          </label>
          <label>
            Idioma de la empresa
            <select name="locale" defaultValue={company.locale}>
              <option value="es-CL">Español (Chile)</option>
            </select>
          </label>
        </ProfileForm>
      </div>
    </>
  );
}
