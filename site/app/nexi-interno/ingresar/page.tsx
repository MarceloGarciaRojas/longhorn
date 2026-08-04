import { redirect } from "next/navigation";
import { AuthNotice, AuthShell } from "@/app/auth-shell";
import { getCurrentAuthSession } from "@/src/auth/session.server";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Acceso interno denegado.",
  mfa: "Se requiere una cuenta interna activa y un segundo factor TOTP válido.",
  rate: "Se alcanzó el límite de intentos. Espera antes de continuar.",
  unavailable: "El servicio de identidad no está disponible temporalmente.",
  request: "La solicitud no pudo validarse.",
};

export default async function InternalLoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ error?: string }>;
}>) {
  const session = await getCurrentAuthSession();
  if (
    session?.audience === "nexi_admin" &&
    session.assuranceLevel === "aal2"
  ) {
    redirect("/nexi-interno");
  }
  const { error } = await searchParams;
  return (
    <AuthShell eyebrow="Acceso interno" title="Administración nexi">
      <p className="auth-copy">
        Ruta reservada al equipo nexi. El acceso exige un segundo factor TOTP.
      </p>
      {error && (
        <AuthNotice tone="error">
          {ERROR_MESSAGES[error] ?? ERROR_MESSAGES.invalid}
        </AuthNotice>
      )}
      <form action="/api/auth/login" method="post" className="auth-form">
        <input type="hidden" name="audience" value="nexi_admin" />
        <label>
          Correo interno
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
        <label>
          Código TOTP
          <input
            required
            type="text"
            name="one_time_code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,8}"
            minLength={6}
            maxLength={8}
          />
        </label>
        <button className="pill primary" type="submit">
          Verificar e ingresar
        </button>
      </form>
    </AuthShell>
  );
}
