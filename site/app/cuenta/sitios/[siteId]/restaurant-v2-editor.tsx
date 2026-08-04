"use client";

import { useRef, useState } from "react";
import type { MediaAssetRecord } from "@/src/media/types";
import type {
  RestaurantContentV2,
  RestaurantItemV2,
  RestaurantMediaUsage,
} from "@/src/content/types";

function MediaField({
  label,
  value,
  assets,
  onChange,
}: {
  label: string;
  value: RestaurantMediaUsage | null;
  assets: MediaAssetRecord[];
  onChange: (value: RestaurantMediaUsage | null) => void;
}) {
  return (
    <fieldset className="media-selector">
      <legend>{label}</legend>
      <label>
        Imagen
        <select
          value={value?.assetId ?? ""}
          onChange={(event) => {
            const asset = assets.find((candidate) => candidate.id === event.target.value);
            onChange(asset
              ? {
                  assetId: asset.id,
                  altText: asset.defaultAltText || asset.displayName,
                  decorative: false,
                }
              : null);
          }}
        >
          <option value="">Sin imagen</option>
          {assets.filter((asset) => asset.status === "ready").map((asset) => (
            <option value={asset.id} key={asset.id}>{asset.displayName}</option>
          ))}
        </select>
      </label>
      {value ? (
        <>
          <img
            className="media-selector-thumb"
            src={`/api/media/private/${value.assetId}/thumbnail`}
            alt=""
            width={160}
            height={160}
          />
          <label>
            Texto alternativo
            <input
              value={value.altText}
              disabled={value.decorative}
              maxLength={250}
              required={!value.decorative}
              onChange={(event) => onChange({ ...value, altText: event.target.value })}
            />
          </label>
          <label className="content-editor-check">
            <input
              type="checkbox"
              checked={value.decorative}
              onChange={(event) => onChange({
                ...value,
                decorative: event.target.checked,
                altText: event.target.checked ? "" : value.altText,
              })}
            />
            Imagen decorativa
          </label>
          <button type="button" onClick={() => onChange(null)}>Quitar imagen</button>
        </>
      ) : null}
    </fieldset>
  );
}

export function RestaurantV2Editor({
  siteId,
  revision,
  initialContent,
  assets,
}: {
  siteId: string;
  revision: number;
  initialContent: RestaurantContentV2;
  assets: MediaAssetRecord[];
}) {
  const [content, setContent] = useState(initialContent);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  function updateItem(id: string, patch: Partial<RestaurantItemV2>) {
    setContent((current) => ({
      ...current,
      menu: {
        ...current.menu,
        items: current.menu.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item),
      },
    }));
  }

  async function save() {
    setPending(true);
    setMessage(null);
    const form = new FormData();
    form.set("action", "content_save");
    form.set("site_id", siteId);
    form.set("revision", String(revision));
    form.set("idempotency_key", idempotencyKey.current);
    form.set("content_json", JSON.stringify(content));
    try {
      const response = await fetch("/api/client/operations", {
        method: "POST",
        headers: { accept: "application/json" },
        body: form,
      });
      const result = await response.json() as {
        ok: boolean;
        field?: string;
        code?: string;
      };
      if (!response.ok || !result.ok) {
        setMessage(result.field
          ? `Revisa ${result.field}. Tus cambios continúan en pantalla.`
          : "No se pudo guardar. Tus cambios continúan en pantalla.");
        return;
      }
      window.location.assign(`/cuenta/sitios/${siteId}?status=draft-saved`);
    } catch {
      setMessage("No se pudo guardar. Tus cambios continúan en pantalla.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="content-editor" aria-labelledby="editor-v2-title">
      <header className="content-editor-heading">
        <div>
          <span className="kicker">Borrador multimedia · revisión {revision}</span>
          <h2 id="editor-v2-title">Contenido e imágenes</h2>
          <p>Solo seleccionas activos de la biblioteca de este sitio.</p>
        </div>
        <div className="content-editor-actions">
          <a className="client-button secondary" href={`/cuenta/sitios/${siteId}/multimedia`}>
            Abrir biblioteca
          </a>
          <a className="client-button secondary" href={`/cuenta/sitios/${siteId}/preview`} target="_blank">
            Vista previa
          </a>
          <button className="client-button" type="button" disabled={pending} onClick={save}>
            {pending ? "Guardando…" : "Guardar borrador"}
          </button>
        </div>
      </header>
      {message ? <p className="content-editor-error" role="alert">{message}</p> : null}
      <div className="content-editor-sections">
        <fieldset>
          <legend>Identidad</legend>
          <label>Nombre comercial
            <input
              value={content.identity.business_name}
              maxLength={120}
              onChange={(event) => setContent((current) => ({
                ...current,
                identity: { ...current.identity, business_name: event.target.value },
              }))}
            />
          </label>
          <label>Descripción breve
            <textarea
              value={content.identity.short_description}
              maxLength={280}
              onChange={(event) => setContent((current) => ({
                ...current,
                identity: { ...current.identity, short_description: event.target.value },
              }))}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Portada</legend>
          <label>Titular
            <input
              value={content.hero.headline}
              maxLength={140}
              onChange={(event) => setContent((current) => ({
                ...current,
                hero: { ...current.hero, headline: event.target.value },
              }))}
            />
          </label>
          <label>Texto de apoyo
            <textarea
              value={content.hero.subheadline}
              maxLength={320}
              onChange={(event) => setContent((current) => ({
                ...current,
                hero: { ...current.hero, subheadline: event.target.value },
              }))}
            />
          </label>
          <MediaField
            label="Imagen de portada"
            value={content.hero.media}
            assets={assets}
            onChange={(media) => setContent((current) => ({
              ...current,
              hero: { ...current.hero, media },
            }))}
          />
        </fieldset>
        <fieldset>
          <legend>Carta</legend>
          {content.menu.items.map((item) => (
            <article className="content-editor-item" key={item.id}>
              <label>Nombre
                <input
                  value={item.name}
                  maxLength={100}
                  onChange={(event) => updateItem(item.id, { name: event.target.value })}
                />
              </label>
              <label>Descripción
                <textarea
                  value={item.description}
                  maxLength={300}
                  onChange={(event) => updateItem(item.id, {
                    description: event.target.value,
                  })}
                />
              </label>
              <MediaField
                label={`Imagen de ${item.name || "ítem"}`}
                value={item.media}
                assets={assets}
                onChange={(media) => updateItem(item.id, { media })}
              />
            </article>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
