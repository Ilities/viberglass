# Troubleshooting

What to do when runs fail, agents won't start, or something else doesn't work. Start from the failure card on the task: it says what went wrong, who can fix it, and links admins to the setting to fix.

## Failed runs

Each failure has a title on the task and in the run's record.

| Failure | What it means | What to do |
|---|---|---|
| Repository not reachable | The worker couldn't clone: the address is wrong, or the token can't read the repository. | Check the space's Repository settings and its token. |
| Couldn't push changes | The branch couldn't be pushed or the pull request opened: the token can't write. | Give the token write access to Contents and Pull requests, or check branch protection. |
| Model key rejected | The provider refused the runner's key or login. | Replace the key on the runner, or sign in again for a ChatGPT login. |
| Model quota used up | The provider refused for quota, credit or rate limits. | Add credit or wait for the limit, then try again. |
| Model context exceeded | The request didn't fit the model's context window. | Use a model with a larger context, or split the task. |
| Agent couldn't start | No worker could be started for the run. | Check the runner's compute: Docker, the cluster, or the AWS stack. |
| Worker ran out of memory | The worker used more memory than its runner allows and was stopped. | Give the runner more memory, then try again. |
| Agent failed | The agent itself failed or gave up. | Try again; more detail in the task's description often helps. |
| No document written | The agent finished without writing the plan. | Try again. |
| No code changes | The build finished without changing any code. | Read its reply; the plan may need to be clearer. |
| Files couldn't be restored | A run in a Files space couldn't load the space's saved files, so the agent didn't start. | Check that workers reach the object storage, then try again. |
| Files weren't saved | A run in a Files space couldn't save the agent's files; the space keeps its earlier files. | Check that workers reach the object storage, then try again. |
| No valid artifact | The agent was asked for an artifact but didn't declare a valid one. Its files were saved. | Try again. |
| Agent stopped responding | The worker stopped reporting and was given up on. | Try again. If it repeats, check the compute for out-of-memory or time limits. |
| Something went wrong | Anything else, most likely a bug in Viberglass. | Try again, and check the backend's logs. |

### Setup failures pause the task

When the setup is the problem (repository access, a rejected key, a worker that can't start or runs out of memory), trying again would fail the same way. The task's agent is paused until someone fixes the setup, and people's requests wait. Admins are told, and the failure card links them to the runner or the space's settings.

After the fix, use Try again on the task to check it. Retry all paused runs then resumes every task the same problem paused.

## A runner isn't ready

On Settings → Agents, a runner that can't take tasks says why: Needs a model key, Needs a login, Not running or Key rejected. Home also shows "Workspace needs attention" when no agent is running. See [Agents and models](agents-and-models.md#can-a-runner-take-tasks).

On Docker, the first run of each agent downloads its worker image, which can take a few minutes. If the backend can't pull from `ghcr.io/ilities`, check the machine's network, or build the images locally.

## Looking closer at a run

- Run details on a task's turn shows what the agent did step by step, its tool calls, the prompt it got, and the worker's log.
- Settings → Run records lists every run, with its agent, model, cost and outcome.
- The backend's logs: `docker compose logs backend` on Docker, `kubectl -n viberglass logs deployment/viberglass-backend` on Kubernetes, or the backend's CloudWatch log group on AWS.
- On Kubernetes, worker Jobs and their Pods are in the worker namespace: `kubectl -n viberglass-workers get jobs,pods`, then `describe` and `logs` on the one that failed. Image pull errors, quota and scheduling problems show in the Pod's events.

## Other problems

- A pull request was merged but the task is still open: merges are picked up by a regular check, within about an hour.
- Nobody gets email: check `EMAIL_FROM` and `SMTP_URL` (or SES on AWS), then Send test email under Settings → Notifications. On AWS, a new SES account only delivers to verified addresses until production access is granted.
- Slack doesn't answer `/viberglass`: Settings → Connections → Slack should show Bot active, with the bot token and signing secret saved, and Slack must reach `https://<your backend>/api/webhooks/slack`. Until both are saved the route answers 503.
- Someone can't see a space or a task: they may not have access. Check their workspace role, and whether the space is private. See [People and access](people-and-access.md).
- Someone forgot their password: send them a Reset link from Settings → Members.
- A Files space says File storage is not configured: the backend has no object storage bucket. Set one up as described for your install; see [Files spaces](repositories-and-integrations.md#files-spaces).
- Artifacts can be downloaded but not previewed: the installation has no preview host set. See [Files spaces](repositories-and-integrations.md#files-spaces).
- On Docker, a port is already in use: stop whatever uses 3000, 8888, 8890, 5432, 9000 or 9001, or change the port mapping in `docker-compose.yml`.
