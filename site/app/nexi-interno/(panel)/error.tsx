"use client";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="admin-content">
      <div className="admin-empty">
        <h1>No pudimos cargar esta sección</h1>
        <p>Los datos se conservaron. Puedes volver a intentarlo.</p>
        <button className="admin-button" type="button" onClick={reset}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
