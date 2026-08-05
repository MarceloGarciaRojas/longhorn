import Image from "next/image";
import type { RestaurantContent, RestaurantDay, RestaurantMediaReference } from "../types";
import styles from "./restaurant-classic.module.css";

const MEDIA: Record<RestaurantMediaReference, string | null> = {
  placeholder: null,
  "restaurant-hero": "/restaurant-template/images/hero-ravioli.png",
  "restaurant-dish-a": "/restaurant-template/images/croquetas.webp",
  "restaurant-dish-b": "/restaurant-template/images/pesca.webp",
  "restaurant-dessert": "/restaurant-template/images/tiramisu.webp",
};

const DAY_LABELS: Record<RestaurantDay, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

function ctaHref(content: RestaurantContent): string {
  const { primary_cta_type: type, primary_cta_target: target } = content.hero;
  if (type === "menu") return "#menu";
  if (type === "phone") return `tel:${target.replace(/[^\d+]/g, "")}`;
  if (type === "whatsapp") return `https://wa.me/${target.replace(/\D/g, "")}`;
  return target;
}

function mediaPath(reference: RestaurantMediaReference | ""): string | null {
  return reference ? MEDIA[reference] : null;
}

export function RestaurantClassicRenderer({
  content,
  preview = false,
}: {
  content: RestaurantContent;
  preview?: boolean;
}) {
  const heroImage = mediaPath(content.hero.hero_media_reference);
  const availableItems = content.menu.items.filter((item) => item.availability);
  const categories = content.menu.categories.filter((category) =>
    availableItems.some((item) => item.category_id === category.id),
  );
  const initial = content.identity.business_name.slice(0, 1).toUpperCase() || "R";
  const ctaExternal = content.hero.primary_cta_type === "whatsapp" ||
    content.hero.primary_cta_type === "map";

  return (
    <main className={styles.site}>
      <a className={styles.skip} href="#restaurant-content">Saltar al contenido</a>
      {preview ? (
        <div className={styles.previewBanner} role="status">
          Vista previa privada · este contenido aún no está publicado
        </div>
      ) : null}
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label={`${content.identity.business_name}, inicio`}>
          <span className={styles.brandMark} aria-hidden="true">{initial}</span>
          <span>
            <strong>{content.identity.business_name}</strong>
            <small>{content.identity.tagline}</small>
          </span>
        </a>
        <nav className={styles.nav} aria-label="Navegación principal">
          <a href="#menu">Carta</a>
          <a href="#historia">Nosotros</a>
          <a href="#visitanos">Visítanos</a>
          <a className={styles.navCta} href={ctaHref(content)}>Contactar</a>
        </nav>
      </header>

      <section id="inicio" className={styles.hero}>
        <div className={styles.heroCopy} id="restaurant-content">
          <p className={styles.eyebrow}>{content.identity.short_description}</p>
          <h1>{content.hero.headline}</h1>
          <p className={styles.lead}>{content.hero.subheadline}</p>
          <div className={styles.heroActions}>
            <a
              className={styles.primaryButton}
              href={ctaHref(content)}
              {...(ctaExternal ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {content.hero.primary_cta_label}
              <span aria-hidden="true">→</span>
            </a>
            <a className={styles.ghostButton} href="#visitanos">Ver horarios</a>
          </div>
          <p className={styles.openNote}>
            <span aria-hidden="true" /> Horarios y disponibilidad actualizados
          </p>
        </div>
        <div className={styles.heroImage}>
          {heroImage ? (
            <Image
              src={heroImage}
              alt=""
              fill
              priority
              sizes="(max-width: 800px) 100vw, 53vw"
            />
          ) : <span className={styles.imagePlaceholder} aria-hidden="true" />}
          <span className={styles.imageNote}>
            Nuestra cocina
            <b>{content.identity.tagline}</b>
          </span>
        </div>
      </section>

      <div className={styles.marquee} aria-label="Información principal">
        <span>Carta actualizada</span><b aria-hidden="true">•</b>
        <span>{categories.length} categorías</span><b aria-hidden="true">•</b>
        <span>{content.contact.city}</span><b aria-hidden="true">•</b>
        <span>Contacto directo</span>
      </div>

      <section id="historia" className={`${styles.story} ${styles.section}`}>
        <div className={styles.storyVisual} aria-hidden="true">
          <div className={styles.quoteCard}>{content.identity.tagline}</div>
        </div>
        <div className={styles.storyCopy}>
          <p className={styles.eyebrow}>Nuestra historia</p>
          <h2>{content.about.title}</h2>
          <p>{content.about.description}</p>
        </div>
      </section>

      <section id="menu" className={`${styles.menu} ${styles.section}`}>
        <div className={styles.menuHeading}>
          <div>
            <p className={styles.eyebrow}>Nuestra propuesta</p>
            <h2>{content.menu.section_title}</h2>
          </div>
          <p>{content.identity.short_description}</p>
        </div>
        {categories.length ? (
          <div className={styles.categorySections}>
            {categories.map((category) => (
              <section key={category.id} aria-labelledby={`category-${category.id}`}>
                <header className={styles.categoryHeading}>
                  <h3 id={`category-${category.id}`}>{category.name}</h3>
                  {category.description ? <p>{category.description}</p> : null}
                </header>
                <div className={styles.dishGrid}>
                  {availableItems
                    .filter((item) => item.category_id === category.id)
                    .map((item) => {
                      const image = mediaPath(item.media_reference);
                      return (
                        <article className={styles.dishCard} key={item.id}>
                          <div className={styles.dishPhoto}>
                            {image ? (
                              <Image
                                src={image}
                                alt=""
                                width={640}
                                height={520}
                                sizes="(max-width: 800px) 100vw, 33vw"
                              />
                            ) : <span className={styles.dishPlaceholder} aria-hidden="true" />}
                          </div>
                          <div className={styles.dishBody}>
                            <div>
                              <h4>{item.name}</h4>
                              <p>{item.description}</p>
                            </div>
                            {item.price_text ? <strong>{item.price_text}</strong> : null}
                          </div>
                        </article>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className={styles.emptyMenu}>La carta estará disponible próximamente.</p>
        )}
      </section>

      <section id="visitanos" className={`${styles.visit} ${styles.section}`}>
        <div>
          <p className={`${styles.eyebrow} ${styles.light}`}>Ven a vernos</p>
          <h2>Tu mesa te espera.</h2>
          <p className={styles.address}>
            {content.contact.address_line}<br />{content.contact.city}
          </p>
          {content.contact.map_url ? (
            <a
              className={styles.mapLink}
              href={content.contact.map_url}
              target="_blank"
              rel="noreferrer"
            >
              Cómo llegar
            </a>
          ) : null}
          <a className={styles.coralButton} href={ctaHref(content)}>
            {content.hero.primary_cta_label}
          </a>
        </div>
        <div className={styles.hours}>
          <h3>Horarios</h3>
          {content.hours.map((schedule) => (
            <div key={schedule.day}>
              <span>{DAY_LABELS[schedule.day]}</span>
              <b className={!schedule.is_open ? styles.closed : undefined}>
                {schedule.is_open
                  ? `${schedule.opening_time}–${schedule.closing_time}${schedule.note ? ` · ${schedule.note}` : ""}`
                  : schedule.note || "Cerrado"}
              </b>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.brand} ${styles.footerBrand}`}>
          <span className={styles.brandMark} aria-hidden="true">{initial}</span>
          <span>
            <strong>{content.identity.business_name}</strong>
            <small>{content.identity.tagline}</small>
          </span>
        </div>
        <div>
          <b>Hablemos</b>
          <a href={`tel:${content.contact.public_phone.replace(/[^\d+]/g, "")}`}>
            {content.contact.public_phone}
          </a>
          <a href={`mailto:${content.contact.public_email}`}>{content.contact.public_email}</a>
        </div>
        <div>
          <b>Síguenos</b>
          {content.social.instagram_url ? <a href={content.social.instagram_url}>Instagram</a> : null}
          {content.social.facebook_url ? <a href={content.social.facebook_url}>Facebook</a> : null}
          {content.social.tiktok_url ? <a href={content.social.tiktok_url}>TikTok</a> : null}
        </div>
        <div className={styles.legal}>
          {content.footer.legal_name || content.identity.business_name}<br />
          {content.footer.copyright_text || `© ${new Date().getFullYear()} ${content.identity.business_name}`}
        </div>
      </footer>
    </main>
  );
}
