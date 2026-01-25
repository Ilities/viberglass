import { bitbucketPlugin } from "./bitbucket";
import { githubPlugin } from "./github/github";
import { gitlabPlugin } from "./gitlab";
import { jiraPlugin } from "./jira";
import {
  asanaPlugin,
  azurePlugin,
  clickupPlugin,
  legacyTicketingPlugins,
  trelloPlugin,
} from "./legacy";
import { linearPlugin } from "./linear";
import { mondayPlugin } from "./monday";
import { shortcutPlugin } from "./shortcut/shortcut";
import { slackPlugin } from "./slack/slack";

export const builtInIntegrationPlugins = [
  githubPlugin,
  gitlabPlugin,
  bitbucketPlugin,
  jiraPlugin,
  linearPlugin,
  mondayPlugin,
  shortcutPlugin,
  slackPlugin,
  ...legacyTicketingPlugins,
];

export {
  bitbucketPlugin,
  githubPlugin,
  gitlabPlugin,
  jiraPlugin,
  asanaPlugin,
  azurePlugin,
  clickupPlugin,
  trelloPlugin,
  linearPlugin,
  mondayPlugin,
  shortcutPlugin,
  slackPlugin,
  legacyTicketingPlugins,
};
