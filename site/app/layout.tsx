import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: "Longhorn | Gestión empresarial para pymes",
    description: "Ordena la operación de tu pyme, mejora la visibilidad y toma decisiones claras con Longhorn.",
    openGraph: {
      title: "Longhorn | Orden para hoy. Impulso para crecer.",
      description: "Gestión empresarial clara para pymes que quieren crecer con control.",
      type: "website",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Longhorn, orden para hoy e impulso para crecer" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Longhorn | Orden para hoy. Impulso para crecer.",
      description: "Gestión empresarial clara para pymes que quieren crecer con control.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
