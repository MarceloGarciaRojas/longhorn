import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthSession } from "@/src/auth/session.server";
import { listMediaLibrary } from "@/src/media/service.server";
import { ClientPageHeader } from "../../../ui";
import { MediaLibraryClient } from "./media-library-client";

export const dynamic = "force-dynamic";

export default async function MediaLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const session = await requireAuthSession("client_admin");
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
    <>
      <ClientPageHeader
        eyebrow="Mis sitios"
        title={`Multimedia de ${library.siteName}`}
        description="Activos aislados por empresa y sitio."
        action={<Link href={`/cuenta/sitios/${siteId}`}>Volver al sitio</Link>}
      />
      <MediaLibraryClient library={library} />
    </>
  );
}
