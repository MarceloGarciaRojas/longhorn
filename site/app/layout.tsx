import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: "nexi | Gestión digital clara para pymes",
    description: "Prototipo de nexi: una experiencia simple para ordenar la presencia y gestión digital de tu pyme.",
    openGraph: {
      title: "nexi | Menos complejidad, más control",
      description: "Prototipo documental de una experiencia digital clara para pymes.",
      type: "website",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "nexi, gestión digital clara para pymes" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "nexi | Menos complejidad, más control",
      description: "Prototipo documental de una experiencia digital clara para pymes.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
