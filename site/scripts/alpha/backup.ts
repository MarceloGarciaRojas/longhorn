import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { loadAlphaConfig } from "../../src/alpha/config";

function safeBackupDirectory(): string {
  const raw = process.env.ALPHA_BACKUP_DIRECTORY?.trim();
  if (!raw || !isAbsolute(raw)) {
    throw new Error("ALPHA_BACKUP_DIRECTORY must be an absolute off-repository path");
  }
  const directory = resolve(raw);
  const workspace = resolve(process.cwd());
  const fromWorkspace = relative(workspace, directory);
  if (!fromWorkspace.startsWith("..") || isAbsolute(fromWorkspace)) {
    throw new Error("ALPHA_BACKUP_DIRECTORY must be outside the repository");
  }
  return directory;
}

function run(program: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(program, args, { env, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${program} exited with code ${code ?? "unknown"}`));
    });
  });
}

const config = loadAlphaConfig();
const url = new URL(config.databaseMigrationUrl);
const directory = safeBackupDirectory();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(directory, `nexi-alpha-${timestamp}.dump`);
const executable = process.env.PG_DUMP_BIN?.trim() || "pg_dump";

await run(
  executable,
  [
    `--host=${url.hostname}`,
    `--port=${url.port || "5432"}`,
    `--username=${decodeURIComponent(url.username)}`,
    `--dbname=${decodeURIComponent(url.pathname.slice(1))}`,
    "--format=custom",
    "--no-owner",
    "--no-acl",
    `--file=${output}`,
  ],
  {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGAPPNAME: "nexi-alpha-backup",
  },
);

const info = await stat(output);
if (!info.isFile() || info.size < 1) throw new Error("Alpha backup is empty");
const digest = createHash("sha256").update(await readFile(output)).digest("hex");
console.log(`Alpha backup created: ${output}`);
console.log(`Bytes: ${info.size}`);
console.log(`SHA-256: ${digest}`);
console.log("Store the dump and checksum in an encrypted off-site location.");
