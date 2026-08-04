"use client";

import { useState } from "react";

type View = "landing" | "video";

const problems = [
  ["Sitio desactualizado", "La información clave queda obsoleta y tus clientes pierden confianza."],
  ["Dependencia de terceros", "Hasta un cambio pequeño termina convertido en espera, coordinación y costo."],
  ["Herramientas dispersas", "Datos, formularios y accesos viven en lugares distintos y sin una visión común."],
  ["Poco tiempo técnico", "Tu equipo necesita operar el negocio, no mantener una colección de herramientas."],
];

const modules = [
  ["01", "Presencia digital", "Contenido esencial del negocio en una experiencia profesional y responsiva."],
  ["02", "Gestión centralizada", "Una vista clara para ordenar información, tareas y seguimiento cotidiano."],
  ["03", "Contactos", "Solicitudes reunidas en una bandeja simple, preparada para el rubro piloto."],
];

const faqs = [
  ["¿Qué es nexi?", "nexi es una propuesta SaaS B2B para ayudar a pymes a ordenar su presencia y operación digital desde una experiencia simple."],
  ["¿Cómo comienza la incorporación?", "Envías una solicitud inicial y el equipo nexi la revisa antes de crear cualquier cuenta, sitio o recurso operativo."],
  ["¿Qué incluye esta etapa?", "El alcance inicial considera restaurantes y dos plantillas, con una puesta en marcha asistida y aprobación previa a la publicación."],
];

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <span className={`brand ${inverse ? "brand-inverse" : ""}`}><i className="brand-mark" aria-hidden="true"><img src="/nexi-logo.png" alt="" /></i><b>nexi</b></span>;
}

function Landing({ go }: { go: (view: View) => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return <div className="landing">
    <header className="nav-shell">
      <button className="brand-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Brand /></button>
      <nav aria-label="Navegación principal"><a href="#solucion">Soluciones</a><a href="#planes">Planes</a><a href="#faq">Preguntas Frecuentes</a><a href="#noticias">Noticias</a></nav>
      <a className="pill subtle" href="/ingresar">Iniciar Sesión</a>
    </header>

    <main>
      <section className="hero" id="inicio">
        <div className="hero-card">
          <div className="glow glow-one" /><div className="glow glow-two" />
          <div className="hero-copy">
            <h1 className="hero-wordmark"><img src="/nexi-wordmark.png" alt="nexi" /></h1>
            <p>Una forma clara, profesional y simple de ordenar la presencia digital y la gestión diaria de tu pyme.</p>
            <div className="action-row"><a className="pill primary" href="/comenzar">Comenzar</a><button className="pill ghost video-button" onClick={() => go("video")}><span className="video-icon" aria-hidden="true">▶</span> Ver cómo funciona</button></div>
          </div>
          <div className="landscape-frame"><img src="/nexi-hero.png" alt="Ecosistema digital conectado de nexi" /></div>
        </div>
      </section>

      <section className="section intro">
        <span className="kicker">La realidad de las pymes</span>
        <h2>Menos complejidad.<br />Más control para avanzar.</h2>
        <p className="section-lead">nexi parte de problemas concretos: información dispersa, tareas repetidas y herramientas difíciles de mantener.</p>
        <div className="problem-grid">{problems.map(([title, copy], i) => <article key={title}><span className="problem-icon">0{i + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className="section solution" id="solucion">
        <div><span className="kicker">Una base para el piloto</span><h2>Tu negocio cambia.<br /><em>Tu espacio también.</em></h2><p>Un ecosistema modular para reunir lo importante sin obligarte a administrar infraestructura ni aprender herramientas complejas.</p></div>
        <div className="ecosystem-card"><div className="card-title"><b>Ecosistema nexi</b><span>ALCANCE MVP</span></div>{modules.map(([n, title, copy]) => <div className="module-row" key={n}><i>{n}</i><span><b>{title}</b><small>{copy}</small></span></div>)}</div>
      </section>

      <section className="section process" id="proceso">
        <span className="kicker">Proceso acompañado</span><h2>Del diagnóstico a una experiencia lista para validar.</h2>
        <div className="steps">{[["01", "Entendemos", "Revisamos el flujo real del rubro piloto."], ["02", "Configuramos", "Elegimos una de las dos plantillas disponibles."], ["03", "Validamos", "Revisamos contenido y aprobación antes de publicar."]].map(([n,t,c]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}</div>
      </section>

      <section className="section plans" id="planes">
        <div className="plans-heading"><span className="kicker">Planes simples</span><h2>Un comienzo claro, sin sorpresas.</h2><p>La estructura comercial aún está en definición. Estas alternativas sirven para validar cómo se presentará la oferta del MVP.</p></div>
        <div className="plan-grid"><article><span>Exploración</span><h3>Demo guiada</h3><p>Conoce la experiencia y valida si encaja con tu negocio.</p><button className="pill ghost" onClick={() => go("video")}>Ver cómo funciona</button></article><article className="featured"><span>Rubro piloto</span><h3>Incorporación asistida</h3><p>Configuración acompañada, contenido estructurado y acceso al panel.</p><a className="pill primary" href="/comenzar">Comenzar</a></article></div>
      </section>

      <section className="section faq" id="faq"><div><span className="kicker">Preguntas frecuentes</span><h2>Lo esencial, sin letra pequeña.</h2><p>El rubro piloto funciona mediante una incorporación asistida y controlada por el equipo nexi.</p></div><div className="faq-list">{faqs.map(([q,a], i) => <article key={q}><button aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}><b>{q}</b><span>{openFaq === i ? "−" : "+"}</span></button>{openFaq === i && <p>{a}</p>}</article>)}</div></section>

      <section className="section news" id="noticias"><div><span className="kicker">Noticias nexi</span><h2>Avances del proyecto.</h2></div><div className="news-grid"><article><span>Diseño · Julio 2026</span><h3>Nueva experiencia visual en validación</h3><p>Estamos probando una interfaz más simple, intuitiva y consistente para el rubro piloto.</p><a href="#inicio">Leer actualización <b>→</b></a></article><article><span>Producto · Próximamente</span><h3>Evolución de las dos plantillas disponibles</h3><p>Los siguientes hitos mejorarán el contenido y alcance de cada alternativa sin crear copias por cliente.</p><a href="#planes">Conocer los planes <b>→</b></a></article></div></section>

      <section className="cta"><span className="kicker">Construyamos claridad</span><h2>Comienza la incorporación de tu pyme.</h2><a className="pill light" href="/comenzar">Enviar solicitud <span>→</span></a></section>
    </main>
    <footer><div><Brand inverse /><p>Gestión digital simple para pymes que quieren crecer con control.</p></div><div><b>Acceso de clientes</b><a href="/ingresar">Iniciar sesión</a></div><small>© 2026 nexi</small></footer>
  </div>;
}

function ModalShell({ title, eyebrow, close, children, wide = false }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-stage"><button className="modal-backdrop" aria-label="Cerrar" onClick={close} /><section className={`modal-card ${wide ? "modal-wide" : ""}`}><button className="close" onClick={close} aria-label="Cerrar">×</button><Brand /><span className="kicker">{eyebrow}</span><h2>{title}</h2>{children}</section></div>;
}

function VideoDemo({ go }: { go: (view: View) => void }) {
  return <ModalShell eyebrow="Video demostrativo" title="Así funciona nexi" close={() => go("landing")} wide>
    <p className="modal-copy">Esta animación provisional representa el futuro video. Cuando el material final esté listo, lo reemplazaremos en este mismo espacio.</p>
    <div className="video-placeholder" role="img" aria-label="Animación provisional del proceso de nexi">
      <div className="video-screen"><span className="video-play">▶</span><div className="demo-scene scene-one"><i>1</i><span><b>Registra tu negocio</b><small>Cuéntanos lo esencial en pocos pasos.</small></span></div><div className="demo-scene scene-two"><i>2</i><span><b>Elige tu plantilla</b><small>Parte desde una base diseñada para el piloto.</small></span></div><div className="demo-scene scene-three"><i>3</i><span><b>Publica y administra</b><small>Gestiona todo desde un panel claro.</small></span></div></div>
      <div className="video-progress"><i /></div>
    </div>
    <div className="form-actions"><a className="pill primary" href="/comenzar">Comenzar <span>→</span></a></div>
  </ModalShell>;
}

export default function LandingClient() {
  const [view, setView] = useState<View>("landing");
  if (view === "video") return <><Landing go={setView} /><div className="blur-overlay" /><VideoDemo go={setView} /></>;
  return <Landing go={setView} />;
}
