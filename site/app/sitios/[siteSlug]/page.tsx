import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderRegisteredTemplate } from "@/src/content/renderer-registry";
import { resolvePublicSite } from "@/src/content/service.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug } = await params;
  const site = await resolvePublicSite({ siteSlug });
  if (!site || site.publicState !== "published" || !site.content) {
    return {
      title: "Sitio en preparación",
      robots: { index: false, follow: false },
    };
  }
  const canonical = site.canonicalHostname
    ? `https://${site.canonicalHostname}/`
    : undefined;
  return {
    title: site.content.seo.title,
    description: site.content.seo.description,
    alternates: canonical ? { canonical } : undefined,
    robots: { index: true, follow: true },
    openGraph: {
      title: site.content.seo.title,
      description: site.content.seo.description,
      type: "website",
      url: canonical,
    },
  };
}

export default async function LocalPublicSitePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  const site = await resolvePublicSite({ siteSlug });
  if (!site) notFound();
  if (site.publicState !== "published" || !site.content ||
      !site.rendererKey || !site.schemaKey || !site.schemaVersion) {
    return (
      <main className="public-site-state">
        <section>
          <span className="kicker">nexi</span>
          <h1>{site.publicState === "preparing" ? "Sitio en preparación" : "Sitio no disponible"}</h1>
          <p>No se expone contenido sin una publicación activa.</p>
        </section>
      </main>
    );
  }
  return renderRegisteredTemplate({
    rendererKey: site.rendererKey,
    industryKey: site.industryKey,
    schemaKey: site.schemaKey,
    schemaVersion: site.schemaVersion,
    content: site.content,
    media: site.media,
  });
}
