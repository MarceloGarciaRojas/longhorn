import { spawn } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

function backupFile(): string {
  const raw = process.env.ALPHA_BACKUP_FILE?.trim();
  if (!raw || !isAbsolute(raw)) {
    throw new Error("ALPHA_BACKUP_FILE must be an absolute path");
  }
  const file = resolve(raw);
  const workspace = resolve(process.cwd());
  const fromWorkspace = relative(workspace, file);
  if (!fromWorkspace.startsWith("..") || isAbsolute(fromWorkspace)) {
    throw new Error("ALPHA_BACKUP_FILE must be outside the repository");
  }
  return file;
}

const executable = process.env.PG_RESTORE_BIN?.trim() || "pg_restore";
const file = backupFile();
const code = await new Promise<number | null>((resolvePromise, reject) => {
  const child = spawn(executable, ["--list", file], {
    stdio: ["ignore", "ignore", "inherit"],
    shell: false,
  });
  child.once("error", reject);
  child.once("exit", resolvePromise);
});
if (code !== 0) throw new Error(`${executable} exited with code ${code ?? "unknown"}`);
console.log("Alpha backup archive structure verified.");
console.log("A destructive restore rehearsal still requires an isolated target database.");
