import Image from "next/image";
import Link from "next/link";

export function AuthShell({
  eyebrow,
  title,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/" aria-label="Volver a nexi">
          <Image src="/nexi-logo.png" alt="" width={34} height={34} />
          <b>nexi</b>
        </Link>
        <span className="kicker">{eyebrow}</span>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function AuthNotice({
  tone = "info",
  children,
}: Readonly<{
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
}>) {
  return <p className={`auth-notice auth-notice-${tone}`}>{children}</p>;
}
