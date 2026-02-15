import { bitbucketPlugin } from "./bitbucket";
import { customPlugin } from "./custom/customUtils";
import { githubPlugin } from "./github/githubUtils";
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
import { shortcutPlugin } from "./shortcut/shortcutUtils";
import { slackPlugin } from "./slack/slackUtils";

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
  ...legacyTicketingPlugins,
];

export {
  bitbucketPlugin,
  customPlugin,
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
