"use client";

import { FormEvent, useState } from "react";

type View = "landing" | "login" | "onboarding" | "video" | "dashboard" | "design";

const classes = [
  ["FUERZA", "Entrenamiento funcional", "60 min", "Lun · Mié · Vie"],
  ["ENERGÍA", "HIIT", "45 min", "Mar · Jue · Sáb"],
  ["MOVILIDAD", "Yoga & recovery", "50 min", "Lun · Jue"],
];

const trainers = [
  ["AM", "Ana Morales", "Fuerza y movilidad"],
  ["DL", "Diego Lagos", "Funcional y HIIT"],
  ["CV", "Camila Vera", "Yoga y recuperación"],
];

const faqs = [
  ["¿Necesito experiencia previa?", "No. Adaptamos cada ejercicio a tu nivel y partimos con una evaluación para definir un plan seguro."],
  ["¿Puedo probar una clase?", "Sí. La primera visita incluye recorrido, conversación con un coach y una clase de prueba coordinada."],
  ["¿Qué incluye la membresía?", "Acceso a sala, clases grupales según disponibilidad, seguimiento mensual y uso de camarines."],
];

function GymBrand({ inverse = false }: { inverse?: boolean }) {
  return <span className={`gym-brand ${inverse ? "gym-brand-inverse" : ""}`}><i aria-hidden="true">FN</i><b>FUERZA NORTE</b></span>;
}

function Landing({ go }: { go: (view: View) => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return <div className="gym-theme gym-landing">
    <header className="gym-nav">
      <button className="gym-brand-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><GymBrand /></button>
      <nav aria-label="Navegación principal"><a href="#clases">Clases</a><a href="#equipo">Entrenadores</a><a href="#membresias">Membresías</a><a href="#faq-gym">Preguntas</a></nav>
      <button className="gym-pill gym-outline" onClick={() => go("login")}>Área de socios</button>
    </header>

    <main>
      <section className="gym-hero" id="inicio-gym">
        <div className="gym-hero-copy">
          <span className="gym-kicker">Gimnasio de barrio · Santiago</span>
          <h1>ENTRENA<br /><em>CON PROPÓSITO.</em></h1>
          <p>Un espacio cercano para construir fuerza, moverte mejor y sostener hábitos que sí caben en tu vida.</p>
          <div className="gym-actions"><button className="gym-pill gym-primary" onClick={() => go("onboarding")}>Agenda tu clase</button><button className="gym-pill gym-dark" onClick={() => go("video")}><span>▶</span> Conoce el gimnasio</button></div>
        </div>
        <div className="gym-hero-visual" aria-label="Composición gráfica inspirada en entrenamiento y movimiento">
          <div className="gym-figure"><i /><i /><i /></div>
          <div className="gym-stat"><strong>+340</strong><span>socios activos</span></div>
          <div className="gym-stamp">FUERZA<br />COMUNIDAD<br />CONSTANCIA</div>
        </div>
      </section>

      <section className="gym-proof"><span>Entrenamiento guiado</span><span>Clases reducidas</span><span>Progreso medible</span><span>Comunidad local</span></section>

      <section className="gym-section gym-intro">
        <div><span className="gym-kicker">Nuestro enfoque</span><h2>Tu mejor versión no se improvisa. <em>Se entrena.</em></h2></div>
        <p>No creemos en soluciones rápidas. Diseñamos una experiencia simple y acompañada para que avances con técnica, constancia y objetivos reales.</p>
        <div className="gym-feature-grid">{[["01","Evaluación inicial","Conocemos tu punto de partida y definimos una ruta clara."],["02","Coach presente","Recibes correcciones y apoyo durante cada entrenamiento."],["03","Seguimiento real","Revisamos tus avances y ajustamos el plan cada mes."]].map(([n,t,c]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}</div>
      </section>

      <section className="gym-section gym-classes" id="clases">
        <div className="gym-heading"><span className="gym-kicker">Clases para avanzar</span><h2>Muévete a tu manera.</h2><p>Tres experiencias complementarias, adaptables a distintos niveles y momentos de tu semana.</p></div>
        <div className="gym-class-list">{classes.map(([tag,title,time,days], i) => <article key={title}><div className={`gym-class-art art-${i + 1}`}><span>0{i + 1}</span></div><div><small>{tag}</small><h3>{title}</h3><p>{time} · {days}</p></div><button aria-label={`Ver ${title}`}>↗</button></article>)}</div>
      </section>

      <section className="gym-section gym-team" id="equipo">
        <div className="gym-heading"><span className="gym-kicker">Entrena acompañado</span><h2>Coaches que conocen tu nombre.</h2></div>
        <div className="gym-trainer-grid">{trainers.map(([initials,name,specialty], i) => <article key={name}><div className={`trainer-portrait trainer-${i + 1}`}><span>{initials}</span></div><h3>{name}</h3><p>{specialty}</p></article>)}</div>
      </section>

      <section className="gym-section gym-memberships" id="membresias">
        <div><span className="gym-kicker">Membresías simples</span><h2>Elige tu ritmo.</h2><p>Valores demostrativos para validar la presentación comercial del rubro gimnasio.</p></div>
        <div className="gym-plan-grid"><article><span>ESENCIAL</span><h3>8 clases</h3><strong>$39.900 <small>/ mes</small></strong><p>Dos entrenamientos semanales y seguimiento mensual.</p><button className="gym-pill gym-outline" onClick={() => go("onboarding")}>Quiero comenzar</button></article><article className="gym-featured"><span>ILIMITADO</span><h3>Entrena sin límites</h3><strong>$54.900 <small>/ mes</small></strong><p>Clases ilimitadas, sala libre y evaluación mensual.</p><button className="gym-pill gym-primary" onClick={() => go("onboarding")}>Elegir ilimitado</button></article></div>
      </section>

      <section className="gym-section gym-faq" id="faq-gym"><div><span className="gym-kicker">Antes de comenzar</span><h2>Preguntas frecuentes.</h2></div><div>{faqs.map(([q,a],i) => <article key={q}><button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}><b>{q}</b><span>{openFaq === i ? "−" : "+"}</span></button>{openFaq === i && <p>{a}</p>}</article>)}</div></section>

      <section className="gym-cta"><span className="gym-kicker">Tu primera clase comienza aquí</span><h2>Haz espacio para sentirte más fuerte.</h2><button className="gym-pill gym-light" onClick={() => go("onboarding")}>Agendar clase de prueba <span>→</span></button></section>
    </main>
    <footer className="gym-footer"><div><GymBrand inverse /><p>Entrenamiento cercano, progresivo y diseñado para durar.</p></div><div><b>Explora</b><button onClick={() => go("dashboard")}>Panel demostrativo</button><button onClick={() => go("design")}>Temas y estilo</button></div><small>© 2026 Fuerza Norte · Sitio demostrativo creado con Longhorn</small></footer>
  </div>;
}

function Modal({ title, eyebrow, close, children, wide = false }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="gym-theme gym-modal-stage"><button className="gym-modal-backdrop" aria-label="Cerrar" onClick={close} /><section className={`gym-modal ${wide ? "gym-modal-wide" : ""}`}><button className="gym-close" onClick={close} aria-label="Cerrar">×</button><GymBrand /><span className="gym-kicker">{eyebrow}</span><h2>{title}</h2>{children}</section></div>;
}

function Login({ go }: { go: (view: View) => void }) {
  const submit = (e: FormEvent) => { e.preventDefault(); go("dashboard"); };
  return <><Landing go={go} /><Modal eyebrow="Acceso demostrativo" title="Área de socios" close={() => go("landing")}><p className="gym-modal-copy">Usa cualquier correo y contraseña para explorar. No se guardan datos.</p><form onSubmit={submit} className="gym-form"><label>Correo<input required type="email" defaultValue="socio@fuerzanorte.cl" /></label><label>Contraseña<input required type="password" defaultValue="demo-fuerza" /></label><button className="gym-pill gym-primary" type="submit">Ingresar <span>→</span></button></form><button className="gym-text-button" onClick={() => go("onboarding")}>¿Aún no eres socio? Agenda una clase</button></Modal></>;
}

function Onboarding({ go }: { go: (view: View) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  return <Modal eyebrow={`Inscripción · Paso ${step} de 3`} title={step === 1 ? "Cuéntanos sobre ti" : step === 2 ? "Elige tu objetivo" : "Tu clase está casi lista"} close={() => go("landing")}>
    <div className="gym-progress"><i style={{ width: `${step * 33.333}%` }} /></div>
    {step === 1 && <div className="gym-form"><label>Nombre<input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" /></label><label>Nivel actual<select><option>Estoy comenzando</option><option>Entreno ocasionalmente</option><option>Entreno con frecuencia</option></select></label></div>}
    {step === 2 && <div className="gym-goals">{["Ganar fuerza", "Mejorar condición", "Moverme mejor"].map((goal,i) => <button className={i === 0 ? "selected" : ""} key={goal}><i>{i + 1}</i><b>{goal}</b><small>Plan adaptable</small></button>)}</div>}
    {step === 3 && <div className="gym-review"><span>CLASE DE PRUEBA</span><h3>{name || "Nuevo socio"}</h3><p>Entrenamiento funcional · Nivel inicial</p><div><i /> Solicitud preparada</div></div>}
    <div className="gym-form-actions">{step > 1 && <button className="gym-pill gym-outline" onClick={() => setStep(step - 1)}>Atrás</button>}<button className="gym-pill gym-primary" disabled={step === 1 && !name.trim()} onClick={() => step < 3 ? setStep(step + 1) : go("dashboard")}>{step < 3 ? "Continuar" : "Abrir panel demo"} <span>→</span></button></div>
  </Modal>;
}

function Video({ go }: { go: (view: View) => void }) {
  return <Modal eyebrow="Recorrido demostrativo" title="Así se vive Fuerza Norte" close={() => go("landing")} wide><p className="gym-modal-copy">Una vista breve del proceso de bienvenida y acompañamiento.</p><div className="gym-video"><span className="gym-play">▶</span>{[["1","Evalúa tu punto de partida"],["2","Entrena con un coach"],["3","Mide tu progreso"]].map(([n,t],i) => <div key={n} className={`gym-scene scene-${i + 1}`}><i>{n}</i><b>{t}</b></div>)}</div><div className="gym-form-actions"><button className="gym-pill gym-primary" onClick={() => go("onboarding")}>Agendar mi clase <span>→</span></button></div></Modal>;
}

function Dashboard({ go }: { go: (view: View) => void }) {
  const [tab, setTab] = useState("Resumen");
  return <div className="gym-theme gym-dashboard"><aside><GymBrand inverse /><div className="gym-user"><i>CM</i><span><b>Carlos Mendoza</b><small>Administrador</small></span></div><nav>{["Resumen","Clases","Socios","Mensajes","Configuración"].map((x,i) => <button className={tab === x ? "active" : ""} key={x} onClick={() => setTab(x)}><span>{["▦","◷","◎","○","⚙"][i]}</span>{x}</button>)}</nav><div className="gym-demo-note"><b>Modo demostración</b><p>Sin datos reales ni cambios persistentes.</p></div><button className="gym-exit" onClick={() => go("landing")}>← Volver al sitio</button></aside><main><header><div><span className="gym-kicker">Panel Fuerza Norte</span><h1>{tab}</h1></div><button className="gym-pill gym-outline" onClick={() => go("design")}>Temas y estilo</button></header>{tab === "Resumen" ? <GymOverview /> : <GymEmpty title={tab} />}</main></div>;
}

function GymOverview() {
  const [message, setMessage] = useState("La ocupación de hoy está dentro de lo esperado.");
  return <><div className="gym-notice"><span>↗</span><div><b>Buen día, Carlos</b><p>{message}</p></div></div><section className="gym-metrics">{[["Socios activos","342","+12 este mes"],["Clases hoy","8","76% ocupación"],["Pruebas pendientes","14","5 para confirmar"]].map(([k,v,s]) => <article key={k}><small>{k}</small><strong>{v}</strong><span>{s}</span></article>)}</section><div className="gym-dashboard-grid"><section className="gym-schedule"><div><div><small>AGENDA DE HOY</small><h2>Próximas clases</h2></div><button className="gym-pill gym-outline" onClick={() => setMessage("La creación de clases estará disponible cuando se apruebe el MVP.")}>+ Nueva clase</button></div>{[["17:00","Entrenamiento funcional","9 / 12"],["18:15","HIIT","12 / 12"],["19:30","Yoga & recovery","7 / 10"]].map(([time,name,spots]) => <article key={time}><strong>{time}</strong><span><b>{name}</b><small>Coach asignado</small></span><em>{spots}</em></article>)}</section><section className="gym-tasks"><h3>Acciones pendientes</h3>{["Confirmar clases de prueba","Revisar membresías por vencer","Publicar horario del sábado"].map((x,i) => <button key={x} onClick={() => setMessage(`${x}: acción demostrativa seleccionada.`)}><i>{i + 1}</i><span>{x}<small>{["5 solicitudes","8 socios","Antes del viernes"][i]}</small></span></button>)}</section></div></>;
}

function GymEmpty({ title }: { title: string }) { return <section className="gym-empty"><span>◇</span><h2>{title}</h2><p>Esta sección conserva la estructura del panel Longhorn. Su funcionalidad es demostrativa y se definirá durante la documentación del MVP.</p></section>; }

function Design({ go }: { go: (view: View) => void }) {
  return <div className="gym-theme gym-design"><header><GymBrand /><button className="gym-pill gym-outline" onClick={() => go("landing")}>← Volver al sitio</button></header><main><span className="gym-kicker">Sistema visual · Tema gimnasio</span><h1>Energía, claridad<br />y movimiento.</h1><p>Una variante de la estructura Longhorn con alto contraste, tipografía contundente y acentos eléctricos para representar actividad y progreso.</p><section><h2>Paleta</h2><div className="gym-swatches">{[["Carbón","#111412"],["Volt","#C8FF2E"],["Hueso","#F4F2EA"],["Acero","#D8DDD7"],["Blanco","#FFFFFF"]].map(([n,c]) => <article key={n}><i style={{background:c}} /><b>{n}</b><small>{c}</small></article>)}</div></section><section><h2>Componentes</h2><div className="gym-components"><button className="gym-pill gym-primary">Acción principal</button><button className="gym-pill gym-outline">Acción secundaria</button><span className="gym-kicker">Estado activo</span><div><small>OCUPACIÓN</small><strong>76%</strong><span>Clases de hoy</span></div></div></section></main></div>;
}

export default function GymPage() {
  const [view, setView] = useState<View>("landing");
  if (view === "login") return <Login go={setView} />;
  if (view === "onboarding") return <><Landing go={setView} /><Onboarding go={setView} /></>;
  if (view === "video") return <><Landing go={setView} /><Video go={setView} /></>;
  if (view === "dashboard") return <Dashboard go={setView} />;
  if (view === "design") return <Design go={setView} />;
  return <Landing go={setView} />;
}
