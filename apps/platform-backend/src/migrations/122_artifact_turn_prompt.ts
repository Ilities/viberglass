import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./120_files_turn_prompt";

// In a Files space a build makes an artifact: the agent creates or revises the
// deliverable in the space's files and declares it, so Viberglass keeps a
// version that previews without a network.
const ANCHOR = "{{/buildIt}}";
const CREATE_ARTIFACT =
  '{{#createArtifact}}Create the deliverable that was asked for in the space\'s files, or revise it. Then declare it in .viberglass/artifacts.json, which Viberglass reads and doesn\'t keep: {"artifacts": [{"title": "Q4 roadmap deck", "entrypoint": "deck/index.html", "files": ["deck/"]}]}. The entrypoint is the file to open; files lists the other files, and folders ending in /, that it needs. Viberglass keeps a version of exactly those files. A web page or presentation must work from its own files: put its scripts, styles, fonts and images beside it, with no links to CDNs or other sites, because previews have no network.\n{{/createArtifact}}{{#taskArtifacts}}This task\'s artifacts so far: {{taskArtifacts}}. To revise one, give its artifactId in the declaration; leave artifactId out to create a new artifact.\n{{/taskArtifacts}}';

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(ANCHOR, `${ANCHOR}${CREATE_ARTIFACT}`);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, ANCHOR, `${ANCHOR}${CREATE_ARTIFACT}`);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, CREATE_ARTIFACT, "");
}
