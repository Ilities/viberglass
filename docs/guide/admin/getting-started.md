# Getting started

From nothing to a first app running on your own machine, then to a server your team can use. The first part takes a few minutes plus the downloads.

## Before you start

- Git, and Docker Engine 20.10 or newer with Docker Compose v2. On macOS and Windows, install Docker Desktop. On Linux, install [Docker Engine](https://docs.docker.com/engine/install/) and add your user to the `docker` group.
- A model key from an AI provider, a coding plan, or the address of a model you run yourself. See [Agents and models](agents-and-models.md) for what each agent can use.
- A GitHub account. Each app's code is kept in a private repository that Viberglass creates there.
- Free ports 3000, 8890, 8891, 9000 and 9001. [Ports](install-docker.md#ports) says how to use others.

## Start Viberglass

```bash
git clone https://github.com/Ilities/viberglass.git
cd viberglass
docker compose up -d
```

This downloads the published images and starts them with PostgreSQL and object storage. When it's up, open http://localhost:3000. If the page doesn't load yet, `docker compose logs -f backend` shows what the backend is doing.

## Set it up in the browser

1. Create the administrator account: your name, email and password.
2. Connect a model. Pick the provider that issued your key and paste it, or choose Custom endpoint for a model you run yourself. Setup checks the key before going on.
3. Choose App, the first choice offered. Use Create a token that can make repositories to open GitHub's token form with the permissions filled in, give it access to All repositories, generate it and paste it back. Then pick the owner, your account or an organisation, that the apps' repositories belong to.
4. Name the space. The name becomes the app's address, so `Laptop tracker` runs at `http://laptop-tracker.apps.localhost:8891`.
5. Wait for the agent. The first time, Viberglass downloads the agent's image, which takes a couple of minutes.
6. Start the first task. Setup suggests a laptop tracker; change the description to a tool you actually need.

To look around before connecting anything, choose Explore a demo workspace on the first screen. You can also try the hosted read-only demo at [demo.viberglass.io](https://demo.viberglass.io).

## Your first app

The task opens on its thread. The agent may ask you something there first; answer in the thread and it carries on. When it's done, the task's Change panel says Ready.

1. Choose Try it. The change starts on a preview of its own, with a copy of the app's data.
2. Choose Open preview and click through it. Ask for anything else in the thread, and try the new version when it's ready.
3. Choose Make it live. Viberglass builds a release, starts it and backs up its data from then on.
4. Open the app from the space's App tab.

Safari doesn't send `*.apps.localhost` addresses to your machine, so open apps in another browser. [Apps](../user/apps.md) covers previews, rolling back and who can open an app.

## Invite a colleague

The install above only listens on your machine and uses fixed keys, so it's for trying Viberglass alone. To use it with your team, run it on a server: [Install with Docker on a server](install-docker.md#on-a-server) needs a Linux machine and a domain name. Kubernetes and AWS are covered in [Install on Kubernetes](install-kubernetes.md) and [Install on AWS](install-aws.md).

On the server, add the [firewall rules for apps](install-docker.md#apps) before you build apps, then invite people from Settings → Members: enter their email, pick their role and the spaces they join, and send them the invite link. [People and access](people-and-access.md) explains the roles, including app users, who only open the apps they're given.

## Next

- [Tasks](../user/tasks.md): asking for something, from the web, Slack or an issue tracker.
- [Files and artifacts](../user/files-and-artifacts.md): a space for documents and presentations instead of an app.
- [Building and pull requests](../user/building-and-prs.md): a space on one of your own repositories, where agents open pull requests.
- [Troubleshooting](troubleshooting.md): when a run fails or an agent won't start.
