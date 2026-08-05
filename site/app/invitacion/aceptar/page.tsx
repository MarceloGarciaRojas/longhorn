import { AuthShell } from "@/app/auth-shell";

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string; error?: string }>;
}) {
  const query = await searchParams;
  if (query.status === "accepted") {
    return (
      <AuthShell eyebrow="Invitación aceptada" title="Tu acceso está listo">
        <p className="auth-copy">
          La empresa ya está vinculada a tu cuenta. Inicia sesión en nexi para continuar.
        </p>
        <a className="pill primary" href="/ingresar">Iniciar sesión</a>
      </AuthShell>
    );
  }
  return (
    <AuthShell eyebrow="Acceso a una empresa" title="Aceptar invitación">
      {query.error ? (
        <div className="auth-alert" role="alert">
          La invitación no es válida, expiró o fue revocada. Solicita una nueva al equipo nexi.
        </div>
      ) : null}
      {query.token ? (
        <>
          <p className="auth-copy">
            Al continuar, tu identidad será validada y se activará únicamente el acceso autorizado.
          </p>
          <form action="/api/invitations/accept" method="post" className="auth-form">
            <input type="hidden" name="token" value={query.token} />
            <button className="pill primary" type="submit">Aceptar invitación</button>
          </form>
        </>
      ) : (
        <p className="auth-copy">
          Abre el enlace completo recibido en tu invitación. Si ya expiró, solicita que la renueven.
        </p>
      )}
    </AuthShell>
  );
}
