export default function AdminLoading() {
  return (
    <main className="admin-content" aria-busy="true">
      <div className="admin-skeleton wide" />
      <div className="metric-grid">
        <div className="admin-skeleton card" />
        <div className="admin-skeleton card" />
        <div className="admin-skeleton card" />
      </div>
      <p className="sr-only">Cargando información operativa</p>
    </main>
  );
}
