import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthSession } from "@/src/auth/types";

const navigation = [
  { href: "/cuenta", label: "Inicio" },
  { href: "/cuenta/sitios", label: "Mis sitios" },
  { href: "/cuenta/plan", label: "Mi plan" },
  { href: "/cuenta/datos", label: "Mis datos" },
  { href: "/cuenta/mensajes", label: "Mensajes" },
] as const;

export function ClientShell({
  session,
  canChangeCompany,
  unreadCount,
  hasOnboarding,
  children,
}: {
  session: Readonly<AuthSession>;
  canChangeCompany: boolean;
  unreadCount: number;
  hasOnboarding: boolean;
  children: ReactNode;
}) {
  return (
    <div className="client-app">
      <aside className="client-sidebar">
        <Link href="/cuenta" className="client-brand" aria-label="Inicio nexi">
          nexi
          <span>Mi cuenta</span>
        </Link>
        <div className="client-company">
          <span>Mi empresa</span>
          <strong>{session.activeTenantName}</strong>
          {canChangeCompany ? (
            <Link href="/seleccionar-empresa?change=1">Cambiar empresa</Link>
          ) : null}
        </div>
        <nav aria-label="Navegación de mi cuenta">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
              {item.href === "/cuenta/mensajes" && unreadCount > 0 ? (
                <span
                  className="nav-count"
                  aria-label={`${unreadCount} mensajes no leídos`}
                >
                  {unreadCount}
                </span>
              ) : null}
            </Link>
          ))}
          {hasOnboarding ? (
            <Link href="/cuenta/incorporacion">Mi incorporación</Link>
          ) : null}
        </nav>
        <div className="client-account">
          <span>Cuenta</span>
          <strong>{session.displayName}</strong>
          <small>{session.email}</small>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main className="client-main">{children}</main>
    </div>
  );
}
