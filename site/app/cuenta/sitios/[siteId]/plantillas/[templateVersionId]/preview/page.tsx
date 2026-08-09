import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuthSession } from "@/src/auth/session.server";
import { clientPreviewAlternativeTemplate } from "@/src/content/service.server";
import { renderRegisteredTemplate } from "@/src/content/renderer-registry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Vista previa de plantilla | nexi",
  robots: { index: false, follow: false },
};

export default async function AlternativeTemplatePreview({
  params,
}: {
  params: Promise<{ siteId: string; templateVersionId: string }>;
}) {
  const session = await requireAuthSession("client_admin");
  const { siteId, templateVersionId } = await params;
  const preview = await clientPreviewAlternativeTemplate(
    session,
    siteId,
    templateVersionId,
  );
  if (!preview) notFound();
  return renderRegisteredTemplate({
    rendererKey: preview.option.rendererKey,
    industryKey: preview.option.industryKey,
    schemaKey: preview.draft.schemaKey,
    schemaVersion: preview.draft.schemaVersion,
    content: preview.draft.content,
    media: preview.media,
    preview: true,
    validationMode: "draft",
  });
}
