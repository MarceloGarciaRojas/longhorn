import assert from "node:assert/strict";
import test from "node:test";
import type { AuthSession } from "../../src/auth/types";
import { listMediaLibrary } from "../../src/media/service.server";
import { uploadMedia } from "../../src/media/service.server";
import { withClientOperation } from "../../src/operations/contexts.server";
import { SYNTHETIC_DATA } from "../../scripts/db/seed";
import { createLocalMediaServer } from "../../scripts/media/local-service";
// @ts-expect-error sharp 0.35 declarations are outside its ESM export map
import sharp from "sharp";

function session(
  user: { id: string; email: string; displayName: string },
  tenantId: string,
): AuthSession {
  return {
    sessionId: crypto.randomUUID(),
    userId: user.id,
    identityProvider: "test",
    identitySubject: `subject-${user.id}`,
    email: user.email,
    displayName: user.displayName,
    audience: "client_admin",
    assuranceLevel: "aal1",
    activeTenantId: tenantId,
    activeTenantName: "Synthetic tenant",
    expiresAt: new Date(Date.now() + 60_000),
  };
}

test("media library is paginated and isolated by tenant and site", async () => {
  const clientA = session(SYNTHETIC_DATA.userA, SYNTHETIC_DATA.tenantA.id);
  const clientB = session(SYNTHETIC_DATA.userB, SYNTHETIC_DATA.tenantB.id);
  const libraryA = await listMediaLibrary(clientA, {
    siteId: SYNTHETIC_DATA.siteA.id,
    page: 1,
    pageSize: 2,
  });
  const libraryB = await listMediaLibrary(clientB, {
    siteId: SYNTHETIC_DATA.siteB.id,
    search: "restaurant hero",
    status: "ready",
  });
  assert.ok(libraryA);
  assert.ok(libraryB);
  assert.equal(libraryA.assets.length, 2);
  assert.equal(libraryB.assets.length, 1);
  assert.equal(libraryA.assets.every((asset) => asset.siteId === SYNTHETIC_DATA.siteA.id), true);
  assert.equal(libraryB.assets.every((asset) => asset.siteId === SYNTHETIC_DATA.siteB.id), true);
  const cross = await listMediaLibrary(clientA, {
    siteId: SYNTHETIC_DATA.siteB.id,
  }).catch(() => null);
  assert.equal(cross, null);
  assert.equal(
    libraryA.assets.some((asset) => libraryB.assets.some((other) => other.id === asset.id)),
    false,
  );
});

test("RLS prevents reading another tenant asset by known UUID", async () => {
  const clientA = session(SYNTHETIC_DATA.userA, SYNTHETIC_DATA.tenantA.id);
  const foreign = await withClientOperation(
    clientA,
    "media-cross-test",
    async (client) => client.query(
      `SELECT id FROM public.media_assets WHERE site_id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    ),
  );
  assert.equal(foreign.rowCount, 0);
});

test("authenticated upload reserves quota and reaches ready atomically", async () => {
  process.env.APP_ENV = "test";
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  const server = createLocalMediaServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  process.env.MEDIA_LOCAL_SERVICE_URL = `http://127.0.0.1:${address.port}`;
  const bytes = await sharp({
    create: { width: 480, height: 320, channels: 4, background: "#237966" },
  }).png().toBuffer();
  try {
    const assetId = await uploadMedia(
      session(SYNTHETIC_DATA.userB, SYNTHETIC_DATA.tenantB.id),
      {
        siteId: SYNTHETIC_DATA.siteB.id,
        idempotencyKey: crypto.randomUUID(),
        filename: "integration.png",
        declaredMimeType: "image/png",
        bytes,
        correlationId: "media-upload-integration",
      },
    );
    const state = await withClientOperation(
      session(SYNTHETIC_DATA.userB, SYNTHETIC_DATA.tenantB.id),
      "media-upload-state",
      (client) => client.query(
        `SELECT status,(SELECT count(*)::int FROM public.media_variants
          WHERE asset_id=$1) AS variants
         FROM public.media_assets WHERE id=$1`,
        [assetId],
      ),
    );
    assert.deepEqual(state.rows[0], { status: "ready", variants: 3 });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
