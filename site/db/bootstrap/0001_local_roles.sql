DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'nexi_migrator') THEN
    CREATE ROLE nexi_migrator
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'nexi_app') THEN
    CREATE ROLE nexi_app
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END
$bootstrap$;

ALTER ROLE nexi_migrator PASSWORD 'nexi_migration_local';
ALTER ROLE nexi_app PASSWORD 'nexi_app_local';

ALTER ROLE nexi_migrator SET statement_timeout = '30s';
ALTER ROLE nexi_app SET statement_timeout = '5s';
ALTER ROLE nexi_app SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE nexi_app SET row_security = 'on';

REVOKE CONNECT ON DATABASE nexi_test FROM PUBLIC;
GRANT CONNECT, TEMPORARY, CREATE ON DATABASE nexi_test TO nexi_migrator;
GRANT CONNECT ON DATABASE nexi_test TO nexi_app;

ALTER SCHEMA public OWNER TO nexi_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO nexi_migrator;
GRANT USAGE ON SCHEMA public TO nexi_app;
