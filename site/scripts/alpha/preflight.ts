import { loadAlphaConfig } from "../../src/alpha/config";

try {
  const config = loadAlphaConfig();
  console.log("Alpha preflight approved.");
  console.log(`Environment: ${config.environment}`);
  console.log(`Deploy target: ${config.deployTarget}`);
  console.log(`Public URL: ${config.publicUrl}`);
  console.log("Identity: Supabase (server-side adapter)");
  console.log("Database: PostgreSQL (restricted roles + Hyperdrive)");
  console.log(`Hyperdrive query caching: ${config.hyperdriveCaching} (required)`);
  console.log("Media objects: private Supabase Storage bucket");
  console.log("Secrets: present in the process and not printed");
} catch (error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown alpha error";
  console.error(`${name}: ${message}`);
  process.exitCode = 1;
}
