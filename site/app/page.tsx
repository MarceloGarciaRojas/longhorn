import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import LandingClient from "./landing-client";
import { getAppConfig } from "@/src/config/app-config";
import { renderRegisteredTemplate } from "@/src/content/renderer-registry";
import { resolvePublicSite } from "@/src/content/service.server";
import type { PublicSiteResolution } from "@/src/content/types";
import { classifyPublicHost } from "@/src/tenancy/public-host";

export const dynamic = "force-dynamic";

const resolveHomeSite = cache((host: string) => {
  const platformHost = new URL(getAppConfig().publicUrl).host;
  const resolution = classifyPublicHost(host, [platformHost]);
  return resolution.kind === "site_candidate"
    ? resolvePublicSite({ hostname: resolution.hostname })
    : Promise.resolve(null);
});

function publicMetadata(site: PublicSiteResolution): Metadata {
  if (site.publicState !== "published" || !site.content) {
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
    openGraph: {
      title: site.content.seo.title,
      description: site.content.seo.description,
      type: "website",
      url: canonical,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "";
  const site = await resolveHomeSite(host);
  return site ? publicMetadata(site) : {};
}

function PublicState({ state }: { state: "preparing" | "unavailable" }) {
  return (
    <main className="public-site-state">
      <section>
        <span className="kicker">nexi</span>
        <h1>{state === "preparing" ? "Sitio en preparación" : "Sitio no disponible"}</h1>
        <p>
          {state === "preparing"
            ? "Estamos preparando esta experiencia. Vuelve a visitarnos próximamente."
            : "Este sitio no está disponible en este momento."}
        </p>
      </section>
    </main>
  );
}

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "";
  const site = await resolveHomeSite(host);
  if (!site) return <LandingClient />;
  if (site.publicState !== "published" || !site.content ||
      !site.rendererKey || !site.schemaKey || !site.schemaVersion) {
    return <PublicState state={site.publicState === "preparing" ? "preparing" : "unavailable"} />;
  }
  return renderRegisteredTemplate({
    rendererKey: site.rendererKey,
    schemaKey: site.schemaKey,
    schemaVersion: site.schemaVersion,
    content: site.content,
    media: site.media,
  });
}
