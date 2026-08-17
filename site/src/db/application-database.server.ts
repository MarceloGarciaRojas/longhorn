import "server-only";

import { createDatabasePool } from "./pool";
import { resolveApplicationDatabaseUrl } from "./runtime-connection.server";

export async function withApplicationDatabase<T>(
  operation: (
    pool: ReturnType<typeof createDatabasePool>,
  ) => Promise<T>,
): Promise<T> {
  const pool = createDatabasePool({
    connectionString: await resolveApplicationDatabaseUrl(),
    applicationName: "nexi-web",
    maxConnections: 1,
  });

  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}
