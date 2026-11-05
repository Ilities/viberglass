import {
  APP_DATABASE_PATH,
  APP_HEALTH_PATH,
  APP_MANIFEST_FILE,
  APP_USER_HEADERS,
  SKILL_ENTRY_FILE,
  type AppManifest,
  type SkillFile,
  type WorkerSkill,
} from "@viberglass/types";

/** Not a uuid, so no uploaded skill can have this id. */
export const APP_CONTRACT_SKILL: WorkerSkill = { id: "builtin-app-contract", name: "viberglass-app" };

const EXAMPLE_MANIFEST: AppManifest = {
  build: "npm ci && npm run build",
  start: "node dist/server.js",
  settings: [
    { name: "SLACK_WEBHOOK_URL", secret: true, description: "Incoming webhook for the #it-equipment channel" },
    { name: "COMPANY_NAME", secret: false, description: "Shown in the page header" },
  ],
};

const SKILL_MD = `---
name: ${APP_CONTRACT_SKILL.name}
description: The contract every app in a Viberglass App space follows (runtime, port, health check, SQLite data, sign-in headers, settings and the ${APP_MANIFEST_FILE} manifest). Read it before writing or changing any code in this repository.
---

# Building an app Viberglass hosts

This repository holds one small internal app. Viberglass builds it, runs it, backs up its data and decides who may open it. The people using it never deal with servers, git or deployment, so the app has to fit the contract below exactly. Software that doesn't fit can't be hosted.

## Runtime

- Node.js only, version 24. Write it in JavaScript or TypeScript.
- Builds and runs on Debian (\`node:24-slim\`). Native modules must build there; better-sqlite3 is fine. Avoid packages that need system libraries the slim image lacks.
- Commit \`package-lock.json\`. The build runs from a clean checkout.
- One process, one instance. Never assume a second copy is running.

## Listening and health

- Listen on the port in the \`PORT\` environment variable, on all interfaces (\`0.0.0.0\`). Never hard-code a port.
- Answer \`GET ${APP_HEALTH_PATH}\` with status 200 once the app is ready to serve, which means after migrations have run. Answer it without requiring sign-in headers, and keep answering 200 when settings are missing.
- A new release only goes live when \`${APP_HEALTH_PATH}\` answers 200, so a broken start keeps the previous release serving.
- The app is served from the root of its own host. Use relative or root-relative links, and serve the user interface and its static files from the same server.

## Data

- All persistent state lives in one SQLite database at \`${APP_DATABASE_PATH}\`. Nothing else on disk survives a new release, so never write files you need to keep anywhere else. Store uploaded files in the database.
- The rest of the filesystem is read-only, apart from \`/tmp\` for short-lived files and the app's own directory, which each new release replaces.
- Open the database in WAL mode (\`PRAGMA journal_mode = WAL\`); backups depend on it. Don't delete, move or replace the database file.
- Set a busy timeout when opening it (\`PRAGMA busy_timeout = 5000\`). Replication briefly locks the database, and without one a write fails with "database is locked".
- Run the app's own migrations at startup, before \`${APP_HEALTH_PATH}\` answers 200. Keep them in the repository as numbered SQL or code files, record which ones ran in a table, and only ever add new ones: a migration that already ran on live data must never change.
- Migrations must work on existing data. Add columns with defaults, backfill, and never drop data people still need.
- While you work on the app yourself, \`/data\` may not exist or be writable. Let an optional \`APP_DATABASE_PATH\` environment variable override the path for that, and default to \`${APP_DATABASE_PATH}\`.

## Who is using the app

Every request reaches the app through the Viberglass gateway, which has already signed the person in. It passes their identity in these request headers:

- \`${APP_USER_HEADERS.id}\`: a stable id for the person. Use it as the key when you store who did something.
- \`${APP_USER_HEADERS.email}\`: their email address.
- \`${APP_USER_HEADERS.name}\`: their display name, percent-encoded as UTF-8 so any script fits in a header. Read it with \`decodeURIComponent\`.

Only the id identifies a person. The email and name are for showing: people choose their own names, so two can share one, and never decide who owns a record or who may do something by email or name.

Trust these headers and nothing else. Don't write sign-in pages, passwords, sessions, tokens or user tables for authentication, and don't set cookies for identity. Storing people's ids next to the records they own or created is fine, and so is a table of app-specific preferences keyed by the id.

Answer requests other than \`${APP_HEALTH_PATH}\` that arrive without \`${APP_USER_HEADERS.id}\` with 401. When you try the app yourself, send the headers with your requests, for example \`curl -H '${APP_USER_HEADERS.id}: u1' -H '${APP_USER_HEADERS.email}: ada@example.com' -H '${APP_USER_HEADERS.name}: Ada' http://localhost:$PORT/\`.

Everyone who can open the app can do everything in it. There are no roles inside apps yet.

The gateway also sets \`X-Forwarded-For\`, \`X-Forwarded-Proto\` and \`X-Forwarded-Host\` from what it saw itself. Don't read any other forwarding header, and don't add a proxy library that trusts several hops.

## Browsers

- Don't send CORS headers (\`Access-Control-Allow-*\`). The app's pages call its own server on the same origin, and the gateway drops grants to any other origin.
- Don't expect to be shown in a frame on another site, or to be fetched by another app's pages; the gateway refuses both.

## Settings

- App settings are values the space's maintainers set, such as an API key or a channel URL. The app reads them from environment variables.
- Declare every setting the app reads in the manifest. Use names of upper-case letters, digits and underscores, starting with a letter, and mark keys, tokens and passwords as secret.
- Viberglass sets some variables itself, so they can't be settings: \`PORT\`, \`HOME\`, \`PATH\`, \`NODE_OPTIONS\`, \`APP_DATABASE_PATH\`, and names starting with \`VIBERGLASS_\`, \`AWS_\` or \`LITESTREAM_\`. A manifest that declares one fails the build.
- You never see secret values. Don't put real values in code, tests or the repository.
- A missing setting must never stop the app from starting. Start anyway, keep \`${APP_HEALTH_PATH}\` answering 200, and show the people using the app which settings are missing and what doesn't work until a maintainer sets them. Features that don't need the setting keep working.

## The manifest

\`${APP_MANIFEST_FILE}\` at the repository root tells Viberglass how to build and start the app and which settings it reads:

\`\`\`json
${JSON.stringify(EXAMPLE_MANIFEST, null, 2)}
\`\`\`

- \`build\`: a shell command run in the repository root on a clean checkout. It installs dependencies and builds the app. Use \`"npm ci"\` when there's nothing to build.
- \`start\`: the command that starts the server, run in the repository root after \`build\`.
- \`settings\`: every setting the app reads, with \`name\`, \`secret\` (true or false) and an optional \`description\` maintainers see when they set it. Use an empty list when there are none. Don't declare \`PORT\`.

Keep the manifest up to date whenever you add, rename or remove a setting or change how the app is built or started.

## An existing codebase

A repository can be brought into Viberglass with code that was written without this contract. When \`${APP_MANIFEST_FILE}\` is missing, your first task is to make the app fit it, and nothing else:

- Keep its stack, framework and structure where they fit the runtime above. Don't rewrite it or move it to another framework.
- Add the manifest, listen on \`PORT\`, answer \`${APP_HEALTH_PATH}\`, and keep its data in the SQLite database at \`APP_DATABASE_PATH\` (default \`${APP_DATABASE_PATH}\`).
- Replace its own sign-in with the identity headers above, and its own config files or \`.env\` values with declared settings.
- When something it does can't fit (another database, background jobs, inbound webhooks, email), say so in the pull request and in your reply, and leave that part out rather than faking it.
- The people who brought it in may have uploaded a SQLite file as its starting data. If its tables don't match what the code expects, add a migration that brings them in line without losing rows.

## What apps can't do

Tell the person plainly when they ask for one of these, and suggest what the app can do instead:

- Postgres or any database other than the one SQLite file.
- More than one instance, or work spread across processes.
- Background schedulers, cron jobs or timers that must run while nobody is using the app.
- Inbound webhooks or any request from outside that doesn't come from a signed-in person.
- Sending email.
- Public access. Only people Viberglass signs in can open the app.

The app can call services on the internet, for example posting to a Slack webhook from a request handler. It can't reach Viberglass itself or other apps.
`;

/** The built-in skill's files, in the shape a worker downloads skills. */
export function appContractSkillFiles(): { name: string; files: SkillFile[] } {
  return {
    name: APP_CONTRACT_SKILL.name,
    files: [{ path: SKILL_ENTRY_FILE, contentBase64: Buffer.from(SKILL_MD, "utf8").toString("base64") }],
  };
}
