import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
)
  .split("\0")
  .filter(Boolean);

const skippedExtensions = new Set([
  ".docx",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lock",
  ".pdf",
  ".png",
  ".webp",
  ".xlsx",
  ".zip",
]);

const patterns = [
  ["private key", /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/g],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ["OpenAI-style token", /sk-[A-Za-z0-9_-]{20,}/g],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/g],
];

const findings = [];
let scannedFiles = 0;

for (const relativePath of files) {
  if (relativePath.replaceAll("\\", "/").endsWith("scripts/check-secrets.mjs")) {
    continue;
  }
  if (skippedExtensions.has(extname(relativePath).toLowerCase())) {
    continue;
  }

  const absolutePath = resolve(repositoryRoot, relativePath);
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    continue;
  }
  if (!stats.isFile() || stats.size > 1024 * 1024) {
    continue;
  }

  const content = readFileSync(absolutePath, "utf8");
  if (content.includes("\0")) {
    continue;
  }
  scannedFiles += 1;

  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      findings.push(`${relativePath}: possible ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${scannedFiles} text files checked).`);
}
