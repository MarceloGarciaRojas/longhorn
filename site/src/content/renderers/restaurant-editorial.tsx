import Image from "next/image";
import type { MediaRenderManifest } from "@/src/media/types";
import type { RestaurantContentV2 } from "../types";
import {
  RestaurantEditorialView,
  type EditorialClassName,
  type EditorialImageComponent,
} from "./restaurant-editorial-view";
import styles from "./restaurant-editorial.module.css";

const resolveClassName: EditorialClassName = (token) =>
  styles[token as keyof typeof styles] ?? "";

const NextEditorialImage: EditorialImageComponent = ({ alt, ...props }) => (
  <Image {...props} alt={alt} unoptimized />
);

export function RestaurantEditorialRenderer({
  content,
  media,
  preview = false,
}: {
  content: RestaurantContentV2;
  media: MediaRenderManifest;
  preview?: boolean;
}) {
  return (
    <RestaurantEditorialView
      content={content}
      media={media}
      preview={preview}
      className={resolveClassName}
      ImageComponent={NextEditorialImage}
    />
  );
}
