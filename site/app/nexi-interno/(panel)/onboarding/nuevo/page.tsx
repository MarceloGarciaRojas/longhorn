import { randomUUID } from "node:crypto";
import Link from "next/link";
import { OperationSubmit } from "@/app/operation-submit";
import { PageHeader } from "../../ui";

export default function NewOnboardingIntakePage() {
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Onboarding"
        title="Registrar solicitud"
        description="Registra información recibida por WhatsApp, llamada, referido u otro canal. No se conecta ningún servicio externo."
        action={<Link className="admin-button secondary" href="/nexi-interno/onboarding">Volver</Link>}
      />
      <form className="admin-form-card" action="/api/onboarding/admin" method="post">
        <input type="hidden" name="action" value="manual_create" />
        <input type="hidden" name="idempotency_key" value={randomUUID()} />
        <div className="form-grid">
          <label><span>Origen</span><select name="source" defaultValue="whatsapp">
            <option value="whatsapp">WhatsApp</option><option value="phone">Llamada</option>
            <option value="referral">Referido</option><option value="manual">Manual</option>
            <option value="other">Otro</option>
          </select></label>
          <label><span>Empresa</span><input name="business_name" required maxLength={120} /></label>
          <label><span>Rubro</span><select name="business_category" defaultValue="restaurant">
            <option value="restaurant">Restaurante</option><option value="cafe">Cafetería</option>
            <option value="hotel">Hotel</option><option value="hostel">Hostal</option>
            <option value="gym">Gimnasio</option><option value="school">Centro educativo</option>
            <option value="clinic">Centro de salud</option>
            <option value="professional_services">Servicios profesionales</option>
            <option value="other">Otro</option>
          </select></label>
          <label><span>Contacto</span><input name="contact_name" required maxLength={120} /></label>
          <label><span>Correo</span><input name="contact_email" type="email" required /></label>
          <label><span>Teléfono opcional</span><input name="contact_phone" maxLength={25} /></label>
          <label><span>Ciudad opcional</span><input name="city" maxLength={120} /></label>
          <label><span>Canal preferido</span><select name="preferred_contact_method">
            <option value="email">Correo</option><option value="phone">Teléfono</option>
            <option value="whatsapp">WhatsApp</option>
          </select></label>
        </div>
        <label><span>Objetivo</span><textarea name="primary_goal" required maxLength={500} /></label>
        <label><span>Información recibida</span><textarea name="short_notes" maxLength={1000} /></label>
        <label><span>Observación interna</span><textarea name="internal_observation" maxLength={2000} /></label>
        <input type="hidden" name="current_digital_presence" value="manual_intake" />
        <OperationSubmit className="admin-button" pendingLabel="Registrando…">
          Registrar sin crear recursos
        </OperationSubmit>
      </form>
    </main>
  );
}
