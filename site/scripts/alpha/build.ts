import { spawn } from "node:child_process";

import { loadAlphaConfig } from "../../src/alpha/config";

loadAlphaConfig();
if (!/^[0-9a-f]{40}$/i.test(process.env.APP_COMMIT_SHA?.trim() || "")) {
  throw new Error("APP_COMMIT_SHA must be the exact 40-character commit SHA");
}
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("pnpm executable is unavailable");

const code = await new Promise<number | null>((resolvePromise, reject) => {
  const child = spawn(process.execPath, [pnpmCli, "build"], {
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  child.once("error", reject);
  child.once("exit", resolvePromise);
});
if (code !== 0) throw new Error(`Alpha build exited with code ${code ?? "unknown"}`);
console.log("Alpha Worker artifact built with Hyperdrive and persistent providers declared.");
