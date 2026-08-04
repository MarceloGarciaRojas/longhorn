import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import { seedSyntheticData } from "../db/seed";

function assertLocalOrTest(): void {
  const environment = process.env.APP_ENV?.trim() || "local";
  if (environment !== "local" && environment !== "test") {
    throw new Error("This command is restricted to local or test environments");
  }
}

async function main(): Promise<void> {
  assertLocalOrTest();
  const command = process.argv[2];
  if (command === "seed-local") {
    await seedSyntheticData(readDatabaseUrl("migration"));
    console.log("Synthetic administrator and tenant data are ready.");
    return;
  }
  if (command === "expire-local") {
    const pool = createDatabasePool({
      connectionString: readDatabaseUrl("migration"),
      applicationName: "nexi-local-invitation-expiry",
      maxConnections: 1,
    });
    try {
      const result = await pool.query(
        `UPDATE public.tenant_invitations
         SET status = 'expired'
         WHERE status = 'pending'
           AND expires_at <= transaction_timestamp()`,
      );
      console.log(`Expired invitations: ${result.rowCount ?? 0}`);
    } finally {
      await pool.end();
    }
    return;
  }
  throw new Error("Expected seed-local or expire-local");
}

await main();
