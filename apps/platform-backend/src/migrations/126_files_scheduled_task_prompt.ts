import { Kysely, sql } from "kysely";
import { CLAW_SCHEDULED_TASK_TEMPLATE as BEFORE } from "./057_xml_tag_templates";

// In a Files space a scheduled run works on the space's shared files, which
// are saved when it ends, and opens no pull request; what it should keep as a
// deliverable it declares as an artifact.
const OPENING = "You are an expert software engineer. Complete the scheduled task described below.";
const EITHER_OPENING = "{{^filesSpace}}You are an expert software engineer. {{/filesSpace}}Complete the scheduled task described below.";

const REPOSITORY_RULES = BEFORE.slice(BEFORE.indexOf("Requirements:"), BEFORE.indexOf("Please proceed with the task."));
const FILES_RULES =
  "Requirements:\n" +
  "- Read and follow AGENTS.md and any other instruction files provided.\n" +
  "- Your working directory holds this space's shared files, not a repository. Create, change or remove files there as the task needs: Viberglass saves them when you finish, for later runs and the space's tasks. Leave files the task doesn't mention as they are.\n\n" +
  'If the task asks for a deliverable, such as a report or a page, declare it in .viberglass/artifacts.json, which Viberglass reads and doesn\'t keep: {"artifacts": [{"title": "Weekly report", "entrypoint": "reports/weekly.html", "files": ["reports/assets/"]}]}. The entrypoint is the file to open; files lists the other files, and folders ending in /, that it needs. Viberglass keeps a version of exactly those files as a new artifact. A web page or presentation must work from its own files: put its scripts, styles, fonts and images beside it, with no links to CDNs or other sites, because previews have no network.\n\n';
const EITHER_RULES = `{{^filesSpace}}${REPOSITORY_RULES}{{/filesSpace}}{{#filesSpace}}${FILES_RULES}{{/filesSpace}}`;

export const CLAW_SCHEDULED_TASK_TEMPLATE = BEFORE.replace(OPENING, EITHER_OPENING).replace(REPOSITORY_RULES, EITHER_RULES);

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'claw_scheduled_task'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, OPENING, EITHER_OPENING);
  await replaceIn(db, REPOSITORY_RULES, EITHER_RULES);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, EITHER_RULES, REPOSITORY_RULES);
  await replaceIn(db, EITHER_OPENING, OPENING);
}
