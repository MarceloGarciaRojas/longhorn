import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthSession } from "@/src/auth/session.server";
import { listMediaLibrary } from "@/src/media/service.server";
import { MediaLibraryClient } from "@/app/cuenta/sitios/[siteId]/multimedia/media-library-client";
import { PageHeader } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function AdminMediaLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const session = await requireAuthSession("nexi_admin");
  const { siteId } = await params;
  const query = await searchParams;
  const library = await listMediaLibrary(session, {
    siteId,
    search: query.q,
    status: query.status,
    page: Number(query.page || 1),
  });
  if (!library) notFound();
  return (
    <main className="admin-content">
      <PageHeader
        eyebrow="Sitios"
        title={`Multimedia de ${library.siteName}`}
        description="Carga operativa en representación del cliente, con AAL2, cuotas y auditoría."
        action={<Link className="admin-button secondary" href={`/nexi-interno/sitios/${siteId}`}>Volver</Link>}
      />
      <MediaLibraryClient library={library} endpoint="/api/media/admin" />
    </main>
  );
}
