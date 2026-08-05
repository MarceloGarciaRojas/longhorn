"use client";

import { useState } from "react";
import type { MediaLibraryPage } from "@/src/media/types";

export function MediaLibraryClient({
  library,
  endpoint = "/api/media/client",
}: {
  library: MediaLibraryPage;
  endpoint?: "/api/media/client" | "/api/media/admin";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadKey] = useState(() => crypto.randomUUID());

  async function submit(form: FormData) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { accept: "application/json" },
        body: form,
      });
      const result = await response.json() as { ok: boolean; code?: string };
      if (!response.ok || !result.ok) {
        setMessage(result.code === "plan"
          ? "Se alcanzó el límite multimedia del sitio."
          : "La operación fue rechazada de forma segura.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("No fue posible completar la operación.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {message ? <p className="content-editor-error" role="alert">{message}</p> : null}
      <section className="client-profile-form">
        <header>
          <h2>Subir imagen</h2>
          <p>JPEG, PNG o WebP. La imagen se normaliza y se eliminan sus metadatos.</p>
        </header>
        <form action={submit}>
          <input type="hidden" name="action" value="upload" />
          <input type="hidden" name="site_id" value={library.siteId} />
          <input type="hidden" name="idempotency_key" value={uploadKey} />
          <label>Archivo
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <button className="client-button" disabled={pending}>
            {pending ? "Procesando…" : "Subir y procesar"}
          </button>
        </form>
      </section>
      <section className="client-profile-form">
        <header>
          <h2>Biblioteca</h2>
          <p>
            {library.quota.usedAssets} de {library.quota.assetLimit} activos ·{" "}
            {(library.quota.usedBytes / 1024 / 1024).toFixed(1)} MB usados
          </p>
        </header>
        <form method="get" className="client-form-grid">
          <label>Buscar<input name="q" defaultValue={library.search} /></label>
          <label>Estado
            <select name="status" defaultValue={library.status}>
              <option value="all">Todos</option>
              <option value="ready">Listos</option>
              <option value="processing">Procesando</option>
              <option value="rejected">Rechazados</option>
              <option value="failed">Fallidos</option>
              <option value="archived">Archivados</option>
            </select>
          </label>
          <button className="client-button secondary">Filtrar</button>
        </form>
        <div className="media-library-grid">
          {library.assets.map((asset) => (
            <article className="media-library-card" key={asset.id}>
              {asset.status === "ready" || asset.status === "archived" ? (
                <img
                  src={`/api/media/private/${asset.id}/thumbnail${
                    endpoint === "/api/media/admin" ? "?audience=admin" : ""
                  }`}
                  alt=""
                  width={240}
                  height={240}
                  loading="lazy"
                />
              ) : <div className="media-library-placeholder" aria-hidden="true" />}
              <strong>{asset.displayName}</strong>
              <span>{asset.status} · {asset.referenceCount} referencias</span>
              <form action={submit}>
                <input type="hidden" name="action" value="metadata" />
                <input type="hidden" name="site_id" value={library.siteId} />
                <input type="hidden" name="asset_id" value={asset.id} />
                <input type="hidden" name="version" value={asset.version} />
                <label>Nombre<input name="display_name" defaultValue={asset.displayName} /></label>
                <label>Alt predeterminado
                  <input name="default_alt_text" defaultValue={asset.defaultAltText} maxLength={250} />
                </label>
                <button disabled={pending}>Guardar</button>
              </form>
              {asset.status === "ready" || asset.status === "archived" ? (
                <form action={submit}>
                  <input type="hidden" name="action" value={asset.status === "ready" ? "archive" : "restore"} />
                  <input type="hidden" name="site_id" value={library.siteId} />
                  <input type="hidden" name="asset_id" value={asset.id} />
                  <input type="hidden" name="version" value={asset.version} />
                  <button disabled={pending}>{asset.status === "ready" ? "Archivar" : "Restaurar"}</button>
                </form>
              ) : null}
              {asset.rejectionCode ? <small>Motivo: {asset.rejectionCode}</small> : null}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
