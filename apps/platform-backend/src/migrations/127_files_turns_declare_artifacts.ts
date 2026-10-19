import { Kysely, sql } from "kysely";
import {
  TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE,
  TASK_TURN_TEMPLATE as TURN_BEFORE,
} from "./125_build_writes_pull_request_text";

// In a Files space a reply often makes the deliverable itself, such as a
// presentation the task asked for, so any turn there may declare what it made
// as an artifact. Only a build has to.
const ANCHOR = "{{/createArtifact}}";
const DECLARE_ARTIFACT =
  '{{#mayDeclareArtifact}}If you create or revise a deliverable in the space\'s files on this turn, such as a document, page or presentation, declare it in .viberglass/artifacts.json, which Viberglass reads and doesn\'t keep: {"artifacts": [{"title": "Q4 roadmap deck", "entrypoint": "deck/index.html", "files": ["deck/"]}]}. The entrypoint is the file to open; files lists the other files, and folders ending in /, that it needs. Viberglass keeps a version of exactly those files. A web page or presentation must work from its own files: put its scripts, styles, fonts and images beside it, with no links to CDNs or other sites, because previews have no network. Without a deliverable, don\'t write the file.\n{{/mayDeclareArtifact}}';

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(ANCHOR, `${ANCHOR}${DECLARE_ARTIFACT}`);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, ANCHOR, `${ANCHOR}${DECLARE_ARTIFACT}`);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, DECLARE_ARTIFACT, "");
}
