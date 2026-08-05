import { randomUUID } from "node:crypto";
import Link from "next/link";
import { loadOnboardingConfig } from "@/src/onboarding/config";
import { ONBOARDING_INDUSTRIES } from "@/src/onboarding/types";

const categoryLabels: Record<(typeof ONBOARDING_INDUSTRIES)[number], string> = {
  restaurant: "Restaurante",
  cafe: "Cafetería",
  hotel: "Hotel",
  hostel: "Hostal",
  gym: "Gimnasio",
  school: "Centro educativo",
  clinic: "Centro de salud",
  professional_services: "Servicios profesionales",
  other: "Otro",
};

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const config = loadOnboardingConfig();
  const query = await searchParams;
  const received = query.status === "received";
  const invalid = query.status === "invalid";
  return (
    <main className="onboarding-public-page">
      <section className="onboarding-public-card">
        <Link href="/" className="onboarding-public-brand">nexi</Link>
        <p className="eyebrow">Solicitud de incorporación</p>
        <h1>Cuéntanos lo esencial de tu negocio</h1>
        <p>
          Revisaremos tu información de forma asistida. Enviar este formulario
          no crea una cuenta, no publica un sitio y no genera cobros.
        </p>
        {!config.publicFormEnabled ? (
          <div className="form-notice">El formulario no está disponible.</div>
        ) : received ? (
          <div className="form-notice success" role="status">
            <h2>Solicitud recibida</h2>
            <p>
              Recibimos tu solicitud. El equipo nexi la revisará y se pondrá
              en contacto contigo.
            </p>
            <Link href="/">Volver al inicio</Link>
          </div>
        ) : (
          <form action="/api/onboarding/public" method="post">
            {invalid ? (
              <p className="form-notice error" role="alert">
                Revisa los datos e inténtalo nuevamente.
              </p>
            ) : null}
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <input type="hidden" name="source_hint" value="landing" />
            <div className="public-form-grid">
              <label>
                Nombre del negocio
                <input name="business_name" required minLength={2} maxLength={120} />
              </label>
              <label>
                Rubro
                <select name="business_category" required defaultValue="restaurant">
                  {ONBOARDING_INDUSTRIES.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabels[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tu nombre
                <input name="contact_name" required minLength={2} maxLength={120} />
              </label>
              <label>
                Correo de contacto
                <input name="contact_email" type="email" required maxLength={254} />
              </label>
              <label>
                Teléfono (opcional)
                <input name="contact_phone" type="tel" maxLength={24} />
              </label>
              <label>
                Canal preferido
                <select name="preferred_contact_method" defaultValue="email">
                  <option value="email">Correo</option>
                  <option value="phone">Teléfono</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
              <label>
                Ciudad (opcional)
                <input name="city" maxLength={120} />
              </label>
              <label>
                Presencia digital actual
                <select name="current_digital_presence" defaultValue="none">
                  <option value="none">Aún no tengo</option>
                  <option value="social_media">Solo redes sociales</option>
                  <option value="existing_site">Tengo un sitio</option>
                  <option value="other">Otra</option>
                </select>
              </label>
            </div>
            <label>
              Objetivo principal
              <textarea
                name="primary_goal"
                required
                minLength={2}
                maxLength={500}
                rows={3}
              />
            </label>
            <label>
              Nota breve (opcional)
              <textarea
                name="short_notes"
                maxLength={config.maxNotesLength}
                rows={4}
              />
            </label>
            <div className="form-honeypot" aria-hidden="true">
              <label>
                No completar este campo
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="privacy_acknowledgement"
                value="accepted"
                required
              />
              Autorizo a nexi a utilizar estos datos para revisar y responder
              esta solicitud.
            </label>
            <button type="submit" className="pill primary">
              Enviar solicitud
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
