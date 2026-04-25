import { IntegrationRegistry } from "@viberglass/integration-core";
import githubPlugin from "@viberglass/integration-github";
import jiraPlugin from "@viberglass/integration-jira";
import slackPlugin from "@viberglass/integration-slack";
import gitlabPlugin from "@viberglass/integration-gitlab";
import bitbucketPlugin from "@viberglass/integration-bitbucket";
import linearPlugin from "@viberglass/integration-linear";
import mondayPlugin from "@viberglass/integration-monday";
import shortcutPlugin from "@viberglass/integration-shortcut";
import customPlugin from "@viberglass/integration-custom";

export function buildIntegrationRegistry(): IntegrationRegistry {
  return new IntegrationRegistry()
    .register(githubPlugin)
    .register(jiraPlugin)
    .register(slackPlugin)
    .register(gitlabPlugin)
    .register(bitbucketPlugin)
    .register(linearPlugin)
    .register(mondayPlugin)
    .register(shortcutPlugin)
    .register(customPlugin);
}

export const integrationRegistry = buildIntegrationRegistry();
