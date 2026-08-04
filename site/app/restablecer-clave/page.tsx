import Link from "next/link";
import { cookies } from "next/headers";
import { AuthNotice, AuthShell } from "@/app/auth-shell";
import { loadAuthConfig } from "@/src/auth/config";

export const dynamic = "force-dynamic";

export default async function PasswordResetPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ error?: string }>;
}>) {
  const config = loadAuthConfig();
  const cookieStore = await cookies();
  const hasGrant = Boolean(cookieStore.get(config.recoveryCookieName)?.value);
  const { error } = await searchParams;

  return (
    <AuthShell eyebrow="Recuperación de acceso" title="Crea una contraseña nueva">
      {(!hasGrant || error) && (
        <AuthNotice tone="error">
          El enlace no es válido, expiró o la contraseña no cumple los
          requisitos.
        </AuthNotice>
      )}
      {hasGrant ? (
        <>
          <p className="auth-copy">
            Usa al menos 12 caracteres. Al finalizar se revocarán las sesiones
            activas de la cuenta.
          </p>
          <form
            action="/api/auth/recovery/complete"
            method="post"
            className="auth-form"
          >
            <label>
              Contraseña nueva
              <input
                required
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
              />
            </label>
            <label>
              Confirmar contraseña
              <input
                required
                type="password"
                name="password_confirmation"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
              />
            </label>
            <button className="pill primary" type="submit">
              Guardar contraseña
            </button>
          </form>
        </>
      ) : (
        <Link className="auth-link" href="/recuperar-clave">
          Solicitar un enlace nuevo
        </Link>
      )}
    </AuthShell>
  );
}
