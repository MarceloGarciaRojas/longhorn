import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthNotice, AuthShell } from "@/app/auth-shell";
import { getCurrentAuthSession } from "@/src/auth/session.server";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "No pudimos validar esas credenciales.",
  rate: "Se alcanzó el límite de intentos. Espera antes de volver a intentar.",
  unavailable: "El acceso no está disponible temporalmente. Intenta más tarde.",
  request: "La solicitud no pudo validarse. Recarga la página e intenta otra vez.",
};

export default async function ClientLoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ error?: string; reset?: string }>;
}>) {
  const session = await getCurrentAuthSession();
  if (session?.audience === "client_admin") {
    redirect(session.activeTenantId ? "/cuenta" : "/seleccionar-empresa");
  }
  const { error, reset } = await searchParams;

  return (
    <AuthShell eyebrow="Acceso de clientes" title="Ingresa a tu cuenta">
      <p className="auth-copy">
        Este acceso es exclusivo para clientes administradores asignados por
        nexi.
      </p>
      {error && (
        <AuthNotice tone="error">
          {ERROR_MESSAGES[error] ?? ERROR_MESSAGES.invalid}
        </AuthNotice>
      )}
      {reset === "1" && (
        <AuthNotice tone="success">
          Contraseña actualizada. Ya puedes iniciar sesión nuevamente.
        </AuthNotice>
      )}
      <form action="/api/auth/login" method="post" className="auth-form">
        <input type="hidden" name="audience" value="client_admin" />
        <label>
          Correo
          <input
            required
            type="email"
            name="email"
            autoComplete="username"
            maxLength={254}
          />
        </label>
        <label>
          Contraseña
          <input
            required
            type="password"
            name="password"
            autoComplete="current-password"
            maxLength={1024}
          />
        </label>
        <button className="pill primary" type="submit">
          Ingresar <span>→</span>
        </button>
      </form>
      <Link className="auth-link" href="/recuperar-clave">
        ¿Olvidaste tu contraseña?
      </Link>
      <Link className="auth-link auth-link-muted" href="/">
        Volver al sitio público
      </Link>
    </AuthShell>
  );
}
