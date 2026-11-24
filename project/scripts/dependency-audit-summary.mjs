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
    return { label, available: false, error: result.error.message };
  }

  let report;
  try {
    report = JSON.parse(result.stdout || "");
  } catch {
    return {
      label,
      available: false,
      exitStatus: result.status,
      error: (result.stderr || result.stdout || "npm audit returned no JSON").slice(0, 1200)
    };
  }

  const vulnerabilities = Object.entries(report.vulnerabilities || {}).map(([name, item]) => ({
    name,
    severity: item.severity,
    direct: item.isDirect,
    range: item.range,
    effects: item.effects || [],
    fixAvailable: item.fixAvailable,
    advisories: (item.via || [])
      .filter((via) => typeof via === "object")
      .map((via) => ({
        title: via.title,
        severity: via.severity,
        range: via.range,
        url: via.url
      }))
  }));

  return {
    label,
    available: true,
    exitStatus: result.status,
    counts: report.metadata?.vulnerabilities || null,
    vulnerablePackageCount: vulnerabilities.length,
    vulnerabilities
  };
}

const reports = [
  runAudit("all-dependencies", ["audit", "--json"]),
  runAudit("production-dependencies", ["audit", "--omit=dev", "--json"])
];

console.log("MATMOVE_NPM_AUDIT_REPORT " + JSON.stringify({
  generatedAt: new Date().toISOString(),
  reports
}));
