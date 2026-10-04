# Administrator: prepare a workspace people can use

Your job is to make access, agents and repository connections usable before people request work. You need a workspace admin account.

## Start a workspace

1. Open the application. On a new instance, create the first administrator using your name, email and password.
2. Follow setup to configure a model key, agent, space and repository. The built-in demo is sample data for exploring screens; use your own space for actual work.
3. In workspace Settings → Agents & runners, check the runner’s harness, provider/key and compute configuration. A runner combines these settings; it is not just a model name.
4. Run a small task in the intended space. Confirm that it produces readable research, can answer a follow-up, and has the repository access needed for code. In the reviewed build, Active alone does not establish that credentials work.

[Setup model step](../images/03-model-setup.png) · [Agent configuration](../images/05-create-runner.png)

## Give people appropriate access

1. Open workspace Settings → Members and invite a person with their email and workspace role.
2. Choose the spaces they should join. Use Guest for external collaborators limited to their spaces; Viewer for people who only need to read; Member for regular contributors. Reserve Admin for workspace configuration.
3. The recipient follows the invitation link and sets their name and password.
4. In a space’s Settings → Members, set its privacy and maintainers. Maintainers manage that space’s settings, membership and defaults.
5. Set a default owner and reviewers if your team uses them. With no default owner, the creator owns each new task. Default reviewers are added to new tasks.

[Workspace members](../images/06-members.png) · [Space members and defaults](../images/11-space-members.png)

## Connect and operate the workspace

Open Settings → Connections to manage integrations, then link the appropriate connection and repository in the space’s settings. Confirm the default branch and access before asking for code. Secrets hold credentials; use their bindings in runner/connection configuration. MCP servers and Skills extend agent capabilities. Prompt templates provide reusable instructions.

Keep credentials in Secrets, not task descriptions or comments. Personal Settings → Notifications shows Slack availability and the configured email recipient. Send test email can check email delivery. The review verified local email; your deployment needs its own delivery checks.

When work fails, open its task and run record, identify whether the problem concerns credentials, compute, model compatibility or repository access, and repair that setting. A paused setup failure offers Try again; admins also have Retry all paused runs. Prefer a single-task retry to confirm the fix first. Use Audit log and Run records when investigating changes and execution history.

## Check that setup is useful

A teammate should be able to create a task, see who owns it, request work, read an artifact and answer a question without opening your admin forms. Verify this with a member account and a viewer/guest account as appropriate.

## Review/editorial notes

Custom z.ai setup was created through APIs because the current setup picker has no custom-provider path. Do not publish a claimed wizard recipe for it until UX-05 is implemented. Active/key contradictions, generic validation and advanced-form density need UX-03, 06, 07, 15–17 and 25. Native credentials, cloud compute and live Slack were not validated. Admin screenshots need recapture after those changes.
