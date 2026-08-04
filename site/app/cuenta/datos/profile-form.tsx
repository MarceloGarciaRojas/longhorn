"use client";

import { useState, type FormEvent, type ReactNode } from "react";

const messages: Record<string, string> = {
  invalid: "Revisa los campos indicados. Tus datos se conservaron en el formulario.",
  forbidden: "El formulario contiene un cambio no permitido. No se guardaron datos.",
  denied: "No tienes autorización para realizar este cambio.",
  conflict:
    "La información cambió en otra sesión. Tus datos se conservaron; recarga antes de volver a guardar.",
  rate: "Realizaste varias operaciones seguidas. Espera un momento e intenta nuevamente.",
  request: "La solicitud no pudo validarse. Recarga la página e intenta nuevamente.",
  session: "Tu sesión terminó. Inicia sesión nuevamente para continuar.",
};

export function ProfileForm({
  title,
  description,
  action,
  version: initialVersion,
  children,
}: {
  title: string;
  description: string;
  action: "personal_profile_update" | "company_profile_update";
  version: number;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice(null);
    const form = event.currentTarget;
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { accept: "application/json" },
      });
      const result = (await response.json()) as {
        ok?: boolean;
        code?: string;
        version?: number;
      };
      if (!response.ok || !result.ok) {
        if (result.code === "session") {
          window.location.assign("/ingresar");
          return;
        }
        setNotice({
          tone: "error",
          message: messages[result.code ?? "invalid"] ?? messages.invalid,
        });
        return;
      }
      if (typeof result.version === "number") {
        setVersion(result.version);
      }
      setNotice({
        tone: "success",
        message: "Tus datos se guardaron correctamente.",
      });
    } catch {
      setNotice({
        tone: "error",
        message:
          "No pudimos comunicarnos con nexi. Tus datos siguen en el formulario; intenta nuevamente.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action="/api/client/actions"
      method="post"
      className="client-profile-form"
      onSubmit={submit}
    >
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="profile_version" value={version} />
      <div className="client-form-grid">{children}</div>
      {notice ? (
        <p
          className={`client-form-notice ${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}
      <button className="client-button" type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
