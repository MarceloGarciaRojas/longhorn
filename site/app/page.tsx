const benefits = [
  {
    number: "01",
    title: "Control centralizado",
    copy: "Ventas, tareas y operación en un solo lugar, con la información importante siempre a la vista.",
  },
  {
    number: "02",
    title: "Visibilidad real",
    copy: "Indicadores claros para entender qué está pasando hoy y dónde necesita atención tu negocio.",
  },
  {
    number: "03",
    title: "Decisiones claras",
    copy: "Menos intuición dispersa y más contexto para priorizar, coordinar al equipo y avanzar con confianza.",
  },
];

const steps = [
  ["01", "Entendemos tu operación", "Partimos por el flujo real de tu pyme, sin obligarte a adaptar el negocio a una herramienta genérica."],
  ["02", "Configuramos tu espacio", "Preparamos una experiencia ordenada con la plantilla adecuada para tu rubro piloto."],
  ["03", "Acompañamos la adopción", "Tu equipo comienza con foco y soporte, mientras Longhorn convierte la gestión diaria en información útil."],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Longhorn, inicio">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>LONGHORN</span>
        </a>
        <nav className="main-nav" aria-label="Navegación principal">
          <a href="#solucion">Solución</a>
          <a href="#metodo">Cómo funciona</a>
          <a href="#nosotros">Nosotros</a>
        </nav>
        <div className="header-actions">
          <a className="text-link" href="#panel">Ingresar al panel</a>
          <a className="button button-small" href="#contacto">Solicitar una demo</a>
        </div>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-copy">
          <p className="eyebrow">Gestión empresarial para pymes</p>
          <h1>Orden para hoy.<br /><em>Impulso para crecer.</em></h1>
          <p className="hero-lead">
            Longhorn reúne la gestión de tu negocio en una plataforma clara,
            profesional y preparada para acompañar cada nueva etapa.
          </p>
          <div className="hero-actions">
            <a className="button" href="#contacto">Solicitar una demo <span aria-hidden="true">↗</span></a>
            <a className="arrow-link" href="#solucion">Conocer la solución <span aria-hidden="true">→</span></a>
          </div>
          <div className="hero-proof" aria-label="Principios del servicio">
            <span>Simple de adoptar</span>
            <span>Diseñado para pymes</span>
            <span>Acompañamiento cercano</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Vista conceptual del panel Longhorn">
          <div className="visual-topline">
            <span>Resumen ejecutivo</span>
            <span className="status-dot">Operación al día</span>
          </div>
          <p className="visual-label">Visión general</p>
          <div className="metric-row">
            <div><small>Ventas del mes</small><strong>$ 12,4M</strong><span>↑ 8,4%</span></div>
            <div><small>Clientes activos</small><strong>248</strong><span>↑ 12 nuevos</span></div>
          </div>
          <div className="chart-panel">
            <div className="chart-copy"><small>Rendimiento</small><strong>Una operación que avanza</strong></div>
            <div className="chart" aria-hidden="true">
              <i style={{ height: "32%" }}></i><i style={{ height: "46%" }}></i><i style={{ height: "40%" }}></i>
              <i style={{ height: "63%" }}></i><i style={{ height: "57%" }}></i><i style={{ height: "78%" }}></i>
              <i className="active" style={{ height: "91%" }}></i>
            </div>
          </div>
          <div className="activity-line"><span className="activity-icon">✓</span><span><strong>Seguimiento comercial</strong><small>Equipo coordinado · actualizado ahora</small></span><b>94%</b></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Propuesta de confianza">
        <p>Una plataforma seria para negocios que quieren dar el siguiente paso.</p>
        <div><span>Claridad</span><span>Control</span><span>Continuidad</span><span>Confianza</span></div>
      </section>

      <section className="section benefits" id="solucion">
        <div className="section-heading">
          <p className="eyebrow">Todo lo importante, en contexto</p>
          <h2>Tu negocio se vuelve más claro cuando la información deja de estar dispersa.</h2>
        </div>
        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article key={benefit.number}>
              <span className="number">{benefit.number}</span>
              <div className="benefit-symbol" aria-hidden="true"><span></span><span></span><span></span></div>
              <h3>{benefit.title}</h3>
              <p>{benefit.copy}</p>
              <a href="#contacto" aria-label={`Conocer más sobre ${benefit.title}`}>Conocer más <span aria-hidden="true">→</span></a>
            </article>
          ))}
        </div>
      </section>

      <section className="statement" id="nosotros">
        <p className="eyebrow light">Una relación, no solo una herramienta</p>
        <blockquote>“La tecnología debe quitar complejidad del camino, no agregarla.”</blockquote>
        <p>Longhorn combina software claro con una forma de trabajo cercana, responsable y pensada para la realidad de las pymes.</p>
      </section>

      <section className="section method" id="metodo">
        <div className="method-intro">
          <p className="eyebrow">Cómo trabajamos</p>
          <h2>Un comienzo simple.<br />Una base sólida.</h2>
          <p>No prometemos transformar todo de un día para otro. Construimos orden paso a paso, con foco en lo que genera valor.</p>
        </div>
        <div className="steps">
          {steps.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section" id="contacto">
        <div>
          <p className="eyebrow">Conversemos sobre tu negocio</p>
          <h2>Da el primer paso hacia una gestión más clara.</h2>
        </div>
        <div className="cta-copy">
          <p>Cuéntanos cómo funciona hoy tu pyme. Te mostraremos cómo Longhorn puede ayudarte a ordenar la operación y preparar el crecimiento.</p>
          <a className="button button-light" href="#inicio">Solicitar una demo <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className="panel-access" id="panel">
        <div><span className="brand-mark inverse" aria-hidden="true">L</span><p><strong>¿Ya eres cliente?</strong><br />Accede a tu espacio de trabajo seguro.</p></div>
        <a className="outline-button" href="#panel" aria-label="Ingresar al panel de clientes, próximamente">Ingresar al panel <span aria-hidden="true">→</span></a>
      </section>

      <footer>
        <div className="footer-main">
          <div><a className="brand footer-brand" href="#inicio"><span className="brand-mark">L</span><span>LONGHORN</span></a><p>Gestión empresarial clara para pymes que quieren crecer con control.</p></div>
          <div><h3>Explora</h3><a href="#solucion">Solución</a><a href="#metodo">Cómo funciona</a><a href="#nosotros">Nosotros</a></div>
          <div><h3>Contacto</h3><a href="#contacto">Solicitar una demo</a><span>Canal comercial por definir</span></div>
        </div>
        <div className="footer-bottom"><span>© 2026 Longhorn. Todos los derechos reservados.</span><span>Privacidad · Términos</span></div>
      </footer>
    </main>
  );
}
