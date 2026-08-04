import Link from "next/link";
import { AuthNotice, AuthShell } from "@/app/auth-shell";

export const dynamic = "force-dynamic";

export default async function RecoveryPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ sent?: string }>;
}>) {
  const { sent } = await searchParams;
  return (
    <AuthShell eyebrow="Recuperación de acceso" title="Restablece tu contraseña">
      <p className="auth-copy">
        Escribe tu correo. Si existe una cuenta habilitada, recibirás las
        instrucciones configuradas por el proveedor de identidad.
      </p>
      {sent === "1" && (
        <AuthNotice tone="success">
          Si la cuenta existe, enviamos las instrucciones. Por seguridad no
          confirmamos si el correo está registrado.
        </AuthNotice>
      )}
      <form action="/api/auth/recovery" method="post" className="auth-form">
        <label>
          Correo
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
          />
        </label>
        <button className="pill primary" type="submit">
          Enviar instrucciones
        </button>
      </form>
      <Link className="auth-link" href="/ingresar">
        Volver al ingreso
      </Link>
    </AuthShell>
  );
}
