export type DatabaseEnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

export type DatabaseConnectionPurpose =
  | "admin"
  | "migration"
  | "application"
  | "test";

export class DatabaseConfigError extends Error {
  readonly variableName: string;

  constructor(variableName: string, reason: string) {
    super(`Invalid database configuration for ${variableName}: ${reason}`);
    this.name = "DatabaseConfigError";
    this.variableName = variableName;
  }
}

const VARIABLE_BY_PURPOSE: Record<DatabaseConnectionPurpose, string> = {
  admin: "DATABASE_ADMIN_URL",
  migration: "DATABASE_MIGRATION_URL",
  application: "DATABASE_URL",
  test: "TEST_DATABASE_URL",
};

export function readDatabaseUrl(
  purpose: DatabaseConnectionPurpose,
  source: DatabaseEnvironmentSource = process.env,
): string {
  const variableName = VARIABLE_BY_PURPOSE[purpose];
  const value = source[variableName]?.trim();

  if (!value) {
    throw new DatabaseConfigError(variableName, "it is required for this command");
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    if (!url.hostname || !url.pathname || url.pathname === "/") {
      throw new Error("missing host or database");
    }
    if (!url.username) {
      throw new Error("missing database role");
    }
    return value;
  } catch {
    throw new DatabaseConfigError(
      variableName,
      "expected a complete postgres:// or postgresql:// URL",
    );
  }
}

export function assertSafeResetTarget(
  connectionString: string,
  source: DatabaseEnvironmentSource = process.env,
): void {
  const environment = source.APP_ENV?.trim() || "local";
  if (environment !== "local" && environment !== "test") {
    throw new DatabaseConfigError(
      "APP_ENV",
      "database reset is allowed only in local or test",
    );
  }

  const url = new URL(connectionString);
  const safeHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  const databaseName = url.pathname.replace(/^\//, "");
  if (!safeHosts.has(url.hostname) || !/(_test|_local|_dev)$/.test(databaseName)) {
    throw new DatabaseConfigError(
      "DATABASE_MIGRATION_URL",
      "reset target must be a local host and a *_test, *_local or *_dev database",
    );
  }
}
