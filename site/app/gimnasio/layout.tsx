import type { Metadata } from "next";
import "./gimnasio.css";

export const metadata: Metadata = {
  title: "Fuerza Norte | Entrena con propósito",
  description: "Sitio demostrativo para un gimnasio: membresías, clases, horarios y gestión desde Longhorn.",
};

export default function GymLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
