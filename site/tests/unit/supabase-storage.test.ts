import assert from "node:assert/strict";
import test from "node:test";

import { MediaStorageSafetyError } from "../../src/media/storage-key";
import { SupabaseObjectStorage } from "../../src/media/supabase-storage";

const KEY =
  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/variants/card.webp";

test("Supabase storage keeps credentials server-side and preserves bytes", async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (init?.method === "POST") {
      return new Response("{}", { status: 200, headers: { etag: '"fixture"' } });
    }
    if (init?.method === "DELETE") return new Response("[]", { status: 200 });
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": "image/webp", etag: '"fixture"' },
    });
  };
  const storage = new SupabaseObjectStorage(
    "https://project.supabase.co",
    "nexi-alpha-media",
    "server-secret-fixture",
    request,
  );

  assert.equal((await storage.put(KEY, bytes, "image/webp")).etag, "fixture");
  assert.deepEqual((await storage.read(KEY)).body, bytes);
  await storage.delete(KEY);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(new Headers(call.init?.headers).get("apikey"), "server-secret-fixture");
    assert.ok(!call.url.includes("server-secret-fixture"));
  }
});

test("Supabase storage rejects unsafe keys and non-WebP content", async () => {
  const storage = new SupabaseObjectStorage(
    "https://project.supabase.co",
    "nexi-alpha-media",
    "server-secret-fixture",
    async () => new Response(null, { status: 500 }),
  );
  await assert.rejects(
    () => storage.read("../tenant/private.webp"),
    MediaStorageSafetyError,
  );
  await assert.rejects(
    () => storage.put(KEY, new Uint8Array(), "image/svg+xml"),
    /media_content_type_invalid/,
  );
});
