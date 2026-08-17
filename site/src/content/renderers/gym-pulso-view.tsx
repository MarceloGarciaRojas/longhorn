import { createElement, type ReactNode } from "react";
import type {
  MediaRenderManifest,
  MediaRenderVariant,
  MediaVariantName,
} from "@/src/media/types";
import { validateGymV1Content } from "../gym-v1-schema";
import {
  GYM_PULSO_RENDERER_KEY,
  GYM_SCHEMA_KEY,
  GYM_SCHEMA_VERSION,
  type GymContentV1,
  type GymDay,
  type GymMediaUsage,
} from "../types";
import type {
  PulsoClassBrowserProps,
  PulsoClassFilterCategory,
} from "./gym-pulso-class-browser";

export const GYM_PULSO_RENDERER_CONTRACT = Object.freeze({
  industryKey: "gym" as const,
  rendererKey: GYM_PULSO_RENDERER_KEY,
  schemaKey: GYM_SCHEMA_KEY,
  schemaVersion: GYM_SCHEMA_VERSION,
});

export class GymPulsoCompatibilityError extends Error {
  constructor() {
    super("gym_pulso_incompatible_schema");
    this.name = "GymPulsoCompatibilityError";
  }
}

export type PulsoClassName = (token: string) => string;
export interface PulsoImageProps {
  src: string;
  width: number;
  height: number;
  sizes: string;
  alt: string;
  className: string;
  priority?: boolean;
}
export type PulsoImageComponent = (props: PulsoImageProps) => ReactNode;
export type PulsoClassBrowserComponent = (
  props: PulsoClassBrowserProps,
) => ReactNode;

const identityClassName: PulsoClassName = (token) => token;

const StaticPulsoClassBrowser: PulsoClassBrowserComponent = ({ items }) => (
  <div className="classGrid">{items}</div>
);

const IsolatedPulsoImage: PulsoImageComponent = ({ priority, ...props }) =>
  createElement("img", {
    ...props,
    loading: priority ? "eager" : "lazy",
  });

const DAY_LABELS: Record<GymDay, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

const INTENSITY_LABELS = {
  low: "Suave",
  moderate: "Media",
  high: "Alta",
} as const;

const PERIODICITY_LABELS = {
  monthly: "mensual",
  quarterly: "trimestral",
  semiannual: "semestral",
  annual: "anual",
  one_time: "pago único",
} as const;

const SOCIAL_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
} as const;

function joinClasses(
  className: PulsoClassName,
  ...tokens: Array<string | false | null | undefined>
): string {
  return tokens.filter((token): token is string => Boolean(token))
    .map(className)
    .join(" ");
}

function resolvedMedia(
  usage: GymMediaUsage | null,
  media: MediaRenderManifest,
  variant: MediaVariantName,
): MediaRenderVariant | null {
  if (!usage) return null;
  const resolved = media[usage.assetId]?.[variant];
  const privatePath = `/api/media/private/${usage.assetId}/${variant}`;
  const adminPrivatePath = `${privatePath}?audience=admin`;
  const publicPrefix = `/media/${usage.assetId}/${variant}/`;
  const publicChecksum = resolved?.url.startsWith(publicPrefix)
    ? resolved.url.slice(publicPrefix.length)
    : "";
  const safePath = resolved?.url === privatePath ||
    resolved?.url === adminPrivatePath ||
    /^[0-9a-f]{64}$/.test(publicChecksum);
  if (
    !resolved ||
    !safePath ||
    !Number.isSafeInteger(resolved.width) ||
    !Number.isSafeInteger(resolved.height) ||
    resolved.width <= 0 ||
    resolved.height <= 0
  ) {
    return null;
  }
  return resolved;
}

function PulsoImage({
  usage,
  media,
  variant,
  className,
  sizes,
  ImageComponent,
  priority = false,
}: {
  usage: GymMediaUsage;
  media: MediaRenderManifest;
  variant: MediaVariantName;
  className: string;
  sizes: string;
  ImageComponent: PulsoImageComponent;
  priority?: boolean;
}): ReactNode {
  const resolved = resolvedMedia(usage, media, variant);
  if (!resolved) return null;
  return (
    <ImageComponent
      src={resolved.url}
      width={resolved.width}
      height={resolved.height}
      sizes={sizes}
      alt={usage.decorative ? "" : usage.altText}
      className={className}
      priority={priority}
    />
  );
}

function requestHref(content: GymContentV1): string {
  if (content.hero.primary_cta_channel === "phone") {
    const phone = content.contact.public_phone.replace(/[^\d+]/g, "");
    return phone ? `tel:${phone}` : "#contacto";
  }
  if (content.hero.primary_cta_channel === "whatsapp") {
    const phone = content.contact.whatsapp_phone.replace(/\D/g, "");
    return phone ? `https://wa.me/${phone}` : "#contacto";
  }
  if (content.hero.primary_cta_channel === "email") {
    return content.contact.public_email
      ? `mailto:${content.contact.public_email}`
      : "#contacto";
  }
  return "#contacto";
}

function externalHref(href: string): boolean {
  return href.startsWith("https://");
}

function appearanceClasses(
  content: GymContentV1,
  className: PulsoClassName,
): string {
  const { appearance } = content;
  const variant = {
    volt: "variantVolt",
    studio: "variantStudio",
    forge: "variantForge",
  }[appearance.variant];
  const hero = {
    left: "heroLeft",
    right: "heroRight",
    stacked: "heroStacked",
  }[appearance.hero_layout];
  const method = {
    left: "methodLeft",
    right: "methodRight",
    stacked: "methodStacked",
  }[appearance.method_layout];
  const title = {
    compact: "titleCompact",
    large: "titleLarge",
    impact: "titleImpact",
  }[appearance.title_scale];
  const density = {
    compact: "mediaCompact",
    balanced: "mediaBalanced",
    immersive: "mediaImmersive",
  }[appearance.media_density];
  const columns = {
    2: "columns2",
    3: "columns3",
    4: "columns4",
  }[appearance.class_columns];
  const spacing = {
    compact: "spacingCompact",
    spacious: "spacingSpacious",
    cinematic: "spacingCinematic",
  }[appearance.spacing];
  return joinClasses(
    className,
    "root",
    variant,
    hero,
    method,
    title,
    density,
    columns,
    spacing,
  );
}

function methodAttributes(content: GymContentV1): string[] {
  const values = [
    ...content.class_categories.map((category) => category.name),
    ...content.method.pillars.map((pillar) => pillar.title),
  ];
  return [...new Set(values)].slice(0, 4);
}

export function GymPulsoView({
  content,
  media,
  preview = false,
  className,
  ImageComponent,
  ClassBrowserComponent = StaticPulsoClassBrowser,
}: {
  content: GymContentV1;
  media: MediaRenderManifest;
  preview?: boolean;
  className: PulsoClassName;
  ImageComponent: PulsoImageComponent;
  ClassBrowserComponent?: PulsoClassBrowserComponent;
}): ReactNode {
  const visibleClasses = content.classes.filter((entry) => entry.visible);
  const visibleTrainers = content.trainers.filter((entry) => entry.visible);
  const visiblePlans = content.plans.filter((entry) => entry.visible);
  const visibleFacilities = content.facilities.filter((entry) => entry.visible);
  const visibleGallery = content.gallery.filter((entry) => entry.visible);
  const classById = new Map(visibleClasses.map((entry) => [entry.id, entry]));
  const visibleSchedule = content.schedule.filter(
    (entry) => entry.visible && classById.has(entry.class_id),
  );
  const trainerById = new Map(visibleTrainers.map((entry) => [entry.id, entry]));
  const heroMedia = resolvedMedia(content.hero.media, media, "hero");
  const attributes = methodAttributes(content);
  const primaryHref = requestHref(content);
  const primaryExternal = externalHref(primaryHref);
  const firstOpenHours = content.hours.find((entry) => entry.is_open);
  const visibleSocialLinks = content.contact.social.filter(
    (entry) => entry.visible && Boolean(entry.url),
  );
  const visibleCategoryIds = new Set(
    visibleClasses.map((entry) => entry.category_id),
  );
  const filterCategories: PulsoClassFilterCategory[] = content.class_categories
    .filter((entry) => visibleCategoryIds.has(entry.id))
    .map((entry) => ({ id: entry.id, name: entry.name }));
  const classCards = visibleClasses.map((entry, index) => (
    <article className={className("classCard")} key={entry.id}>
      {entry.media ? (
        <PulsoImage
          usage={entry.media}
          media={media}
          variant="card"
          className={className("cardImage")}
          sizes="(max-width: 699px) 100vw, (max-width: 1099px) 50vw, 33vw"
          ImageComponent={ImageComponent}
        />
      ) : null}
      <div className={className("cardBody")}>
        <span>
          {entry.duration_minutes} min · Intensidad {INTENSITY_LABELS[entry.intensity]}
        </span>
        <h3>{entry.name}</h3>
        <p>{entry.description}</p>
        {entry.trial_cta_visible ? (
          <a
            href={primaryHref}
            {...(primaryExternal
              ? { target: "_blank", rel: "noreferrer" }
              : {})}
          >
            Solicitar clase de prueba
          </a>
        ) : null}
      </div>
      <strong aria-hidden="true">{String(index + 1).padStart(2, "0")}</strong>
    </article>
  ));

  return (
    <main className={appearanceClasses(content, className)}>
      <a className={className("skipLink")} href="#contenido">
        Saltar al contenido
      </a>

      {preview ? (
        <div className={className("previewBanner")} role="status">
          Vista previa privada
        </div>
      ) : null}

      <header className={className("header")}>
        <a className={className("brand")} href="#contenido" aria-label={`${content.identity.business_name}, inicio`}>
          {content.identity.logo ? (
            <PulsoImage
              usage={content.identity.logo}
              media={media}
              variant="thumbnail"
              className={className("brandLogo")}
              sizes="48px"
              ImageComponent={ImageComponent}
            />
          ) : (
            <span className={className("brandMark")} aria-hidden="true">
              {content.identity.business_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span>
            <strong>{content.identity.business_name}</strong>
            <small>{content.identity.descriptor}</small>
          </span>
        </a>
        <nav className={className("nav")} aria-label="Navegación principal">
          <a href="#metodo">Método</a>
          {visibleClasses.length ? <a href="#clases">Clases</a> : null}
          {visiblePlans.length ? <a href="#planes">Planes</a> : null}
          <a className={className("navCta")} href={primaryHref} {...(primaryExternal ? { target: "_blank", rel: "noreferrer" } : {})}>
            {content.hero.primary_cta_label}
          </a>
        </nav>
        <details className={className("mobileMenu")}>
          <summary>Menú</summary>
          <nav aria-label="Navegación móvil">
            <a href="#metodo">Método</a>
            {visibleClasses.length ? <a href="#clases">Clases</a> : null}
            {visiblePlans.length ? <a href="#planes">Planes</a> : null}
            <a
              href={primaryHref}
              {...(primaryExternal
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              {content.hero.primary_cta_label}
            </a>
          </nav>
        </details>
      </header>

      <section id="contenido" className={className("hero")} aria-labelledby="pulso-hero-title">
        <div className={className("heroCopy")}>
          <p className={className("eyebrow")}>{content.identity.descriptor}</p>
          <h1 id="pulso-hero-title">{content.hero.headline}</h1>
          <p className={className("lead")}>{content.hero.subheadline}</p>
          <div className={className("heroActions")}>
            <a className={joinClasses(className, "button", "buttonPrimary")} href={primaryHref} {...(primaryExternal ? { target: "_blank", rel: "noreferrer" } : {})}>
              {content.hero.primary_cta_label}<span aria-hidden="true">↗</span>
            </a>
            {visibleClasses.length ? (
              <a className={joinClasses(className, "button", "buttonGhost")} href="#clases">
                Ver clases
              </a>
            ) : null}
          </div>
          {firstOpenHours ? (
            <p className={className("openNote")}>
              <span aria-hidden="true" />
              Horario informado · {firstOpenHours.opening_time}—{firstOpenHours.closing_time}
            </p>
          ) : null}
        </div>
        <div className={className("heroStage")} aria-label={heroMedia ? undefined : "Composición visual del gimnasio"}>
          {heroMedia && content.hero.media ? (
            <PulsoImage
              usage={content.hero.media}
              media={media}
              variant="hero"
              className={className("heroImage")}
              sizes="(max-width: 799px) 100vw, 55vw"
              ImageComponent={ImageComponent}
              priority
            />
          ) : (
            <>
              <span className={joinClasses(className, "orbit", "orbitOne")} aria-hidden="true" />
              <span className={joinClasses(className, "orbit", "orbitTwo")} aria-hidden="true" />
              <strong className={className("heroNumber")} aria-hidden="true">01</strong>
            </>
          )}
        </div>
      </section>

      {attributes.length ? (
        <aside className={className("attributeStrip")} aria-label="Atributos del gimnasio">
          {attributes.map((attribute, index) => (
            <span key={attribute}>
              {attribute}{index < attributes.length - 1 ? <b aria-hidden="true">+</b> : null}
            </span>
          ))}
        </aside>
      ) : null}

      <section id="metodo" className={joinClasses(className, "section", "method")} aria-labelledby="pulso-method-title">
        <div className={className("sectionIntro")}>
          <p className={className("eyebrow")}>Nuestro método</p>
          <h2 id="pulso-method-title">{content.method.title}</h2>
        </div>
        <div className={className("methodBody")}>
          <p>{content.method.description}</p>
          {content.method.pillars.length ? (
            <ol className={className("pillars")}>
              {content.method.pillars.map((pillar, index) => (
                <li key={pillar.id}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div><h3>{pillar.title}</h3><p>{pillar.description}</p></div>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>

      {visibleClasses.length ? (
        <section id="clases" className={joinClasses(className, "section", "classes")} aria-labelledby="pulso-classes-title">
          <div className={className("sectionHeading")}>
            <div><p className={className("eyebrow")}>Encuentra tu ritmo</p><h2 id="pulso-classes-title">Clases para avanzar</h2></div>
            {visibleSchedule.length ? <a href="#programacion">Ver programación <span aria-hidden="true">↗</span></a> : null}
          </div>
          <ClassBrowserComponent
            categories={filterCategories}
            itemCategoryIds={visibleClasses.map((entry) => entry.category_id)}
            items={classCards}
          />
        </section>
      ) : null}

      {visibleSchedule.length ? (
        <section id="programacion" className={joinClasses(className, "section", "schedule")} aria-labelledby="pulso-schedule-title">
          <div className={className("sectionIntro")}>
            <p className={className("eyebrow")}>Programación informativa</p>
            <h2 id="pulso-schedule-title">Organiza tu semana</h2>
            <p>Los horarios son referenciales. Solicita confirmación al equipo antes de asistir.</p>
          </div>
          <div className={className("scheduleList")}>
            {visibleSchedule.map((entry) => {
              const classEntry = classById.get(entry.class_id)!;
              const trainer = entry.trainer_id ? trainerById.get(entry.trainer_id) : null;
              return (
                <article key={entry.id}>
                  <div><span>{DAY_LABELS[entry.day]}</span><strong>{entry.start_time}</strong></div>
                  <div><small>{entry.duration_minutes} min · {INTENSITY_LABELS[classEntry.intensity]}</small><h3>{classEntry.name}</h3>{trainer ? <p>Entrena con {trainer.name}</p> : null}</div>
                  {entry.informational_capacity ? <span>Capacidad informativa: {entry.informational_capacity}</span> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {visibleTrainers.length ? (
        <section className={joinClasses(className, "section", "trainers")} aria-labelledby="pulso-trainers-title">
          <div className={className("sectionHeading")}><div><p className={className("eyebrow")}>Equipo</p><h2 id="pulso-trainers-title">Entrena acompañado</h2></div></div>
          <div className={className("trainerGrid")}>
            {visibleTrainers.map((trainer) => (
              <article key={trainer.id}>
                {trainer.media ? (
                  <PulsoImage usage={trainer.media} media={media} variant="card" className={className("trainerImage")} sizes="(max-width: 699px) 100vw, 33vw" ImageComponent={ImageComponent} />
                ) : <span className={className("trainerInitial")} aria-hidden="true">{trainer.name.slice(0, 1).toUpperCase()}</span>}
                <h3>{trainer.name}</h3><strong>{trainer.specialty}</strong><p>{trainer.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {visibleFacilities.length || visibleGallery.length ? (
        <section className={joinClasses(className, "section", "facilities")} aria-labelledby="pulso-facilities-title">
          <div className={className("sectionIntro")}><p className={className("eyebrow")}>El espacio</p><h2 id="pulso-facilities-title">Preparado para moverte</h2></div>
          <div className={className("facilityGrid")}>
            {visibleFacilities.map((facility) => (
              <article key={facility.id}>
                {facility.media ? <PulsoImage usage={facility.media} media={media} variant="card" className={className("facilityImage")} sizes="(max-width: 699px) 100vw, 50vw" ImageComponent={ImageComponent} /> : null}
                <div><h3>{facility.title}</h3><p>{facility.description}</p></div>
              </article>
            ))}
            {visibleGallery.map((item) => (
              <figure key={item.id}>
                <PulsoImage usage={item.media} media={media} variant="card" className={className("galleryImage")} sizes="(max-width: 699px) 100vw, 33vw" ImageComponent={ImageComponent} />
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {visiblePlans.length ? (
        <section id="planes" className={joinClasses(className, "section", "plans")} aria-labelledby="pulso-plans-title">
          <p className={joinClasses(className, "eyebrow", "eyebrowLight")}>Planes informativos</p>
          <h2 id="pulso-plans-title">Elige cómo comenzar</h2>
          <div className={className("planGrid")}>
            {visiblePlans.map((plan) => (
              <article className={plan.featured ? className("featuredPlan") : undefined} key={plan.id}>
                {plan.featured ? <span className={className("badge")}>Destacado</span> : null}
                <h3>{plan.name}</h3>
                {plan.price_text ? <strong>{plan.price_text}<small>{PERIODICITY_LABELS[plan.periodicity]}</small></strong> : null}
                {plan.benefits.length ? <ul>{plan.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul> : null}
                <a
                  className={className("planCta")}
                  href={primaryHref}
                  {...(primaryExternal
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  Solicitar información <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section id="contacto" className={joinClasses(className, "section", "visit")} aria-labelledby="pulso-visit-title">
        <div>
          <p className={joinClasses(className, "eyebrow", "eyebrowLight")}>Ven a conocernos</p>
          <h2 id="pulso-visit-title">Tu próximo paso</h2>
          <address>{content.location.address_line}<br />{content.location.city}</address>
          {content.location.directions ? <p>{content.location.directions}</p> : null}
          {content.location.map_url ? <a href={content.location.map_url} target="_blank" rel="noreferrer">Cómo llegar <span aria-hidden="true">↗</span></a> : null}
          <div className={className("contactLinks")}>
            {content.contact.public_phone ? <a href={`tel:${content.contact.public_phone.replace(/[^\d+]/g, "")}`}>{content.contact.public_phone}</a> : null}
            {content.contact.public_email ? <a href={`mailto:${content.contact.public_email}`}>{content.contact.public_email}</a> : null}
            {content.contact.whatsapp_phone ? <a href={`https://wa.me/${content.contact.whatsapp_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a> : null}
          </div>
        </div>
        {content.hours.length ? (
          <div className={className("hours")}><h3>Horario del gimnasio</h3><dl>{content.hours.map((entry) => <div key={entry.day}><dt>{DAY_LABELS[entry.day]}</dt><dd>{entry.is_open ? `${entry.opening_time}—${entry.closing_time}` : "Cerrado"}{entry.note ? <small>{entry.note}</small> : null}</dd></div>)}</dl><a className={joinClasses(className, "button", "buttonPrimary")} href={primaryHref} {...(primaryExternal ? { target: "_blank", rel: "noreferrer" } : {})}>{content.hero.primary_cta_label}</a></div>
        ) : null}
      </section>

      {visibleSocialLinks.length ? (
        <aside className={className("social")} aria-label="Redes sociales">
          {visibleSocialLinks.map((entry) => <a href={entry.url} target="_blank" rel="noreferrer" key={entry.id}>{SOCIAL_LABELS[entry.network]}</a>)}
        </aside>
      ) : null}

      <footer className={className("footer")}>
        <div><strong>{content.identity.business_name}</strong><span>{content.identity.descriptor}</span></div>
        <p>Información pública proporcionada por el gimnasio.</p>
        {content.contact.public_email ? <a href={`mailto:${content.contact.public_email}`}>{content.contact.public_email}</a> : null}
      </footer>
    </main>
  );
}

export function renderGymPulsoIsolated(input: {
  industryKey: string;
  schemaKey: string;
  schemaVersion: number;
  content: unknown;
  media?: MediaRenderManifest;
  preview?: boolean;
  validationMode?: "draft" | "publication";
  className?: PulsoClassName;
}): ReactNode {
  if (
    input.industryKey !== GYM_PULSO_RENDERER_CONTRACT.industryKey ||
    input.schemaKey !== GYM_PULSO_RENDERER_CONTRACT.schemaKey ||
    input.schemaVersion !== GYM_PULSO_RENDERER_CONTRACT.schemaVersion
  ) {
    throw new GymPulsoCompatibilityError();
  }
  return (
    <GymPulsoView
      content={validateGymV1Content(input.content, input.validationMode ?? "publication")}
      media={input.media ?? {}}
      preview={input.preview === true}
      className={input.className ?? identityClassName}
      ImageComponent={IsolatedPulsoImage}
    />
  );
}
