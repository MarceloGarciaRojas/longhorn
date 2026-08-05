import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthSession } from "@/src/auth/types";

const links = [
  { href: "/nexi-interno", label: "Inicio" },
  { href: "/nexi-interno/clientes", label: "Clientes" },
  { href: "/nexi-interno/sitios", label: "Sitios" },
  { href: "/nexi-interno/onboarding", label: "Onboarding" },
  { href: "/nexi-interno/solicitudes/eliminacion", label: "Eliminaciones" },
  { href: "/nexi-interno/solicitudes/dominios", label: "Dominios" },
  { href: "/nexi-interno/soporte", label: "Soporte" },
  { href: "/nexi-interno/invitaciones", label: "Invitaciones" },
  { href: "/nexi-interno/auditoria", label: "Auditoría" },
] as const;

export function AdminShell({
  session,
  unreadCount,
  children,
}: {
  session: Readonly<AuthSession>;
  unreadCount: number;
  children: ReactNode;
}) {
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link href="/nexi-interno" className="admin-brand" aria-label="Inicio nexi">
          nexi
          <span>operación interna</span>
        </Link>
        <nav aria-label="Navegación interna">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
              {link.href === "/nexi-interno/soporte" && unreadCount > 0 ? (
                <span className="nav-count">{unreadCount}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="admin-operator">
          <span>Segundo factor verificado</span>
          <strong>{session.displayName}</strong>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-button">
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
