# Administrator: prepare a workspace people can use

Your job is to make access, agents and repository connections usable before people request work. You need a workspace admin account.

## Start a workspace

1. Open the application. On a new instance, create the first administrator using your name, email and password.
2. Follow setup to configure a model key, agent, space and repository. To use a provider such as z.ai or a self-hosted model, choose Custom endpoint: enter the API base URL, which API it speaks (OpenAI Chat Completions, OpenAI Responses or Anthropic Messages), the endpoint's own API key and a model (Find models lists them). Setup checks the endpoint before continuing; the default agent then runs on OpenCode (Chat Completions) or Pi (Responses or Anthropic Messages). The built-in demo is sample data for exploring screens; its banner shows only inside the demo space, or on Home where you can hide it. Use your own space for actual work.
3. In Workspace settings → Agents & runners, check the runner’s harness, provider/key and compute configuration. A runner combines these settings; it is not just a model name. Can take tasks shows whether it is usable: Ready, Needs a model key, Needs a login, Not running or Key rejected. This is separate from compute status. Automatic agent selection only picks ready runners.
4. Run a small task in the intended space. Confirm that it produces readable research, can answer a follow-up, and has the repository access needed for code. The runner page then shows the last run's outcome.

When creating a runner, name it and choose the agent and model/key first; compute (Docker by default), instructions, tools and extra variables are under Advanced. The provider list only offers endpoints the chosen agent can speak; custom endpoints work with OpenCode and Pi, while other harnesses such as Claude Code and Codex use only their own providers for now. A runner page says when the runner sends its key to a custom endpoint, shows that endpoint, and marks the model “as requested”.

[Setup model step](../images/03-model-setup.png) · [Agent configuration](../images/05-create-runner.png)

## Give people appropriate access

1. Open Workspace settings → Members and invite a person with their email and workspace role. What each role can do compares Admin, Member, Guest and Viewer.
2. Choose the spaces they should join. Use Guest for external collaborators limited to their spaces; Viewer for people who only need to read; Member for regular contributors. Reserve Admin for workspace configuration.
3. The recipient follows the invitation link and sets their name and password. Registration shows errors next to the relevant field and keeps what was typed; internal email domains such as .internal are accepted.
4. In a space’s Space settings → Members, set its privacy and maintainers. Maintainers manage that space’s settings, membership and defaults.
5. Set a default owner and reviewers if your team uses them. With no default owner, the creator owns each new task. Default reviewers are added to new tasks.

[Workspace members](../images/06-members.png) · [Space members and defaults](../images/11-space-members.png)

## Connect and operate the workspace

Open Workspace settings → Connections to manage connected services, then link the appropriate connection and repository in the space’s settings. Confirm the default branch and access before asking for code. Secrets hold credentials; use their bindings in runner/connection configuration. One secret can back several variables on a runner. MCP servers and Skills extend agent capabilities. Prompt templates provide reusable instructions.

Keep credentials in Secrets, not task descriptions or comments. Notifications shows Slack availability and the configured email recipient. Send test email can check email delivery. The review verified local email; your deployment needs its own delivery checks.

When work fails, the failure card on the task names the runner, says who can fix it and links you straight to that runner's page; expand What the agent reported for the detail. Identify whether the problem concerns credentials, compute, model compatibility or repository access, and repair that setting. For setup failures that won't fix themselves, such as a rejected model key, Try again is not offered until the setup is fixed. Asking a runner that has no key is refused with a clear message. Admins also have Retry all paused runs. Prefer a single-task retry to confirm the fix first. Use Audit log and Run records when investigating changes and execution history; Run records say “model not reported” when a run reported none.

## Check that setup is useful

A teammate should be able to create a task, see who owns it, request work, read an artifact and answer a question without opening your admin forms. Verify this with a member account and a viewer/guest account as appropriate.

## Review/editorial notes

Custom endpoints are only available for OpenCode and Pi; Google and Mistral need native credentials. Native provider accounts, cloud compute and live Slack were not validated. Admin screenshots need recapture after the setup, runner and theme changes.
