"use client";

import { useRef, useState } from "react";
import type {
  RestaurantCategory,
  RestaurantContent,
  RestaurantItem,
} from "@/src/content/types";
import {
  RESTAURANT_DAYS,
  RESTAURANT_MEDIA_REFERENCES,
} from "@/src/content/types";

const DAY_LABELS = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
} as const;

function resequence<T extends { order: number }>(values: T[]): T[] {
  return values.map((value, order) => ({ ...value, order }));
}

function move<T>(values: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= values.length) return values;
  const result = [...values];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

function errorLabel(code: string): string {
  if (code === "conflict") {
    return "El borrador cambió en otra sesión. Recarga antes de volver a guardar.";
  }
  if (code === "session") return "Tu sesión terminó. Vuelve a ingresar.";
  if (code === "rate") return "Espera unos minutos antes de volver a intentar.";
  if (code === "denied") return "No tienes permiso para modificar este contenido.";
  return "Revisa los campos indicados. No se guardó ningún cambio.";
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    "identity.business_name": "Nombre comercial",
    "identity.short_description": "Descripción breve",
    "identity.tagline": "Lema",
    "hero.headline": "Titular de portada",
    "hero.subheadline": "Texto de apoyo",
    "hero.primary_cta_label": "Texto del botón",
    "hero.primary_cta_target": "Destino del botón",
    "about.title": "Título de Sobre nosotros",
    "about.description": "Descripción de Sobre nosotros",
    "menu.categories": "Categorías",
    "menu.items": "Ítems de la carta",
    hours: "Horarios",
    "contact.public_email": "Correo público",
    "contact.public_phone": "Teléfono público",
    "contact.address_line": "Dirección",
    "contact.city": "Ciudad",
    "seo.title": "Título SEO",
    "seo.description": "Descripción SEO",
  };
  return labels[field] ?? field.replaceAll(".", " › ");
}

export function RestaurantEditor({
  siteId,
  revision,
  initialContent,
}: {
  siteId: string;
  revision: number;
  initialContent: RestaurantContent;
}) {
  const [content, setContent] = useState(initialContent);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  function updateSection<K extends keyof RestaurantContent>(
    section: K,
    patch: Partial<RestaurantContent[K]>,
  ) {
    setContent((current) => ({
      ...current,
      [section]: { ...current[section], ...patch },
    }));
  }

  function updateCategory(id: string, patch: Partial<RestaurantCategory>) {
    setContent((current) => ({
      ...current,
      menu: {
        ...current.menu,
        categories: current.menu.categories.map((category) =>
          category.id === id ? { ...category, ...patch } : category),
      },
    }));
  }

  function addCategory() {
    setContent((current) => {
      if (current.menu.categories.length >= 8) return current;
      return {
        ...current,
        menu: {
          ...current.menu,
          categories: [
            ...current.menu.categories,
            {
              id: crypto.randomUUID(),
              name: "",
              description: "",
              order: current.menu.categories.length,
            },
          ],
        },
      };
    });
  }

  function removeCategory(id: string) {
    setContent((current) => ({
      ...current,
      menu: {
        ...current.menu,
        categories: resequence(current.menu.categories.filter((category) => category.id !== id)),
        items: current.menu.items.filter((item) => item.category_id !== id),
      },
    }));
  }

  function moveCategory(index: number, direction: -1 | 1) {
    setContent((current) => ({
      ...current,
      menu: {
        ...current.menu,
        categories: resequence(move(current.menu.categories, index, direction)),
      },
    }));
  }

  function updateItem(id: string, patch: Partial<RestaurantItem>) {
    setContent((current) => ({
      ...current,
      menu: {
        ...current.menu,
        items: current.menu.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item),
      },
    }));
  }

  function addItem(categoryId: string) {
    setContent((current) => {
      if (current.menu.items.length >= 40) return current;
      const order = current.menu.items.filter(
        (item) => item.category_id === categoryId,
      ).length;
      return {
        ...current,
        menu: {
          ...current.menu,
          items: [
            ...current.menu.items,
            {
              id: crypto.randomUUID(),
              category_id: categoryId,
              name: "",
              description: "",
              price_text: "",
              availability: true,
              order,
              media_reference: "placeholder",
            },
          ],
        },
      };
    });
  }

  function removeItem(id: string) {
    setContent((current) => {
      const removed = current.menu.items.find((item) => item.id === id);
      const remaining = current.menu.items.filter((item) => item.id !== id);
      return {
        ...current,
        menu: {
          ...current.menu,
          items: removed
            ? remaining.map((item) => item.category_id === removed.category_id
              ? {
                  ...item,
                  order: remaining.filter(
                    (candidate) =>
                      candidate.category_id === removed.category_id &&
                      candidate.order < item.order,
                  ).length,
                }
              : item)
            : remaining,
        },
      };
    });
  }

  function moveItem(categoryId: string, itemId: string, direction: -1 | 1) {
    setContent((current) => {
      const categoryItems = current.menu.items
        .filter((item) => item.category_id === categoryId)
        .sort((a, b) => a.order - b.order);
      const index = categoryItems.findIndex((item) => item.id === itemId);
      const reordered = resequence(move(categoryItems, index, direction));
      const orderById = new Map(reordered.map((item) => [item.id, item.order]));
      return {
        ...current,
        menu: {
          ...current.menu,
          items: current.menu.items.map((item) =>
            item.category_id === categoryId
              ? { ...item, order: orderById.get(item.id) ?? item.order }
              : item),
        },
      };
    });
  }

  async function saveDraft() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    idempotencyKey.current ??= crypto.randomUUID();
    const form = new FormData();
    form.set("action", "content_save");
    form.set("site_id", siteId);
    form.set("revision", String(revision));
    form.set("idempotency_key", idempotencyKey.current);
    form.set("content_json", JSON.stringify(content));
    try {
      const response = await fetch("/api/client/operations", {
        method: "POST",
        body: form,
        headers: { accept: "application/json" },
      });
      const result = await response.json() as {
        ok: boolean;
        code?: string;
        field?: string;
      };
      if (!response.ok || !result.ok) {
        setMessage(result.field
          ? `Revisa el campo “${fieldLabel(result.field)}”. Tus cambios siguen visibles.`
          : errorLabel(result.code ?? "invalid"));
        return;
      }
      window.location.assign(`/cuenta/sitios/${siteId}?status=draft-saved`);
    } catch {
      setMessage("No fue posible guardar. Tus cambios siguen visibles en este formulario.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="content-editor" aria-labelledby="content-editor-title">
      <header className="content-editor-heading">
        <div>
          <span className="kicker">Borrador · revisión {revision}</span>
          <h2 id="content-editor-title">Editor estructurado</h2>
          <p>El diseño y el orden de las secciones están protegidos por la plantilla.</p>
        </div>
        <div className="content-editor-actions">
          <a
            className="client-button secondary"
            href={`/cuenta/sitios/${siteId}/preview`}
            target="_blank"
            rel="noreferrer"
          >
            Vista previa
          </a>
          <button
            className="client-button"
            type="button"
            disabled={pending}
            onClick={saveDraft}
          >
            {pending ? "Guardando…" : "Guardar borrador"}
          </button>
        </div>
      </header>
      {message ? <p className="content-editor-error" role="alert">{message}</p> : null}

      <div className="content-editor-sections">
        <fieldset>
          <legend>1. Identidad</legend>
          <label>Nombre comercial
            <input
              value={content.identity.business_name}
              maxLength={120}
              onChange={(event) => updateSection("identity", { business_name: event.target.value })}
            />
          </label>
          <label>Descripción breve
            <textarea
              value={content.identity.short_description}
              maxLength={280}
              onChange={(event) => updateSection("identity", { short_description: event.target.value })}
            />
          </label>
          <label>Lema
            <input
              value={content.identity.tagline}
              maxLength={100}
              onChange={(event) => updateSection("identity", { tagline: event.target.value })}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>2. Portada</legend>
          <label>Titular
            <input
              value={content.hero.headline}
              maxLength={140}
              onChange={(event) => updateSection("hero", { headline: event.target.value })}
            />
          </label>
          <label>Texto de apoyo
            <textarea
              value={content.hero.subheadline}
              maxLength={320}
              onChange={(event) => updateSection("hero", { subheadline: event.target.value })}
            />
          </label>
          <div className="content-editor-grid">
            <label>Texto del botón
              <input
                value={content.hero.primary_cta_label}
                maxLength={60}
                onChange={(event) => updateSection("hero", { primary_cta_label: event.target.value })}
              />
            </label>
            <label>Acción
              <select
                value={content.hero.primary_cta_type}
                onChange={(event) => updateSection("hero", {
                  primary_cta_type: event.target.value as RestaurantContent["hero"]["primary_cta_type"],
                  primary_cta_target: event.target.value === "menu" ? "#menu" : "",
                })}
              >
                <option value="menu">Ir a la carta</option>
                <option value="phone">Llamar</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="map">Abrir mapa</option>
              </select>
            </label>
            <label>Destino
              <input
                value={content.hero.primary_cta_target}
                maxLength={500}
                disabled={content.hero.primary_cta_type === "menu"}
                onChange={(event) => updateSection("hero", { primary_cta_target: event.target.value })}
              />
            </label>
            <label>Imagen interna
              <select
                value={content.hero.hero_media_reference}
                onChange={(event) => updateSection("hero", {
                  hero_media_reference: event.target.value as RestaurantContent["hero"]["hero_media_reference"],
                })}
              >
                {RESTAURANT_MEDIA_REFERENCES.map((reference) => (
                  <option value={reference} key={reference}>{reference}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>3. Sobre nosotros</legend>
          <label>Título
            <input
              value={content.about.title}
              maxLength={120}
              onChange={(event) => updateSection("about", { title: event.target.value })}
            />
          </label>
          <label>Descripción
            <textarea
              rows={5}
              value={content.about.description}
              maxLength={1200}
              onChange={(event) => updateSection("about", { description: event.target.value })}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>4. Menú u oferta</legend>
          <label>Título de la carta
            <input
              value={content.menu.section_title}
              maxLength={120}
              onChange={(event) => setContent((current) => ({
                ...current,
                menu: { ...current.menu, section_title: event.target.value },
              }))}
            />
          </label>
          <div className="content-editor-list">
            {[...content.menu.categories]
              .sort((a, b) => a.order - b.order)
              .map((category, categoryIndex) => (
                <article className="content-editor-card" key={category.id}>
                  <header>
                    <strong>Categoría {categoryIndex + 1}</strong>
                    <div>
                      <button type="button" onClick={() => moveCategory(categoryIndex, -1)} disabled={categoryIndex === 0}>Subir</button>
                      <button type="button" onClick={() => moveCategory(categoryIndex, 1)} disabled={categoryIndex === content.menu.categories.length - 1}>Bajar</button>
                      <button type="button" onClick={() => removeCategory(category.id)}>Quitar</button>
                    </div>
                  </header>
                  <label>Nombre
                    <input value={category.name} maxLength={80} onChange={(event) => updateCategory(category.id, { name: event.target.value })} />
                  </label>
                  <label>Descripción
                    <input value={category.description} maxLength={240} onChange={(event) => updateCategory(category.id, { description: event.target.value })} />
                  </label>
                  <div className="content-editor-items">
                    {content.menu.items
                      .filter((item) => item.category_id === category.id)
                      .sort((a, b) => a.order - b.order)
                      .map((item, itemIndex, categoryItems) => (
                        <div className="content-editor-item" key={item.id}>
                          <header>
                            <b>Ítem {itemIndex + 1}</b>
                            <div>
                              <button type="button" onClick={() => moveItem(category.id, item.id, -1)} disabled={itemIndex === 0}>Subir</button>
                              <button type="button" onClick={() => moveItem(category.id, item.id, 1)} disabled={itemIndex === categoryItems.length - 1}>Bajar</button>
                              <button type="button" onClick={() => removeItem(item.id)}>Quitar</button>
                            </div>
                          </header>
                          <div className="content-editor-grid">
                            <label>Nombre
                              <input value={item.name} maxLength={100} onChange={(event) => updateItem(item.id, { name: event.target.value })} />
                            </label>
                            <label>Precio visible
                              <input value={item.price_text} maxLength={40} onChange={(event) => updateItem(item.id, { price_text: event.target.value })} />
                            </label>
                            <label className="content-editor-wide">Descripción
                              <textarea value={item.description} maxLength={300} onChange={(event) => updateItem(item.id, { description: event.target.value })} />
                            </label>
                            <label>Imagen interna
                              <select value={item.media_reference} onChange={(event) => updateItem(item.id, {
                                media_reference: event.target.value as RestaurantItem["media_reference"],
                              })}>
                                {RESTAURANT_MEDIA_REFERENCES.map((reference) => (
                                  <option value={reference} key={reference}>{reference}</option>
                                ))}
                              </select>
                            </label>
                            <label className="content-editor-check">
                              <input type="checkbox" checked={item.availability} onChange={(event) => updateItem(item.id, { availability: event.target.checked })} />
                              Disponible
                            </label>
                          </div>
                        </div>
                      ))}
                    <button className="client-button secondary" type="button" onClick={() => addItem(category.id)} disabled={content.menu.items.length >= 40}>
                      Agregar ítem
                    </button>
                  </div>
                </article>
              ))}
          </div>
          <button className="client-button secondary" type="button" onClick={addCategory} disabled={content.menu.categories.length >= 8}>
            Agregar categoría
          </button>
        </fieldset>

        <fieldset>
          <legend>5. Horarios</legend>
          <div className="content-hours-grid">
            {RESTAURANT_DAYS.map((day) => {
              const index = content.hours.findIndex((schedule) => schedule.day === day);
              const schedule = content.hours[index];
              return (
                <div className="content-hours-row" key={day}>
                  <strong>{DAY_LABELS[day]}</strong>
                  <label className="content-editor-check">
                    <input
                      type="checkbox"
                      checked={schedule.is_open}
                      onChange={(event) => setContent((current) => ({
                        ...current,
                        hours: current.hours.map((entry) => entry.day === day
                          ? {
                              ...entry,
                              is_open: event.target.checked,
                              opening_time: event.target.checked ? entry.opening_time || "12:00" : "",
                              closing_time: event.target.checked ? entry.closing_time || "20:00" : "",
                            }
                          : entry),
                      }))}
                    />
                    Abierto
                  </label>
                  <label>Apertura
                    <input type="time" disabled={!schedule.is_open} value={schedule.opening_time} onChange={(event) => setContent((current) => ({
                      ...current,
                      hours: current.hours.map((entry) => entry.day === day ? { ...entry, opening_time: event.target.value } : entry),
                    }))} />
                  </label>
                  <label>Cierre
                    <input type="time" disabled={!schedule.is_open} value={schedule.closing_time} onChange={(event) => setContent((current) => ({
                      ...current,
                      hours: current.hours.map((entry) => entry.day === day ? { ...entry, closing_time: event.target.value } : entry),
                    }))} />
                  </label>
                  <label>Nota
                    <input maxLength={120} value={schedule.note} onChange={(event) => setContent((current) => ({
                      ...current,
                      hours: current.hours.map((entry) => entry.day === day ? { ...entry, note: event.target.value } : entry),
                    }))} />
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend>6. Contacto</legend>
          <div className="content-editor-grid">
            <label>Correo público
              <input type="email" value={content.contact.public_email} maxLength={254} onChange={(event) => updateSection("contact", { public_email: event.target.value })} />
            </label>
            <label>Teléfono público
              <input value={content.contact.public_phone} maxLength={25} onChange={(event) => updateSection("contact", { public_phone: event.target.value })} />
            </label>
            <label>WhatsApp opcional
              <input value={content.contact.whatsapp_phone} maxLength={25} onChange={(event) => updateSection("contact", { whatsapp_phone: event.target.value })} />
            </label>
            <label>Ciudad
              <input value={content.contact.city} maxLength={100} onChange={(event) => updateSection("contact", { city: event.target.value })} />
            </label>
            <label className="content-editor-wide">Dirección
              <input value={content.contact.address_line} maxLength={200} onChange={(event) => updateSection("contact", { address_line: event.target.value })} />
            </label>
            <label className="content-editor-wide">Enlace HTTPS del mapa
              <input type="url" value={content.contact.map_url} maxLength={500} onChange={(event) => updateSection("contact", { map_url: event.target.value })} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>7. Redes sociales</legend>
          <div className="content-editor-grid">
            {(["instagram_url", "facebook_url", "tiktok_url"] as const).map((field) => (
              <label key={field}>{field.replace("_url", "").replace(/^\w/, (letter) => letter.toUpperCase())}
                <input type="url" value={content.social[field]} maxLength={500} onChange={(event) => updateSection("social", { [field]: event.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>8. SEO y pie de página</legend>
          <label>Título SEO
            <input value={content.seo.title} maxLength={70} onChange={(event) => updateSection("seo", { title: event.target.value })} />
          </label>
          <label>Descripción SEO
            <textarea value={content.seo.description} maxLength={160} onChange={(event) => updateSection("seo", { description: event.target.value })} />
          </label>
          <div className="content-editor-grid">
            <label>Razón social opcional
              <input value={content.footer.legal_name} maxLength={160} onChange={(event) => updateSection("footer", { legal_name: event.target.value })} />
            </label>
            <label>Texto de copyright opcional
              <input value={content.footer.copyright_text} maxLength={200} onChange={(event) => updateSection("footer", { copyright_text: event.target.value })} />
            </label>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
