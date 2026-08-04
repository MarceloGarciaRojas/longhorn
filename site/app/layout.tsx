import type { Metadata } from "next";
import { getAppConfig } from "@/src/config/app-config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const config = getAppConfig();
  const socialImage = `${config.publicUrl}/og.png`;

  return {
    metadataBase: new URL(config.publicUrl),
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
  const config = getAppConfig();
  return <html lang="es" data-app-environment={config.environment}><body>{children}</body></html>;
}
