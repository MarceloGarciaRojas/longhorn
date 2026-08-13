import Image from "next/image";
import type { MediaRenderManifest } from "@/src/media/types";
import type { GymContentV1 } from "../types";
import { GymPulsoClassBrowser } from "./gym-pulso-class-browser";
import {
  GymPulsoView,
  type PulsoClassName,
  type PulsoImageComponent,
} from "./gym-pulso-view";
import styles from "./gym-pulso.module.css";

const resolveClassName: PulsoClassName = (token) =>
  styles[token as keyof typeof styles] ?? "";

const NextPulsoImage: PulsoImageComponent = ({ alt, ...props }) => (
  <Image {...props} alt={alt} unoptimized />
);

export function GymPulsoRenderer({
  content,
  media,
  preview = false,
}: {
  content: GymContentV1;
  media: MediaRenderManifest;
  preview?: boolean;
}) {
  return (
    <GymPulsoView
      content={content}
      media={media}
      preview={preview}
      className={resolveClassName}
      ImageComponent={NextPulsoImage}
      ClassBrowserComponent={GymPulsoClassBrowser}
    />
  );
}
