import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function runAudit(label, args) {
  const result = spawnSync(npm, args, {
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  });

  if (result.error) {
    console.log(`MATMOVE_NPM_AUDIT_UNAVAILABLE ${label} ${result.error.message}`);
    return;
  }

  let report;
  try {
    report = JSON.parse(result.stdout || "");
  } catch {
    console.log(`MATMOVE_NPM_AUDIT_UNAVAILABLE ${label} ${(result.stderr || result.stdout || "npm audit returned no JSON").slice(0, 800)}`);
    return;
  }

  const counts = report.metadata?.vulnerabilities || {};
  console.log(`MATMOVE_NPM_AUDIT_COUNTS ${label} ${JSON.stringify(counts)}`);

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

runAudit("all-dependencies", ["audit", "--json"]);
runAudit("production-dependencies", ["audit", "--omit=dev", "--json"]);
