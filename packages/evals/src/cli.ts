import { readFileSync } from "fs";
import { parseCorpus } from "./corpus";
import { OUTCOME_GRADERS } from "./graders/outcomeGraders";
import { buildReport } from "./report";

// Usage: npm run report -w @viberglass/evals -- <export.ndjson>
const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run report -w @viberglass/evals -- <export.ndjson>");
  process.exit(1);
}

const records = parseCorpus(readFileSync(path, "utf8"));
console.log(JSON.stringify(buildReport(records, OUTCOME_GRADERS), null, 2));
