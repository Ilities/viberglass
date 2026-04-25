import { IntegrationFrontendRegistry } from '@viberglass/integration-core/frontend'
import bitbucketFrontend from '@viberglass/integration-bitbucket/frontend'
import customFrontend from '@viberglass/integration-custom/frontend'
import githubFrontend from '@viberglass/integration-github/frontend'
import gitlabFrontend from '@viberglass/integration-gitlab/frontend'
import jiraFrontend from '@viberglass/integration-jira/frontend'
import linearFrontend from '@viberglass/integration-linear/frontend'
import mondayFrontend from '@viberglass/integration-monday/frontend'
import shortcutFrontend from '@viberglass/integration-shortcut/frontend'
import slackFrontend from '@viberglass/integration-slack/frontend'

export const integrationFrontendRegistry = new IntegrationFrontendRegistry()
  .register(githubFrontend)
  .register(jiraFrontend)
  .register(slackFrontend)
  .register(gitlabFrontend)
  .register(bitbucketFrontend)
  .register(linearFrontend)
  .register(mondayFrontend)
  .register(shortcutFrontend)
  .register(customFrontend)
