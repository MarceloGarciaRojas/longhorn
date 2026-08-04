import Link from "next/link";

export default function NotFound() {
  return (
    <main className="modal-stage">
      <section className="modal-card" aria-labelledby="not-found-title">
        <span className="kicker">Error 404</span>
        <h1 id="not-found-title">Esta página no existe.</h1>
        <p className="modal-copy">
          Revisa la dirección o vuelve al inicio de nexi.
        </p>
        <Link className="pill primary" href="/">
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
