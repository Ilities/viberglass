Run on virtual machine ubuntu noble server

Start: 10:23:20


Git clone started @ 10:33:10
Docker and git needs to be installed. On ubuntu:
1  curl -fsSL https://get.docker.com | sudo sh
2  sudo usermod -aG docker tester
3  sudo apt install -y git


Issue with startup @ 10:37:20:
viberglass-dev-backend   | node:internal/modules/run_main:107
viberglass-dev-backend   |     triggerUncaughtException(
viberglass-dev-backend   |     ^
viberglass-dev-backend   | Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/node_modules/@viberglass/telemetry/dist/index.mjs' imported from /app/apps/platform-backend/src/config/telemetry.ts
viberglass-dev-backend   |     at finalizeResolution (node:internal/modules/esm/resolve:272:11)
viberglass-dev-backend   |     at moduleResolve (node:internal/modules/esm/resolve:879:10)
viberglass-dev-backend   |     at defaultResolve (node:internal/modules/esm/resolve:1006:11)
viberglass-dev-backend   |     at nextResolve (node:internal/modules/esm/hooks:785:28)
viberglass-dev-backend   |     at resolveBase (file:///app/node_modules/tsx/dist/esm/index.mjs?1792398992857:2:3744)
viberglass-dev-backend   |     at resolveDirectory (file:///app/node_modules/tsx/dist/esm/index.mjs?1792398992857:2:4243)
viberglass-dev-backend   |     at resolveTsPaths (file:///app/node_modules/tsx/dist/esm/index.mjs?1792398992857:2:4984)
viberglass-dev-backend   |     at resolve (file:///app/node_modules/tsx/dist/esm/index.mjs?1792398992857:2:5361)
viberglass-dev-backend   |     at nextResolve (node:internal/modules/esm/hooks:785:28)
viberglass-dev-backend   |     at AsyncLoaderHooksOnLoaderHookWorker.resolve (node:internal/modules/esm/hooks:269:30) {
viberglass-dev-backend   |   code: 'ERR_MODULE_NOT_FOUND',
viberglass-dev-backend   |   url: 'file:///app/node_modules/@viberglass/telemetry/dist/index.mjs'
viberglass-dev-backend   | }
viberglass-dev-backend   |
viberglass-dev-backend   | Node.js v24.22.0
viberglass-dev-backend   | [nodemon] app crashed - waiting for file changes before starting...


^^ Above issue fixed. Starting with a clean VM snapshot @ 13:32:57

Agent running successfully for files spaces @ 13:38:33. Agent produced an HTML file but artifacts shows empty. File is available and is correct.

Adding a git repository manually needs a token. Added but git clone fails. ❯ token didn't have scopes. Had to add content read/write and PRs read/write. Shorthand form of the repository didn't work Ilities/token.observer failed, https://github.com/Ilities/token.observer/ worked.

After adding access, plan worked successfully. By default, OpenCode "Technical Details" does not show which model was used.

Pushing failed. Wrong token (owned by wrong user). Additionally a bug: Could not parse owner/repo from URL: https://github.com/Ilities/token.observer/ A slash at the end of the URL is makes it fail...

Build works. Task status and PR status work once merged.


CLEAN-01 - CLEAN-05 complete.
CLEAN-06 is outdated since quick run uses public images.

CLEAN-10 - CLEAN-14 complete. 