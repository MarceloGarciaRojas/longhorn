import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertStorageKey,
  LocalObjectStorage,
  LocalStorageSafetyError,
  resolveLocalMediaRoot,
} from "../../scripts/media/local-storage";

const KEY =
  "11111111-1111-4111-8111-111111111111/" +
  "22222222-2222-4222-8222-222222222222/" +
  "33333333-3333-4333-8333-333333333333/" +
  `${"a".repeat(64)}/variants/thumbnail.webp`;

test("local adapter writes, reads and safely cleans a marked test root", async () => {
  const parent = await mkdtemp(resolve(tmpdir(), "nexi-media-test-suite-"));
  const root = resolve(parent, "nexi-media-storage");
  const storage = new LocalObjectStorage(root);
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await storage.put(KEY, bytes, "image/webp");
  assert.deepEqual(
    Array.from((await storage.read(KEY)).body),
    Array.from(bytes),
  );
  assert.equal(await storage.exists(KEY), true);
  await storage.delete(KEY);
  assert.equal(await storage.exists(KEY), false);
  await storage.cleanTestRoot();
  await assert.rejects(() => storage.read(KEY), LocalStorageSafetyError);
});

test("path traversal, absolute paths and repository roots are rejected", () => {
  for (const key of ["../secret", "C:\\secret", "/etc/passwd", "a/../../b"]) {
    assert.throws(() => assertStorageKey(key), LocalStorageSafetyError);
  }
  assert.throws(
    () => resolveLocalMediaRoot({ APP_ENV: "test", MEDIA_LOCAL_ROOT: process.cwd() }),
    LocalStorageSafetyError,
  );
  assert.throws(
    () => resolveLocalMediaRoot({
      APP_ENV: "production",
      MEDIA_LOCAL_ROOT: resolve(tmpdir(), "nexi-media-production"),
    }),
    /blocked/,
  );
});
