import assert from "node:assert/strict";
import test from "node:test";

import { DatabaseConfigError } from "../../src/db/config";
import { resolveApplicationDatabaseUrl } from "../../src/db/runtime-connection.server";

test("local and test database resolution never loads Cloudflare bindings", async () => {
  let bindingLoads = 0;
  const value = await resolveApplicationDatabaseUrl(
    {
      APP_ENV: "test",
      DATABASE_URL: "postgresql://nexi_app:secret@127.0.0.1/nexi_test",
    },
    async () => {
      bindingLoads += 1;
      return {};
    },
  );
  assert.equal(value, "postgresql://nexi_app:secret@127.0.0.1/nexi_test");
  assert.equal(bindingLoads, 0);
});

test("alpha resolves only a non-empty Hyperdrive binding", async () => {
  const value = await resolveApplicationDatabaseUrl(
    { APP_ENV: "alpha" },
    async () => ({
      HYPERDRIVE: {
        connectionString:
          "postgresql://nexi_app:secret@hyperdrive.local/database",
      },
    }),
  );
  assert.equal(
    value,
    "postgresql://nexi_app:secret@hyperdrive.local/database",
  );

  await assert.rejects(
    () => resolveApplicationDatabaseUrl({ APP_ENV: "alpha" }, async () => ({})),
    DatabaseConfigError,
  );
  await assert.rejects(
    () =>
      resolveApplicationDatabaseUrl({ APP_ENV: "alpha" }, async () => {
        throw new Error("binding unavailable");
      }),
    /alpha runtime binding is unavailable/,
  );
});
