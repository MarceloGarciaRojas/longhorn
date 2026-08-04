export const MEDIA_VARIANTS = ["thumbnail", "card", "hero"] as const;
export const MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type MediaVariantName = (typeof MEDIA_VARIANTS)[number];
export type MediaAllowedMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];
export type MediaAssetStatus =
  | "processing"
  | "ready"
  | "rejected"
  | "failed"
  | "archived";

export interface MediaUsage {
  assetId: string;
  altText: string;
  decorative: boolean;
}

export interface MediaVariantRecord {
  name: MediaVariantName;
  checksum: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: "image/webp";
}

export interface MediaAssetRecord {
  id: string;
  siteId: string;
  sourceKind: "bundled" | "uploaded";
  originalFilename: string;
  displayName: string;
  defaultAltText: string;
  detectedMimeType: MediaAllowedMimeType;
  byteSize: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  status: MediaAssetStatus;
  rejectionCode: string | null;
  version: number;
  createdAt: Date;
  variants: MediaVariantRecord[];
  referenceCount: number;
}

export interface MediaQuota {
  enabled: boolean;
  assetLimit: number;
  storageBytes: number;
  uploadMaxBytes: number;
  allowedMimeTypes: MediaAllowedMimeType[];
  usedAssets: number;
  usedBytes: number;
}

export interface MediaLibraryPage {
  siteId: string;
  siteName: string;
  assets: MediaAssetRecord[];
  quota: MediaQuota;
  page: number;
  pageSize: number;
  total: number;
  search: string;
  status: MediaAssetStatus | "all";
}

export interface MediaRenderVariant {
  url: string;
  width: number;
  height: number;
}

export type MediaRenderManifest = Record<
  string,
  Partial<Record<MediaVariantName, MediaRenderVariant>>
>;
