#!/usr/bin/env node
import { createQaFixReport } from "../tools/qa/qa-fix-orchestrator.mjs";

const payload = createQaFixReport({ reportOnly: true });
console.log(
  JSON.stringify(
    {
      status: payload.status,
      commitHash: payload.commitHash,
      report: "qa-reports/latest-report.md",
    },
    null,
    2,
  ),
);
