"use client";

import { FormEvent, useState } from "react";

type View = "landing" | "login" | "onboarding" | "video" | "dashboard" | "design";

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
  ["¿El producto ya está disponible?", "Todavía no. Esta experiencia es un prototipo documental para validar la propuesta, el flujo y el lenguaje visual del futuro MVP."],
  ["¿Qué incluirá el MVP?", "El alcance inicial considera un solo rubro piloto y tres plantillas, con foco en una puesta en marcha clara y acompañada."],
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
      <button className="pill subtle" onClick={() => go("login")}>Iniciar Sesión</button>
    </header>

    <main>
      <section className="hero" id="inicio">
        <div className="hero-card">
          <div className="glow glow-one" /><div className="glow glow-two" />
          <div className="hero-copy">
            <span className="tag"><i /> Prototipo documental</span>
            <h1 className="hero-wordmark"><img src="/nexi-logo.png" alt="" /><span>nexi</span></h1>
            <p>Una forma clara, profesional y simple de ordenar la presencia digital y la gestión diaria de tu pyme.</p>
            <div className="action-row"><button className="pill primary" onClick={() => go("onboarding")}>Registrarme</button><button className="pill ghost video-button" onClick={() => go("video")}><span className="video-icon" aria-hidden="true">▶</span> Ver cómo funciona</button></div>
          </div>
          <div className="landscape-frame"><img src="/purple-mountain.jpg" alt="Paisaje de montaña en tonos violetas" /></div>
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
        <div className="steps">{[["01", "Entendemos", "Revisamos el flujo real del rubro piloto."], ["02", "Configuramos", "Elegimos una de las tres plantillas previstas."], ["03", "Validamos", "Probamos claridad, contenido y adopción con el equipo."]].map(([n,t,c]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}</div>
      </section>

      <section className="section plans" id="planes">
        <div className="plans-heading"><span className="kicker">Planes simples</span><h2>Un comienzo claro, sin sorpresas.</h2><p>La estructura comercial aún está en definición. Estas alternativas sirven para validar cómo se presentará la oferta del MVP.</p></div>
        <div className="plan-grid"><article><span>Exploración</span><h3>Demo guiada</h3><p>Conoce la experiencia y valida si encaja con tu negocio.</p><button className="pill ghost" onClick={() => go("video")}>Ver cómo funciona</button></article><article className="featured"><span>Rubro piloto</span><h3>Plan inicial</h3><p>Una plantilla, acompañamiento de configuración y acceso al futuro panel.</p><button className="pill primary" onClick={() => go("onboarding")}>Registrarme</button></article></div>
      </section>

      <section className="section faq" id="faq"><div><span className="kicker">Preguntas frecuentes</span><h2>Lo esencial, sin letra pequeña.</h2><p>El sitio representa una visión de producto; no una plataforma operativa ni una oferta comercial activa.</p></div><div className="faq-list">{faqs.map(([q,a], i) => <article key={q}><button aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}><b>{q}</b><span>{openFaq === i ? "−" : "+"}</span></button>{openFaq === i && <p>{a}</p>}</article>)}</div></section>

      <section className="section news" id="noticias"><div><span className="kicker">Noticias nexi</span><h2>Avances del proyecto.</h2></div><div className="news-grid"><article><span>Diseño · Julio 2026</span><h3>Nueva experiencia visual en validación</h3><p>Estamos probando una interfaz más simple, intuitiva y consistente para el rubro piloto.</p><a href="#inicio">Leer actualización <b>→</b></a></article><article><span>Producto · Próximamente</span><h3>Definición de las tres plantillas iniciales</h3><p>El siguiente hito documental establecerá el contenido y alcance de cada alternativa.</p><a href="#planes">Conocer los planes <b>→</b></a></article></div></section>

      <section className="cta"><span className="kicker">Construyamos claridad</span><h2>Conoce cómo podría verse nexi en tu pyme.</h2><button className="pill light" onClick={() => go("onboarding")}>Ver experiencia demo <span>→</span></button></section>
    </main>
    <footer><div><Brand inverse /><p>Gestión digital simple para pymes que quieren crecer con control.</p></div><div><b>Prototipo</b><button onClick={() => go("dashboard")}>Panel demostrativo</button><button onClick={() => go("design")}>Guía visual</button></div><small>© 2026 nexi · Etapa de preparación documental</small></footer>
  </div>;
}

function ModalShell({ title, eyebrow, close, children, wide = false }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-stage"><button className="modal-backdrop" aria-label="Cerrar" onClick={close} /><section className={`modal-card ${wide ? "modal-wide" : ""}`}><button className="close" onClick={close} aria-label="Cerrar">×</button><Brand /><span className="kicker">{eyebrow}</span><h2>{title}</h2>{children}</section></div>;
}

function Login({ go }: { go: (view: View) => void }) {
  const submit = (e: FormEvent) => { e.preventDefault(); go("dashboard"); };
  return <><Landing go={go} /><ModalShell eyebrow="Acceso de demostración" title="Bienvenido a nexi" close={() => go("landing")}><p className="modal-copy">Usa cualquier correo y contraseña para recorrer este prototipo. No se envían ni almacenan datos.</p><form onSubmit={submit} className="form"><label>Correo<input required type="email" defaultValue="demo@nexi.cl" /></label><label>Contraseña<input required type="password" defaultValue="demonexi" /></label><button className="pill primary" type="submit">Ingresar al panel <span>→</span></button></form><button className="text-button" onClick={() => go("onboarding")}>¿Primera vez? Explora el onboarding</button></ModalShell></>;
}

function Onboarding({ go }: { go: (view: View) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Café La Toscana");
  return <ModalShell eyebrow={`Onboarding · Paso ${step} de 3`} title={step === 1 ? "Conozcamos tu negocio" : step === 2 ? "Elige una base visual" : "Revisa tu espacio"} close={() => go("landing")}>
    <div className="progress"><i style={{ width: `${step * 33.333}%` }} /></div>
    {step === 1 && <div className="form"><label>Nombre de la pyme<input value={name} onChange={e => setName(e.target.value)} /></label><label>Rubro piloto<select><option>Cafetería de barrio</option></select></label><label>Tamaño del equipo<select><option>1 a 10 personas</option><option>11 a 25 personas</option></select></label></div>}
    {step === 2 && <div className="template-grid">{["Editorial", "Catálogo", "Esencial"].map((x,i) => <button key={x} className={i === 0 ? "selected" : ""}><i>{i + 1}</i><b>{x}</b><small>Plantilla demostrativa</small></button>)}</div>}
    {step === 3 && <div className="review-card"><span>Espacio demo</span><h3>{name || "Mi pyme"}</h3><p>Cafetería de barrio · Plantilla Editorial</p><div><i /> Preparado para explorar</div></div>}
    <div className="form-actions">{step > 1 && <button className="pill ghost" onClick={() => setStep(step - 1)}>Atrás</button>}<button className="pill primary" disabled={step === 1 && !name.trim()} onClick={() => step < 3 ? setStep(step + 1) : go("dashboard")}>{step < 3 ? "Continuar" : "Abrir panel demo"} <span>→</span></button></div>
  </ModalShell>;
}

function VideoDemo({ go }: { go: (view: View) => void }) {
  return <ModalShell eyebrow="Video demostrativo" title="Así funciona nexi" close={() => go("landing")} wide>
    <p className="modal-copy">Esta animación provisional representa el futuro video. Cuando el material final esté listo, lo reemplazaremos en este mismo espacio.</p>
    <div className="video-placeholder" role="img" aria-label="Animación provisional del proceso de nexi">
      <div className="video-screen"><span className="video-play">▶</span><div className="demo-scene scene-one"><i>1</i><span><b>Registra tu negocio</b><small>Cuéntanos lo esencial en pocos pasos.</small></span></div><div className="demo-scene scene-two"><i>2</i><span><b>Elige tu plantilla</b><small>Parte desde una base diseñada para el piloto.</small></span></div><div className="demo-scene scene-three"><i>3</i><span><b>Publica y administra</b><small>Gestiona todo desde un panel claro.</small></span></div></div>
      <div className="video-progress"><i /></div>
    </div>
    <div className="form-actions"><button className="pill primary" onClick={() => go("onboarding")}>Registrarme <span>→</span></button></div>
  </ModalShell>;
}

function Dashboard({ go }: { go: (view: View) => void }) {
  const [tab, setTab] = useState("Mis sitios");
  return <div className="dashboard-shell"><aside><Brand inverse /><div className="user-card"><i>CM</i><span><b>Carlos Mendoza</b><small>Administrador</small></span></div><nav>{["Mis sitios", "Mi plan", "Mensajes", "Configuración"].map((x,i) => <button className={tab === x ? "active" : ""} key={x} onClick={() => setTab(x)}><span>{["▦","◇","○","⚙"][i]}</span>{x}</button>)}</nav><div className="demo-note"><b>Modo demostración</b><p>Sin datos reales ni cambios persistentes.</p></div><button className="exit" onClick={() => go("landing")}>← Volver al sitio</button></aside><main><header><div><span className="kicker">Panel de Carlos Mendoza</span><h1>{tab}</h1></div><button className="pill subtle" onClick={() => go("design")}>Guía visual</button></header>{tab === "Mis sitios" ? <SitesPanel /> : <EmptyPanel title={tab} />}</main></div>;
}

function SitesPanel() {
  const [message, setMessage] = useState("Selecciona un sitio para comenzar.");
  const sites = [{ name: "Café La Toscana", domain: "cafelatoscana.nexi.site", status: "Publicado", progress: "82% completo" }, { name: "Toscana Eventos", domain: "Sin dominio registrado", status: "Borrador", progress: "45% completo" }];
  return <><div className="notice"><span>✦</span><div><b>Hola, Carlos</b><p>{message} Todas las acciones son demostrativas.</p></div></div><section className="sites-panel"><div className="sites-toolbar"><div><h2>Tus sitios</h2><p>Administra tus experiencias desde un solo lugar.</p></div><button className="pill primary" onClick={() => setMessage("El registro de nuevos sitios estará disponible cuando se apruebe el MVP.")}>＋ Nuevo sitio</button></div><div className="site-list">{sites.map((site, i) => <article key={site.name}><div className="site-preview"><Brand /></div><div className="site-info"><span className={`site-status ${i ? "draft" : ""}`}><i /> {site.status}</span><h3>{site.name}</h3><p>{site.domain}</p><small>{site.progress}</small></div><div className="site-actions"><button className="pill subtle" onClick={() => setMessage(`Abriendo el editor demostrativo de ${site.name}.`)}>Editar sitio</button><button className="pill ghost" onClick={() => setMessage(`Registro de dominio seleccionado para ${site.name}.`)}>Registrar mi dominio</button><button className="danger-button" onClick={() => setMessage(`La eliminación de ${site.name} requiere confirmación y backend; no se realizó ningún cambio.`)}>Eliminar sitio</button></div></article>)}</div></section></>;
}

function EmptyPanel({ title }: { title: string }) { return <section className="empty-panel"><span>◇</span><h2>{title}</h2><p>Esta sección es una representación visual. Su funcionalidad se definirá y aprobará durante la documentación del MVP.</p></section>; }

function Design({ go }: { go: (view: View) => void }) {
  return <div className="design-page"><header><Brand /><button className="pill ghost" onClick={() => go("landing")}>← Volver al sitio</button></header><main><span className="kicker">Sistema visual · Prototipo</span><h1>Una interfaz serena,<br />clara y cercana.</h1><p className="design-lead">El adjunto inspira una dirección violeta suave, con superficies luminosas, bordes generosos y jerarquías muy legibles.</p><section><h2>Paleta</h2><div className="swatches">{[["Tinta","#171329"],["Violeta","#7553C8"],["Lavanda","#E8DFF8"],["Niebla","#F8F6FC"],["Blanco","#FFFFFF"]].map(([n,c]) => <article key={n}><i style={{background:c}} /><b>{n}</b><small>{c}</small></article>)}</div></section><section><h2>Componentes</h2><div className="component-sample"><button className="pill primary">Acción principal</button><button className="pill subtle">Acción secundaria</button><span className="tag"><i /> Estado activo</span><div className="mini-card"><small>Indicador</small><strong>82%</strong><span>Contenido completo</span></div></div></section></main></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  if (view === "login") return <Login go={setView} />;
  if (view === "onboarding") return <><Landing go={setView} /><div className="blur-overlay" /><Onboarding go={setView} /></>;
  if (view === "video") return <><Landing go={setView} /><div className="blur-overlay" /><VideoDemo go={setView} /></>;
  if (view === "dashboard") return <Dashboard go={setView} />;
  if (view === "design") return <Design go={setView} />;
  return <Landing go={setView} />;
}
