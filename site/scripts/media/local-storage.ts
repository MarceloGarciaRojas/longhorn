import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type {
  ObjectStorage,
  StoredObject,
  StoredObjectHead,
} from "../../src/media/storage";

const MARKER = ".nexi-media-test-root";
const SAFE_KEY =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}\/(?:original|variants\/(?:thumbnail|card|hero))\.webp$/i;

export class LocalStorageSafetyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LocalStorageSafetyError";
  }
}

export function resolveLocalMediaRoot(
  source: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const environment = source.APP_ENV?.trim() || "local";
  if (!["local", "test"].includes(environment)) {
    throw new LocalStorageSafetyError("media_local_provider_blocked");
  }
  const root = resolve(
    source.MEDIA_LOCAL_ROOT?.trim() ||
      resolve(tmpdir(), `nexi-media-${environment}`),
  );
  const workspace = resolve(process.cwd());
  const userRoot = resolve(homedir());
  const driveRoot = resolve(root.split(sep)[0] + sep);
  const normalized = root.toLowerCase();
  if (
    root === driveRoot ||
    root === userRoot ||
    root === workspace ||
    relative(workspace, root).split(sep)[0] !== ".." ||
    normalized.includes(`${sep}public${sep}`) ||
    normalized.includes(`${sep}onedrive${sep}`)
  ) {
    throw new LocalStorageSafetyError("media_local_root_unsafe");
  }
  return root;
}

export function assertStorageKey(key: string): void {
  if (
    !key ||
    key.length > 1024 ||
    isAbsolute(key) ||
    key.includes("\\") ||
    key.includes("..") ||
    !SAFE_KEY.test(key)
  ) {
    throw new LocalStorageSafetyError("media_object_key_invalid");
  }
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(readonly root = resolveLocalMediaRoot()) {}

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(resolve(this.root, MARKER), "nexi synthetic media root\n", {
      flag: "a",
      encoding: "utf8",
    });
  }

  private path(key: string): string {
    assertStorageKey(key);
    const target = resolve(this.root, ...key.split("/"));
    const inside = relative(this.root, target);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
      throw new LocalStorageSafetyError("media_path_traversal");
    }
    return target;
  }

  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<StoredObjectHead> {
    if (contentType !== "image/webp") {
      throw new LocalStorageSafetyError("media_content_type_invalid");
    }
    await this.initialize();
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { flag: "w" });
    return {
      byteSize: body.byteLength,
      contentType,
      etag: createHash("sha256").update(body).digest("hex"),
    };
  }

  async read(key: string): Promise<StoredObject> {
    const body = await readFile(this.path(key)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new LocalStorageSafetyError("media_not_found");
      }
      throw error;
    });
    return {
      body,
      byteSize: body.byteLength,
      contentType: "image/webp",
      etag: createHash("sha256").update(body).digest("hex"),
    };
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    try {
      const info = await stat(this.path(key));
      if (!info.isFile()) return null;
      const object = await this.read(key);
      return {
        byteSize: object.byteSize,
        contentType: object.contentType,
        etag: object.etag,
      };
    } catch (error) {
      if (
        error instanceof LocalStorageSafetyError &&
        error.code === "media_not_found"
      ) {
        return null;
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async cleanTestRoot(): Promise<void> {
    const root = resolve(this.root);
    const marker = resolve(root, MARKER);
    if (
      !["local", "test"].includes(process.env.APP_ENV?.trim() || "local") ||
      !root.toLowerCase().includes("nexi-media") ||
      root === resolve(tmpdir()) ||
      root === resolve(homedir())
    ) {
      throw new LocalStorageSafetyError("media_clean_target_unsafe");
    }
    await access(marker).catch(() => {
      throw new LocalStorageSafetyError("media_clean_marker_missing");
    });
    await rm(root, { recursive: true });
  }
}
