import { bitbucketPlugin } from "./bitbucket";
import { customPlugin } from "./custom";
import { githubPlugin } from "./github";
import { gitlabPlugin } from "./gitlab";
import { jiraPlugin } from "./jira";
import { linearPlugin } from "./linear";
import { mondayPlugin } from "./monday";
import { shortcutPlugin } from "./shortcut";
import { slackPlugin } from "./slack";

export const builtInIntegrationPlugins = [
  githubPlugin,
  gitlabPlugin,
  bitbucketPlugin,
  jiraPlugin,
  linearPlugin,
  mondayPlugin,
  shortcutPlugin,
  slackPlugin,
  customPlugin,
];

export {
  bitbucketPlugin,
  customPlugin,
  githubPlugin,
  gitlabPlugin,
  jiraPlugin,
  linearPlugin,
  mondayPlugin,
  shortcutPlugin,
  slackPlugin,
};
