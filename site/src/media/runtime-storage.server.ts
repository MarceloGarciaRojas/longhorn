import "server-only";

import { loadMediaConfig } from "./config";
import { readLocalMedia } from "./local-client.server";
import type { StoredObject } from "./storage";
import { SupabaseObjectStorage } from "./supabase-storage";

function supabaseStorage(): SupabaseObjectStorage {
  const config = loadMediaConfig();
  if (
    config.provider !== "supabase" ||
    !config.supabaseUrl ||
    !config.supabaseSecretKey ||
    !config.supabaseBucket
  ) {
    throw new Error("media_supabase_config_unavailable");
  }
  return new SupabaseObjectStorage(
    config.supabaseUrl,
    config.supabaseBucket,
    config.supabaseSecretKey,
  );
}

export async function readConfiguredMedia(key: string): Promise<StoredObject> {
  const config = loadMediaConfig();
  if (config.provider === "local") return readLocalMedia(key);
  if (config.provider === "supabase") return supabaseStorage().read(key);
  throw new Error("media_provider_unavailable");
}
