import { Pool, type PoolConfig } from "pg";

export interface DatabasePoolOptions {
  connectionString: string;
  applicationName: string;
  maxConnections?: number;
}

export function createDatabasePool({
  connectionString,
  applicationName,
  maxConnections = 4,
}: DatabasePoolOptions): Pool {
  const options: PoolConfig = {
    connectionString,
    application_name: applicationName,
    max: maxConnections,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  };

  return new Pool(options);
}
