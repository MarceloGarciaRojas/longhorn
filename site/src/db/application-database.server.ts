import "server-only";

import { readDatabaseUrl } from "./config";
import { createDatabasePool } from "./pool";

export async function withApplicationDatabase<T>(
  operation: (
    pool: ReturnType<typeof createDatabasePool>,
  ) => Promise<T>,
): Promise<T> {
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("application"),
    applicationName: "nexi-web",
    maxConnections: 1,
  });

  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}
