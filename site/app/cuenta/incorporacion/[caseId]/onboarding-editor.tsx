"use client";

import { useState } from "react";
import type { RestaurantOnboardingAnswersV1 } from "@/src/onboarding/types";

type ReadyAsset = {
  id: string;
  displayName: string;
  defaultAltText: string;
};

const dayLabels: Record<string, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

export function OnboardingEditor({
  caseId,
  revision,
  idempotencyKey,
  initialAnswers,
  assets,
  disabled,
}: {
  caseId: string;
  revision: number;
  idempotencyKey: string;
  initialAnswers: RestaurantOnboardingAnswersV1;
  assets: ReadyAsset[];
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState(initialAnswers);

  function addCategory() {
    setAnswers((current) => ({
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
    }));
  }

  function addItem() {
    setAnswers((current) => {
      const category = current.menu.categories[0];
      if (!category) return current;
      return {
        ...current,
        menu: {
          ...current.menu,
          items: [
            ...current.menu.items,
            {
              id: crypto.randomUUID(),
              categoryId: category.id,
              name: "",
              description: "",
              priceText: "",
              availability: true,
              order: current.menu.items.length,
              media: null,
            },
          ],
        },
      };
    });
  }

  return (
    <form
      className="client-profile-form onboarding-editor"
      action="/api/onboarding/client"
      method="post"
    >
      <input type="hidden" name="action" value="answers_save" />
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      <fieldset disabled={disabled}>
        <legend>Identidad y objetivo</legend>
        <div className="client-form-grid">
          <label>
            Nombre comercial
            <input
              value={answers.company.businessName}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  company: { ...current.company, businessName: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Frase principal
            <input
              value={answers.company.tagline}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  company: { ...current.company, tagline: event.target.value },
                }))
              }
            />
          </label>
          <label className="client-form-wide">
            Descripción breve
            <textarea
              value={answers.company.shortDescription}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  company: {
                    ...current.company,
                    shortDescription: event.target.value,
                  },
                }))
              }
            />
          </label>
          <label className="client-form-wide">
            Objetivo principal
            <textarea
              value={answers.objectives.primaryGoal}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  objectives: {
                    ...current.objectives,
                    primaryGoal: event.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Público objetivo
            <input
              value={answers.objectives.targetAudience}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  objectives: {
                    ...current.objectives,
                    targetAudience: event.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Tono
            <input
              value={answers.objectives.desiredTone}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  objectives: {
                    ...current.objectives,
                    desiredTone: event.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Texto del botón principal
            <input
              value={answers.objectives.primaryCallToAction.label}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  objectives: {
                    ...current.objectives,
                    primaryCallToAction: {
                      ...current.objectives.primaryCallToAction,
                      label: event.target.value,
                    },
                  },
                }))
              }
            />
          </label>
          <label>
            Acción del botón
            <select
              value={answers.objectives.primaryCallToAction.type}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  objectives: {
                    ...current.objectives,
                    primaryCallToAction: {
                      ...current.objectives.primaryCallToAction,
                      type: event.target.value as "menu" | "phone" | "whatsapp" | "map",
                    },
                  },
                }))
              }
            >
              <option value="menu">Ver carta</option>
              <option value="phone">Llamar</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="map">Ver mapa</option>
            </select>
          </label>
          <label className="client-form-wide">
            Destino del botón
            <input
              value={answers.objectives.primaryCallToAction.target}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  objectives: {
                    ...current.objectives,
                    primaryCallToAction: {
                      ...current.objectives.primaryCallToAction,
                      target: event.target.value,
                    },
                  },
                }))
              }
            />
          </label>
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Presentación y contacto</legend>
        <div className="client-form-grid">
          <label>
            Título de historia
            <input
              value={answers.about.title}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  about: { ...current.about, title: event.target.value },
                }))
              }
            />
          </label>
          <label className="client-form-wide">
            Historia
            <textarea
              value={answers.about.description}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  about: { ...current.about, description: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Correo público
            <input
              type="email"
              value={answers.contact.publicEmail}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  contact: { ...current.contact, publicEmail: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Teléfono público
            <input
              value={answers.contact.publicPhone}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  contact: { ...current.contact, publicPhone: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Dirección
            <input
              value={answers.contact.address}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  contact: { ...current.contact, address: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Ciudad
            <input
              value={answers.contact.city}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  contact: { ...current.contact, city: event.target.value },
                }))
              }
            />
          </label>
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Carta</legend>
        <label>
          Título de la carta
          <input
            value={answers.menu.sectionTitle}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                menu: { ...current.menu, sectionTitle: event.target.value },
              }))
            }
          />
        </label>
        <div className="onboarding-repeat-list">
          {answers.menu.categories.map((category, index) => (
            <label key={category.id}>
              Categoría {index + 1}
              <input
                value={category.name}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    menu: {
                      ...current.menu,
                      categories: current.menu.categories.map((entry) =>
                        entry.id === category.id
                          ? { ...entry, name: event.target.value }
                          : entry,
                      ),
                    },
                  }))
                }
              />
            </label>
          ))}
          {answers.menu.items.map((item, index) => (
            <div key={item.id} className="client-form-grid onboarding-menu-item">
              <label>
                Plato {index + 1}
                <input
                  value={item.name}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      menu: {
                        ...current.menu,
                        items: current.menu.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, name: event.target.value }
                            : entry,
                        ),
                      },
                    }))
                  }
                />
              </label>
              <label>
                Precio visible
                <input
                  value={item.priceText}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      menu: {
                        ...current.menu,
                        items: current.menu.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, priceText: event.target.value }
                            : entry,
                        ),
                      },
                    }))
                  }
                />
              </label>
              <label className="client-form-wide">
                Descripción
                <textarea
                  value={item.description}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      menu: {
                        ...current.menu,
                        items: current.menu.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, description: event.target.value }
                            : entry,
                        ),
                      },
                    }))
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <div className="client-card-actions">
          <button type="button" className="client-button secondary" onClick={addCategory}>
            Agregar categoría
          </button>
          <button
            type="button"
            className="client-button secondary"
            onClick={addItem}
            disabled={!answers.menu.categories.length}
          >
            Agregar plato
          </button>
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Horarios</legend>
        <div className="onboarding-hours-grid">
          {answers.hours.map((entry) => (
            <div key={entry.day}>
              <label>
                <input
                  type="checkbox"
                  checked={entry.isOpen}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      hours: current.hours.map((day) =>
                        day.day === entry.day
                          ? {
                              ...day,
                              isOpen: event.target.checked,
                              openingTime: event.target.checked ? day.openingTime : "",
                              closingTime: event.target.checked ? day.closingTime : "",
                            }
                          : day,
                      ),
                    }))
                  }
                />{" "}
                {dayLabels[entry.day]}
              </label>
              {entry.isOpen ? (
                <>
                  <input
                    aria-label={`Apertura ${dayLabels[entry.day]}`}
                    type="time"
                    value={entry.openingTime}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        hours: current.hours.map((day) =>
                          day.day === entry.day
                            ? { ...day, openingTime: event.target.value }
                            : day,
                        ),
                      }))
                    }
                  />
                  <input
                    aria-label={`Cierre ${dayLabels[entry.day]}`}
                    type="time"
                    value={entry.closingTime}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        hours: current.hours.map((day) =>
                          day.day === entry.day
                            ? { ...day, closingTime: event.target.value }
                            : day,
                        ),
                      }))
                    }
                  />
                </>
              ) : null}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Imagen principal y SEO</legend>
        <div className="client-form-grid">
          <label>
            Imagen principal
            <select
              value={answers.media.hero?.assetId ?? ""}
              onChange={(event) => {
                const asset = assets.find((entry) => entry.id === event.target.value);
                setAnswers((current) => ({
                  ...current,
                  media: {
                    hero: asset
                      ? {
                          assetId: asset.id,
                          altText: asset.defaultAltText || asset.displayName,
                          decorative: false,
                        }
                      : null,
                  },
                }));
              }}
            >
              <option value="">Sin imagen</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Título SEO
            <input
              value={answers.seo.title}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  seo: { ...current.seo, title: event.target.value },
                }))
              }
            />
          </label>
          <label className="client-form-wide">
            Descripción SEO
            <textarea
              value={answers.seo.description}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  seo: { ...current.seo, description: event.target.value },
                }))
              }
            />
          </label>
        </div>
      </fieldset>

      {!disabled ? (
        <div className="client-card-actions">
          <button
            className="client-button secondary"
            type="submit"
            name="submit_for_review"
            value="false"
          >
            Guardar borrador
          </button>
          <button
            className="client-button"
            type="submit"
            name="submit_for_review"
            value="true"
          >
            Enviar a revisión
          </button>
        </div>
      ) : null}
    </form>
  );
}
