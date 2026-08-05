"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reference = error.digest ?? "client-error";

  useEffect(() => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message: "client_route_error",
        environment: "browser",
        service: "nexi-web",
        correlation_id: reference,
        result: "failure",
      }),
    );
  }, [reference]);

  return (
    <main className="modal-stage">
      <section className="modal-card" aria-labelledby="error-title">
        <span className="kicker">Error inesperado</span>
        <h1 id="error-title">No pudimos cargar esta sección.</h1>
        <p className="modal-copy">
          Intenta nuevamente. Referencia: <code>{reference}</code>
        </p>
        <button className="pill primary" type="button" onClick={reset}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
