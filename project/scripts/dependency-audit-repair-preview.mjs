import { spawnSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, label, timeout = 150000) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 12 * 1024 * 1024,
    windowsHide: true
  });
  console.log(`MATMOVE_AUDIT_COMMAND ${label} status=${result.status} signal=${result.signal || "none"}`);
  if (result.error) console.log(`MATMOVE_AUDIT_COMMAND_ERROR ${label} ${result.error.message}`);
  if (result.stdout) console.log(`MATMOVE_AUDIT_COMMAND_STDOUT ${label} ${result.stdout.slice(-5000)}`);
  if (result.stderr) console.log(`MATMOVE_AUDIT_COMMAND_STDERR ${label} ${result.stderr.slice(-3000)}`);
  return result;
}

run(npm, ["audit", "fix"], "npm-audit-fix");

await mkdir("public", { recursive: true });
await copyFile("package.json", "public/matmove-admin-audit-package.json");
await copyFile("package-lock.json", "public/matmove-admin-audit-package-lock.json");

const lock = await import("node:fs/promises").then(({ readFile }) => readFile("package-lock.json"));
console.log("MATMOVE_AUDIT_LOCKFILE_SHA256 " + createHash("sha256").update(lock).digest("hex"));
console.log("MATMOVE_AUDIT_LOCKFILE_BYTES " + lock.byteLength);

function summarize(label, args) {
  const result = run(npm, args, label, 90000);
  let report;
  try {
    report = JSON.parse(result.stdout || "");
  } catch {
    console.log(`MATMOVE_NPM_AUDIT_UNAVAILABLE ${label}`);
    return;
  }

  console.log(`MATMOVE_NPM_AUDIT_COUNTS ${label} ${JSON.stringify(report.metadata?.vulnerabilities || {})}`);
  for (const [name, item] of Object.entries(report.vulnerabilities || {})) {
    const advisories = (item.via || [])
      .filter((via) => typeof via === "object")
      .map((via) => ({
        title: via.title,
        severity: via.severity,
        range: via.range,
        url: via.url
      }));
    console.log("MATMOVE_NPM_AUDIT_ITEM " + JSON.stringify({
      label,
      name,
      severity: item.severity,
      direct: item.isDirect,
      range: item.range,
      fixAvailable: item.fixAvailable,
      advisories
    }));
  }
}

summarize("all-dependencies-after-fix", ["audit", "--json"]);
summarize("production-dependencies-after-fix", ["audit", "--omit=dev", "--json"]);
