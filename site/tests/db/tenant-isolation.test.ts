import assert from "node:assert/strict";
import test from "node:test";

import type { PoolClient } from "pg";

import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import {
  InvalidTenantContextError,
  TenantContextRejectedError,
  withTenantContext,
} from "../../src/db/tenant-context";
import {
  getCurrentTenant,
  getMembershipById,
  getTenantById,
  getVisibleUserById,
  listCurrentTenantMemberships,
  listVisibleUsers,
} from "../../src/db/tenant-repository";
import { SYNTHETIC_DATA } from "../../scripts/db/seed";

interface PostgreSqlError extends Error {
  code?: string;
}

async function expectPgCode(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    return (error as PostgreSqlError).code === expectedCode;
  });
}

function contextFor(side: "A" | "B") {
  const data = SYNTHETIC_DATA;
  return side === "A"
    ? {
        tenantId: data.tenantA.id,
        actorUserId: data.userA.id,
        correlationId: "tenant-a-isolation-test",
      }
    : {
        tenantId: data.tenantB.id,
        actorUserId: data.userB.id,
        correlationId: "tenant-b-isolation-test",
      };
}

async function backendPid(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  return result.rows[0].pid;
}

test("the restricted application role is isolated by PostgreSQL RLS", async (t) => {
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("test"),
    applicationName: "nexi-tenant-isolation",
    maxConnections: 1,
  });
  t.after(async () => {
    await pool.end();
  });

  await t.test("uses the restricted application role", async () => {
    const role = await pool.query<{
      roleName: string;
      superuser: boolean;
      bypassRls: boolean;
      createRole: boolean;
      createDb: boolean;
    }>(
      `SELECT
         rolname AS "roleName",
         rolsuper AS superuser,
         rolbypassrls AS "bypassRls",
         rolcreaterole AS "createRole",
         rolcreatedb AS "createDb"
       FROM pg_catalog.pg_roles
       WHERE rolname = current_user`,
    );
    assert.deepEqual(role.rows[0], {
      roleName: "nexi_app",
      superuser: false,
      bypassRls: false,
      createRole: false,
      createDb: false,
    });

    const owners = await pool.query<{ ownerName: string }>(
      `SELECT DISTINCT owner.rolname AS "ownerName"
       FROM pg_catalog.pg_class AS relation
       JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
       WHERE relation.relnamespace = 'public'::regnamespace
         AND relation.relname IN ('tenants', 'users', 'tenant_memberships')`,
    );
    assert.ok(owners.rows.every((row) => row.ownerName === "nexi_migrator"));

    await expectPgCode(
      () => pool.query("CREATE TABLE public.forbidden_table (id integer)"),
      "42501",
    );
    await expectPgCode(
      () => pool.query("ALTER TABLE public.tenants ADD COLUMN forbidden text"),
      "42501",
    );
    await expectPgCode(
      () => pool.query("SELECT token_hash FROM public.auth_sessions"),
      "42501",
    );
    await expectPgCode(
      () => pool.query("SELECT provider_subject FROM public.auth_identities"),
      "42501",
    );

    const client = await pool.connect();
    try {
      await client.query("SET row_security = off");
      await expectPgCode(
        () => client.query("SELECT id FROM public.tenants"),
        "42501",
      );
    } finally {
      await client.query("SET row_security = on");
      client.release();
    }
  });

  await t.test("fails closed without a trusted context", async () => {
    const [tenants, users, memberships] = await Promise.all([
      pool.query("SELECT id FROM public.tenants"),
      pool.query("SELECT id FROM public.users"),
      pool.query("SELECT id FROM public.tenant_memberships"),
    ]);
    assert.equal(tenants.rowCount, 0);
    assert.equal(users.rowCount, 0);
    assert.equal(memberships.rowCount, 0);

    await assert.rejects(
      () =>
        withTenantContext(
          pool,
          {
            tenantId: "not-a-uuid",
            actorUserId: SYNTHETIC_DATA.userA.id,
            correlationId: "invalid-tenant-test",
          },
          getCurrentTenant,
        ),
      InvalidTenantContextError,
    );

    await assert.rejects(
      () =>
        withTenantContext(
          pool,
          {
            tenantId: SYNTHETIC_DATA.tenantA.id,
            actorUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            correlationId: "invalid-user-test",
          },
          getCurrentTenant,
        ),
      TenantContextRejectedError,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.current_tenant_id', 'invalid-uuid', true)",
      );
      await expectPgCode(
        () => client.query("SELECT id FROM public.tenants"),
        "22P02",
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  await t.test("Tenant A sees only Tenant A despite known UUIDs", async () => {
    await withTenantContext(pool, contextFor("A"), async (client) => {
      const currentTenant = await getCurrentTenant(client);
      assert.equal(currentTenant?.id, SYNTHETIC_DATA.tenantA.id);
      assert.equal(
        (await listCurrentTenantMemberships(client)).length,
        2,
      );
      assert.equal((await listVisibleUsers(client)).length, 2);

      assert.equal(
        await getTenantById(client, SYNTHETIC_DATA.tenantB.id),
        null,
      );
      assert.equal(
        await getMembershipById(client, SYNTHETIC_DATA.membershipB.id),
        null,
      );
      assert.equal(
        await getVisibleUserById(client, SYNTHETIC_DATA.userB.id),
        null,
      );
    });
  });

  await t.test("Tenant B sees only Tenant B despite known UUIDs", async () => {
    await withTenantContext(pool, contextFor("B"), async (client) => {
      const currentTenant = await getCurrentTenant(client);
      assert.equal(currentTenant?.id, SYNTHETIC_DATA.tenantB.id);
      assert.equal(
        (await listCurrentTenantMemberships(client)).length,
        2,
      );
      assert.equal((await listVisibleUsers(client)).length, 2);

      assert.equal(
        await getTenantById(client, SYNTHETIC_DATA.tenantA.id),
        null,
      );
      assert.equal(
        await getMembershipById(client, SYNTHETIC_DATA.membershipA.id),
        null,
      );
      assert.equal(
        await getVisibleUserById(client, SYNTHETIC_DATA.userA.id),
        null,
      );
    });
  });

  await t.test("cross-tenant writes are rejected", async () => {
    await expectPgCode(
      () =>
        withTenantContext(pool, contextFor("A"), async (client) => {
          await client.query(
            `INSERT INTO public.tenant_memberships
               (id, tenant_id, user_id, status)
             VALUES ($1, $2, $3, 'active')`,
            [
              "c3333333-3333-4333-8333-333333333333",
              SYNTHETIC_DATA.tenantB.id,
              SYNTHETIC_DATA.userA.id,
            ],
          );
        }),
      "42501",
    );

    await expectPgCode(
      () =>
        withTenantContext(pool, contextFor("A"), async (client) => {
          await client.query(
            `INSERT INTO public.tenant_memberships
               (id, tenant_id, user_id, status)
             VALUES ($1, $2, $3, 'active')`,
            [
              "d4444444-4444-4444-8444-444444444444",
              SYNTHETIC_DATA.tenantA.id,
              SYNTHETIC_DATA.userB.id,
            ],
          );
        }),
      "42501",
    );

    const updateOther = await withTenantContext(
      pool,
      contextFor("A"),
      (client) =>
        client.query(
          `UPDATE public.tenant_memberships
           SET status = 'disabled'
           WHERE id = $1`,
          [SYNTHETIC_DATA.membershipB.id],
        ),
    );
    assert.equal(updateOther.rowCount, 0);

    await expectPgCode(
      () =>
        withTenantContext(pool, contextFor("A"), async (client) => {
          await client.query(
            `UPDATE public.tenant_memberships
             SET tenant_id = $1
             WHERE id = $2`,
            [SYNTHETIC_DATA.tenantB.id, SYNTHETIC_DATA.membershipA.id],
          );
        }),
      "42501",
    );

    const deleteOther = await withTenantContext(
      pool,
      contextFor("A"),
      (client) =>
        client.query(
          "DELETE FROM public.tenant_memberships WHERE id = $1",
          [SYNTHETIC_DATA.membershipB.id],
        ),
    );
    assert.equal(deleteOther.rowCount, 0);
  });

  await t.test("transaction-local context does not leak through the pool", async () => {
    const tenantAPid = await withTenantContext(
      pool,
      contextFor("A"),
      async (client) => {
        assert.equal((await getCurrentTenant(client))?.id, SYNTHETIC_DATA.tenantA.id);
        return backendPid(client);
      },
    );

    const client = await pool.connect();
    let cleanPid: number;
    try {
      const clean = await client.query<{
        pid: number;
        tenantId: string | null;
        userId: string | null;
      }>(
        `SELECT
           pg_backend_pid() AS pid,
           nullif(current_setting('app.current_tenant_id', true), '') AS "tenantId",
           nullif(current_setting('app.current_user_id', true), '') AS "userId"`,
      );
      cleanPid = clean.rows[0].pid;
      assert.equal(clean.rows[0].tenantId, null);
      assert.equal(clean.rows[0].userId, null);
    } finally {
      client.release();
    }
    assert.equal(cleanPid, tenantAPid);

    const tenantBPid = await withTenantContext(
      pool,
      contextFor("B"),
      async (tenantBClient) => {
        assert.equal(
          (await getCurrentTenant(tenantBClient))?.id,
          SYNTHETIC_DATA.tenantB.id,
        );
        assert.equal(
          await getTenantById(tenantBClient, SYNTHETIC_DATA.tenantA.id),
          null,
        );
        return backendPid(tenantBClient);
      },
    );
    assert.equal(tenantBPid, tenantAPid);
  });
});
