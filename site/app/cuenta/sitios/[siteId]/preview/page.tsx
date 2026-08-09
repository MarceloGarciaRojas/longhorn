import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuthSession } from "@/src/auth/session.server";
import { clientPreviewContent } from "@/src/content/service.server";
import { renderRegisteredTemplate } from "@/src/content/renderer-registry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vista previa privada | nexi",
  robots: { index: false, follow: false },
};

export default async function ContentPreviewPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireAuthSession("client_admin");
  const { siteId } = await params;
  const preview = await clientPreviewContent(session, siteId);
  if (!preview) notFound();
  return renderRegisteredTemplate({
    rendererKey: preview.assignment.rendererKey,
    industryKey: preview.assignment.industryKey,
    schemaKey: preview.draft.schemaKey,
    schemaVersion: preview.draft.schemaVersion,
    content: preview.draft.content,
    preview: true,
    validationMode: "draft",
    media: preview.media,
  });
}
