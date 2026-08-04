"use client";

export default function ClientAccountError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="client-empty" role="alert">
      <h2>No pudimos cargar tu cuenta</h2>
      <p>
        Tus datos no fueron modificados. Intenta nuevamente o contacta a soporte
        nexi si el problema continúa.
      </p>
      <button type="button" onClick={reset} className="client-button">
        Intentar nuevamente
      </button>
    </section>
  );
}
