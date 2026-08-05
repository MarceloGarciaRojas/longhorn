import { createElement, type ReactNode } from "react";
import type {
  MediaRenderManifest,
  MediaRenderVariant,
  MediaVariantName,
} from "@/src/media/types";
import { validateRestaurantV2Content } from "../restaurant-v2-schema";
import {
  RESTAURANT_V2_SCHEMA_KEY,
  RESTAURANT_V2_SCHEMA_VERSION,
  type RestaurantContentV2,
  type RestaurantDay,
  type RestaurantMediaUsage,
} from "../types";

export const RESTAURANT_EDITORIAL_RENDERER_CONTRACT = Object.freeze({
  rendererKey: "restaurant-editorial-v1",
  schemaKey: RESTAURANT_V2_SCHEMA_KEY,
  schemaVersion: RESTAURANT_V2_SCHEMA_VERSION,
});

export class RestaurantEditorialCompatibilityError extends Error {
  constructor() {
    super("restaurant_editorial_incompatible_schema");
    this.name = "RestaurantEditorialCompatibilityError";
  }
}

export type EditorialClassName = (token: string) => string;
export interface EditorialImageProps {
  src: string;
  width: number;
  height: number;
  sizes: string;
  alt: string;
  className: string;
  priority?: boolean;
}
export type EditorialImageComponent = (
  props: EditorialImageProps,
) => ReactNode;

const identityClassName: EditorialClassName = (token) => token;

const IsolatedEditorialImage: EditorialImageComponent = ({
  priority,
  ...props
}) => createElement("img", {
  ...props,
  loading: priority ? "eager" : "lazy",
});

const DAYS: Record<RestaurantDay, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

function joinClasses(
  className: EditorialClassName,
  ...tokens: Array<string | false | null | undefined>
): string {
  return tokens.filter((token): token is string => Boolean(token))
    .map(className)
    .join(" ");
}

function ctaHref(content: RestaurantContentV2): string {
  const { primary_cta_type: type, primary_cta_target: target } = content.hero;
  if (type === "menu") return "#menu";
  if (type === "phone") return `tel:${target.replace(/[^\d+]/g, "")}`;
  if (type === "whatsapp") {
    return `https://wa.me/${target.replace(/\D/g, "")}`;
  }
  return target;
}

function externalLink(href: string): boolean {
  return href.startsWith("https://");
}

function resolvedMedia(
  usage: RestaurantMediaUsage | null,
  media: MediaRenderManifest,
  variant: MediaVariantName,
): MediaRenderVariant | null {
  if (!usage) return null;
  const resolved = media[usage.assetId]?.[variant];
  const privatePath = `/api/media/private/${usage.assetId}/${variant}`;
  const publicPrefix = `/media/${usage.assetId}/${variant}/`;
  const publicChecksum = resolved?.url.startsWith(publicPrefix)
    ? resolved.url.slice(publicPrefix.length)
    : "";
  const safePath = resolved?.url === privatePath ||
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

function EditorialImage({
  usage,
  media,
  variant,
  className,
  sizes,
  ImageComponent,
  priority = false,
  forceDecorative = false,
}: {
  usage: RestaurantMediaUsage;
  media: MediaRenderManifest;
  variant: MediaVariantName;
  className: string;
  sizes: string;
  ImageComponent: EditorialImageComponent;
  priority?: boolean;
  forceDecorative?: boolean;
}): ReactNode {
  const resolved = resolvedMedia(usage, media, variant);
  if (!resolved) return null;
  return (
    <ImageComponent
      className={className}
      src={resolved.url}
      width={resolved.width}
      height={resolved.height}
      sizes={sizes}
      alt={forceDecorative || usage.decorative ? "" : usage.altText}
      priority={priority}
    />
  );
}

function socialLinks(content: RestaurantContentV2) {
  return [
    ["Instagram", content.social.instagram_url],
    ["Facebook", content.social.facebook_url],
    ["TikTok", content.social.tiktok_url],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

export function RestaurantEditorialView({
  content,
  media,
  preview = false,
  className,
  ImageComponent,
}: {
  content: RestaurantContentV2;
  media: MediaRenderManifest;
  preview?: boolean;
  className: EditorialClassName;
  ImageComponent: EditorialImageComponent;
}): ReactNode {
  const availableItems = content.menu.items.filter((item) => item.availability);
  const categories = content.menu.categories.filter((category) =>
    availableItems.some((item) => item.category_id === category.id),
  );
  const heroMedia = resolvedMedia(content.hero.media, media, "hero");
  const primaryHref = ctaHref(content);
  const primaryExternal = externalLink(primaryHref);
  const socials = socialLinks(content);
  const hasStory = Boolean(content.about.title || content.about.description);
  const hasMenu = Boolean(content.menu.section_title || categories.length);
  const hasVisit = Boolean(
    content.contact.address_line ||
      content.contact.city ||
      content.contact.public_phone ||
      content.contact.public_email ||
      content.hours.length,
  );
  const gallery = availableItems.reduce<Array<{
    usage: RestaurantMediaUsage;
    variant: MediaRenderVariant;
  }>>((items, item) => {
    if (!item.media || items.some(({ usage }) => usage.assetId === item.media?.assetId)) {
      return items;
    }
    const variant = resolvedMedia(item.media, media, "card");
    if (variant && items.length < 3) items.push({ usage: item.media, variant });
    return items;
  }, []);
  const showGallery = gallery.length >= 2;

  return (
    <main
      className={joinClasses(
        className,
        "site",
        !heroMedia && "siteWithoutHeroMedia",
      )}
    >
      <a className={className("skip")} href="#contenido-editorial">
        Saltar al contenido
      </a>

      {preview ? (
        <div className={className("preview")} role="status">
          Vista previa privada · este contenido aún no está publicado
        </div>
      ) : null}

      <header className={className("header")}>
        <a
          className={className("brand")}
          href="#inicio"
          aria-label={`${content.identity.business_name}, inicio`}
        >
          {content.identity.business_name}
        </a>
        <nav className={className("navigation")} aria-label="Navegación principal">
          {hasStory ? <a href="#historia">Historia</a> : null}
          {hasMenu ? <a href="#menu">Carta</a> : null}
          {hasVisit ? <a href="#visita">Visita</a> : null}
          {content.hero.primary_cta_label && primaryHref ? (
            <a
              className={className("headerCta")}
              href={primaryHref}
              {...(primaryExternal
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              {content.hero.primary_cta_label}
            </a>
          ) : null}
        </nav>
      </header>

      <section id="inicio" className={className("hero")}>
        <div id="contenido-editorial" className={className("heroCopy")}>
          {content.identity.short_description ? (
            <p className={className("eyebrow")}>
              {content.identity.short_description}
            </p>
          ) : null}
          {content.hero.headline ? <h1>{content.hero.headline}</h1> : null}
          {content.hero.subheadline ? (
            <p className={className("heroLead")}>{content.hero.subheadline}</p>
          ) : null}
          {content.hero.primary_cta_label && primaryHref ? (
            <a
              className={className("primaryCta")}
              href={primaryHref}
              {...(primaryExternal
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              {content.hero.primary_cta_label}
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
        {content.hero.media && heroMedia ? (
          <figure className={className("heroFigure")}>
            <EditorialImage
              usage={content.hero.media}
              media={media}
              variant="hero"
              className={className("heroImage")}
              sizes="(max-width: 899px) 100vw, 58vw"
              ImageComponent={ImageComponent}
              priority
            />
            {content.identity.tagline ? (
              <figcaption>{content.identity.tagline}</figcaption>
            ) : null}
          </figure>
        ) : null}
      </section>

      {hasStory ? (
        <section
          id="historia"
          className={className("story")}
          {...(content.about.title
            ? { "aria-labelledby": "editorial-story-title" }
            : { "aria-label": "Historia" })}
        >
          <div className={className("storyIndex")} aria-hidden="true">
            01
          </div>
          <div className={className("storyCopy")}>
            {content.identity.tagline ? (
              <p className={className("eyebrow")}>{content.identity.tagline}</p>
            ) : null}
            {content.about.title ? (
              <h2 id="editorial-story-title">{content.about.title}</h2>
            ) : null}
            {content.about.description ? <p>{content.about.description}</p> : null}
          </div>
          {content.identity.tagline ? (
            <blockquote className={className("storyQuote")}>
              {content.identity.tagline}
            </blockquote>
          ) : null}
        </section>
      ) : null}

      {hasMenu ? (
        <section
          id="menu"
          className={className("menu")}
          {...(content.menu.section_title
            ? { "aria-labelledby": "editorial-menu-title" }
            : { "aria-label": "Carta" })}
        >
          <header className={className("menuIntro")}>
            <div>
              <span className={className("sectionNumber")} aria-hidden="true">
                02
              </span>
              {content.menu.section_title ? (
                <h2 id="editorial-menu-title">{content.menu.section_title}</h2>
              ) : null}
            </div>
            {content.identity.short_description ? (
              <p>{content.identity.short_description}</p>
            ) : null}
          </header>

          {categories.length ? (
            <div className={className("categoryList")}>
              {categories.map((category, categoryIndex) => {
                const categoryItems = availableItems.filter(
                  (item) => item.category_id === category.id,
                );
                const categoryHeadingId = `editorial-category-${categoryIndex + 1}`;
                return (
                  <section
                    className={className("category")}
                    key={category.id}
                    aria-labelledby={categoryHeadingId}
                  >
                    <header className={className("categoryHeader")}>
                      <span aria-hidden="true">
                        {String(categoryIndex + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 id={categoryHeadingId}>{category.name}</h3>
                        {category.description ? (
                          <p>{category.description}</p>
                        ) : null}
                      </div>
                    </header>
                    <div className={className("dishList")}>
                      {categoryItems.map((item) => {
                        const itemMedia = resolvedMedia(item.media, media, "card");
                        return (
                          <article className={className("dish")} key={item.id}>
                            {item.media && itemMedia ? (
                              <EditorialImage
                                usage={item.media}
                                media={media}
                                variant="card"
                                className={className("dishImage")}
                                sizes="(max-width: 599px) 100vw, (max-width: 899px) 42vw, 18vw"
                                ImageComponent={ImageComponent}
                              />
                            ) : null}
                            <div className={className("dishCopy")}>
                              <h4>{item.name}</h4>
                              <p>{item.description}</p>
                            </div>
                            {item.price_text ? (
                              <strong className={className("dishPrice")}>
                                {item.price_text}
                              </strong>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <p className={className("emptyMenu")} role="status">
              Carta sin productos disponibles.
            </p>
          )}
        </section>
      ) : null}

      {showGallery ? (
        <section
          className={className("gallery")}
          aria-labelledby="editorial-gallery-title"
        >
          <h2 id="editorial-gallery-title" className={className("visuallyHidden")}>
            Imágenes de la carta
          </h2>
          {gallery.map(({ usage }, index) => (
            <figure
              className={joinClasses(
                className,
                "galleryItem",
                index === 0 && "galleryItem1",
                index === 2 && "galleryItem3",
              )}
              key={usage.assetId}
            >
              <EditorialImage
                usage={usage}
                media={media}
                variant="card"
                className={className("galleryImage")}
                sizes="(max-width: 599px) 100vw, (max-width: 899px) 50vw, 33vw"
                ImageComponent={ImageComponent}
                forceDecorative
              />
            </figure>
          ))}
        </section>
      ) : null}

      {hasVisit ? (
        <section
          id="visita"
          className={className("visit")}
          aria-labelledby="editorial-visit-title"
        >
          <div className={className("visitIntro")}>
            <span className={className("sectionNumber")} aria-hidden="true">
              03
            </span>
            <h2 id="editorial-visit-title">Visítanos</h2>
            {(content.contact.address_line || content.contact.city) ? (
              <address>
                {content.contact.address_line}
                {content.contact.address_line && content.contact.city ? <br /> : null}
                {content.contact.city}
              </address>
            ) : null}
            <div className={className("contactLinks")}>
              {content.contact.public_phone ? (
                <a href={`tel:${content.contact.public_phone.replace(/[^\d+]/g, "")}`}>
                  Teléfono: {content.contact.public_phone}
                </a>
              ) : null}
              {content.contact.public_email ? (
                <a href={`mailto:${content.contact.public_email}`}>
                  Correo: {content.contact.public_email}
                </a>
              ) : null}
              {content.contact.whatsapp_phone ? (
                <a
                  href={`https://wa.me/${content.contact.whatsapp_phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Contactar por WhatsApp
                </a>
              ) : null}
              {content.contact.map_url ? (
                <a href={content.contact.map_url} target="_blank" rel="noreferrer">
                  Ver ubicación
                </a>
              ) : null}
            </div>
          </div>

          {content.hours.length ? (
            <div className={className("hours")}>
              <h3>Horarios</h3>
              <dl>
                {content.hours.map((schedule) => (
                  <div key={schedule.day}>
                    <dt>{DAYS[schedule.day]}</dt>
                    <dd>
                      {schedule.is_open
                        ? `${schedule.opening_time}–${schedule.closing_time}`
                        : "Cerrado"}
                      {schedule.note ? <small>{schedule.note}</small> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      {socials.length ? (
        <aside className={className("social")} aria-labelledby="editorial-social-title">
          <h2 id="editorial-social-title">Redes sociales</h2>
          <div>
            {socials.map(([label, url]) => (
              <a href={url} target="_blank" rel="noreferrer" key={label}>
                {label}
              </a>
            ))}
          </div>
        </aside>
      ) : null}

      {content.hero.primary_cta_label && primaryHref ? (
        <section
          className={className("finalCta")}
          {...(content.identity.tagline
            ? { "aria-labelledby": "editorial-cta-title" }
            : { "aria-label": "Acción principal" })}
        >
          <p className={className("eyebrow")}>{content.identity.short_description}</p>
          {content.identity.tagline ? (
            <h2 id="editorial-cta-title">{content.identity.tagline}</h2>
          ) : null}
          <a
            href={primaryHref}
            {...(primaryExternal
              ? { target: "_blank", rel: "noreferrer" }
              : {})}
          >
            {content.hero.primary_cta_label}
            <span aria-hidden="true">↗</span>
          </a>
        </section>
      ) : null}

      <footer className={className("footer")}>
        <div>
          <strong>
            {content.footer.legal_name || content.identity.business_name}
          </strong>
          {content.identity.tagline ? <span>{content.identity.tagline}</span> : null}
        </div>
        {content.footer.copyright_text ? (
          <p>{content.footer.copyright_text}</p>
        ) : null}
        {content.contact.public_email ? (
          <a href={`mailto:${content.contact.public_email}`}>
            {content.contact.public_email}
          </a>
        ) : null}
      </footer>
    </main>
  );
}

export function renderRestaurantEditorialIsolated(input: {
  schemaKey: string;
  schemaVersion: number;
  content: unknown;
  media?: MediaRenderManifest;
  preview?: boolean;
  validationMode?: "draft" | "publication";
  className?: EditorialClassName;
}): ReactNode {
  if (
    input.schemaKey !== RESTAURANT_EDITORIAL_RENDERER_CONTRACT.schemaKey ||
    input.schemaVersion !== RESTAURANT_EDITORIAL_RENDERER_CONTRACT.schemaVersion
  ) {
    throw new RestaurantEditorialCompatibilityError();
  }
  const content = validateRestaurantV2Content(
    input.content,
    input.validationMode ?? "publication",
  );
  return (
    <RestaurantEditorialView
      content={content}
      media={input.media ?? {}}
      preview={input.preview === true}
      className={input.className ?? identityClassName}
      ImageComponent={IsolatedEditorialImage}
    />
  );
}
