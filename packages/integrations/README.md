# Integration Plugins

Each integration (a code host, issue tracker, inbound webhook or chat service) is a workspace package under `packages/integrations/`, listed in `viberglass.plugins.json`. Nothing outside its package names it: the platform finds integrations through their manifests and the capabilities they declare. See [ADR 0015](../../docs/adr/0015-harnesses-and-integrations-are-plugins.md) for why.

```
packages/integrations/
├── integration-github/     code host and tracker
├── integration-jira/       tracker
├── integration-shortcut/   tracker
├── integration-custom/     inbound JSON webhooks
├── integration-slack/      chat
├── integration-gitlab/     stub
├── integration-bitbucket/  stub
├── integration-linear/     stub
├── integration-monday/     stub
└── _template/              copied by npm run new:integration
```

## Adding an integration

```bash
npm run new:integration <name>
# e.g. npm run new:integration asana
```

The script copies `_template/` to `packages/integrations/integration-<name>/`, adds the package to `viberglass.plugins.json` and runs `npm run generate:plugins`, which registers it in the backend (`configuredIntegrationPlugins.ts`) and the frontend (`configuredFrontendIntegrationPlugins.ts`) and adds the dependencies. Then:

1. Describe it in `src/manifest.ts`.
2. Add the capabilities it implements to `src/backend/plugin.ts`.
3. Replace the icon in `src/frontend/`, and add a frontend slot if it needs one.
4. Run `npm install && npm run build`, then `npm test -w @viberglass/integration-<name>`.

Leave an integration out of a build by removing it from `viberglass.plugins.json` and running `npm run generate:plugins`. Its connections stay in the database; the platform stops offering and using them.

## Package layout

```
src/
  manifest.ts         plain data both entries spread
  backend/plugin.ts   the manifest plus backend capabilities (IntegrationPlugin)
  frontend/plugin.ts  the manifest plus the icon and UI slots (IntegrationFrontendPlugin)
test/
```

The backend entry is the package's main export and the frontend entry is `@viberglass/integration-<name>/frontend`, so the frontend bundle never pulls in backend code.

## Manifest

`IntegrationManifest` from `@viberglass/types`. Every field drives something: the connections page and the connection screen read the manifest, and nothing keeps its own list of integrations.

| Field | Description |
|---|---|
| `id` | Unique, kebab-case; stored on connections and tickets. |
| `label`, `description` | Shown on the connections page. |
| `category` | The slot a connection fills for a space: `scm` (its code host), `ticketing` (its tracker), `inbound` (receives events) or `chat`. |
| `status` | `ready`, or `stub` for one listed as coming soon that can't be connected. A stub declares nothing else. |
| `configFields` | Settings the connection screen edits, as `PluginField`s (`{ key, label, type, required?, description?, options?, placeholder? }`). Empty when there are none. A `secret` field's value is kept in the secrets system as the connection's credential, not in its config, and is never sent back to the browser; the plugin gets it under the field's key. |
| `credentialUse` | Set when the connection holds a token: what Viberglass uses it for, shown where the token is entered. |
| `receivesWebhooks` | Set when the connection receives webhooks. Deliveries arrive at `/api/webhooks/<id>/<webhook config id>`. |
| `defaultInboundEvents` | Events a new webhook subscribes to; all when unset. |

## Backend capabilities

`IntegrationPlugin` from `@viberglass/integration-core`. Each capability is optional; the platform asks the registry for the integrations that have one and calls them through its interface.

| Capability | For | Interface |
|---|---|---|
| `checkConnection(config)` | "Test connection": throw with what went wrong | |
| `createCommenter(config)` | Trackers: posting back to the issues tasks are linked to | `TrackerCommenter` |
| `webhook` | Integrations that `receivesWebhooks`: verifying a delivery's signature, parsing it, and reading it as an issue, comment or task | `WebhookReceiver` |
| `repository` | Code hosts: reading and checking a repository, opening pull requests, and reading their outcome and review | `RepositoryHost` |
| `chat` | Chat services: the bot adapter and handlers, direct messages, finding an account by email. The platform passes it its connection's settings and credentials through `configure`, and rebuilds the bot when the connection changes | `ChatProvider` |

`config` is the connection's credentials plus its `configFields` values. The worker never talks to an integration: it clones and pushes with the username the code host's `RepositoryHost` names, and asks the platform to open the pull request.

The GitHub package is the fullest example: a tracker, a webhook receiver and a repository host. Slack is the chat example.

## Frontend slots

`IntegrationFrontendPlugin` from `@viberglass/integration-core/frontend`.

| Field | Description |
|---|---|
| `Icon` | Required. |
| `trackerWebhook` | For trackers whose issues spaces take as linked tasks: what the tracker calls an issue, the webhook setup steps, its events and the bot's name hint. |
| `AuthSetupSection` | For integrations connected by installing an app: shown instead of a name prompt. |

The connection screen goes by the manifest and these slots: a config form when there are `configFields`, a token section with `credentialUse`, a webhook section when it `receivesWebhooks`, and an install section with `AuthSetupSection`.

## Keeping ids in their package

`apps/platform-backend/src/__tests__/unit/plugins/pluginIdsStayInPackages.test.ts` fails when a harness or integration id appears as a string anywhere outside its package, its tests and the migrations. When code needs to treat one integration differently, that's a missing manifest field or capability.
