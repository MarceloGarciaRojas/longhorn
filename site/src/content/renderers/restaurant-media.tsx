import type { MediaRenderManifest, MediaVariantName } from "@/src/media/types";
import type {
  RestaurantContentV2,
  RestaurantDay,
  RestaurantMediaUsage,
} from "../types";
import styles from "./restaurant-media.module.css";

const DAYS: Record<RestaurantDay, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

function href(content: RestaurantContentV2): string {
  const { primary_cta_type: type, primary_cta_target: target } = content.hero;
  if (type === "menu") return "#menu";
  if (type === "phone") return `tel:${target.replace(/[^\d+]/g, "")}`;
  if (type === "whatsapp") return `https://wa.me/${target.replace(/\D/g, "")}`;
  return target;
}

function MediaImage({
  usage,
  media,
  variant,
  className,
}: {
  usage: RestaurantMediaUsage | null;
  media: MediaRenderManifest;
  variant: MediaVariantName;
  className: string;
}) {
  const resolved = usage ? media[usage.assetId]?.[variant] : undefined;
  if (!usage || !resolved) {
    return <span className={`${className} ${styles.placeholder}`} aria-hidden="true" />;
  }
  return (
    <img
      className={className}
      src={resolved.url}
      width={resolved.width}
      height={resolved.height}
      alt={usage.decorative ? "" : usage.altText}
      loading={variant === "hero" ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

export function RestaurantMediaRenderer({
  content,
  media,
  preview = false,
  design,
}: {
  content: RestaurantContentV2;
  media: MediaRenderManifest;
  preview?: boolean;
  design: "classic" | "modern";
}) {
  const available = content.menu.items.filter((item) => item.availability);
  const categories = content.menu.categories.filter((category) =>
    available.some((item) => item.category_id === category.id),
  );
  return (
    <main className={`${styles.site} ${styles[design]}`}>
      <a className={styles.skip} href="#contenido">Saltar al contenido</a>
      {preview ? (
        <div className={styles.preview} role="status">
          Vista previa privada · aún no publicada
        </div>
      ) : null}
      <header className={styles.header}>
        <a href="#inicio" className={styles.brand}>
          {content.identity.business_name}
        </a>
        <nav aria-label="Navegación principal">
          <a href="#menu">Carta</a>
          <a href="#nosotros">Nosotros</a>
          <a href="#visitanos">Visítanos</a>
        </nav>
      </header>
      <section id="inicio" className={styles.hero}>
        <div id="contenido" className={styles.heroCopy}>
          <p className={styles.kicker}>{content.identity.short_description}</p>
          <h1>{content.hero.headline}</h1>
          <p>{content.hero.subheadline}</p>
          <a className={styles.button} href={href(content)}>
            {content.hero.primary_cta_label}
          </a>
        </div>
        <MediaImage
          usage={content.hero.media}
          media={media}
          variant="hero"
          className={styles.heroImage}
        />
      </section>
      <section id="nosotros" className={styles.about}>
        <p className={styles.kicker}>{content.identity.tagline}</p>
        <h2>{content.about.title}</h2>
        <p>{content.about.description}</p>
      </section>
      <section id="menu" className={styles.menu}>
        <p className={styles.kicker}>{content.identity.short_description}</p>
        <h2>{content.menu.section_title}</h2>
        {categories.map((category) => (
          <section key={category.id} aria-labelledby={`categoria-${category.id}`}>
            <h3 id={`categoria-${category.id}`}>{category.name}</h3>
            {category.description ? <p>{category.description}</p> : null}
            <div className={styles.grid}>
              {available
                .filter((item) => item.category_id === category.id)
                .map((item) => (
                  <article key={item.id} className={styles.card}>
                    <MediaImage
                      usage={item.media}
                      media={media}
                      variant="card"
                      className={styles.cardImage}
                    />
                    <div>
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      {item.price_text ? <strong>{item.price_text}</strong> : null}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </section>
      <section id="visitanos" className={styles.visit}>
        <div>
          <p className={styles.kicker}>Visítanos</p>
          <h2>{content.contact.address_line}</h2>
          <p>{content.contact.city}</p>
          <a href={`tel:${content.contact.public_phone.replace(/[^\d+]/g, "")}`}>
            {content.contact.public_phone}
          </a>
        </div>
        <div className={styles.hours}>
          <h3>Horarios</h3>
          {content.hours.map((schedule) => (
            <p key={schedule.day}>
              <span>{DAYS[schedule.day]}</span>
              <strong>
                {schedule.is_open
                  ? `${schedule.opening_time}–${schedule.closing_time}`
                  : schedule.note || "Cerrado"}
              </strong>
            </p>
          ))}
        </div>
      </section>
      <footer className={styles.footer}>
        <strong>{content.footer.legal_name || content.identity.business_name}</strong>
        <span>{content.footer.copyright_text}</span>
        <a href={`mailto:${content.contact.public_email}`}>
          {content.contact.public_email}
        </a>
      </footer>
    </main>
  );
}
