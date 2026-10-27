# Home and notifications

Home shows what needs you; Overview shows how work is going across the workspace. This page also covers the Slack DMs and emails Viberglass sends, and how to turn them on.

## Home

Home is where you land. At the top it says how many requests need your attention. The sidebar count shows new requests you have not yet acknowledged or set aside.

Needs you lists the tasks where it's your move. Each row says why:

- Agent asked you: the agent has a question for you.
- Ready for your review: the agent finished its work and asked you to look at it.
- A name, such as "Maria mentioned you": someone mentioned you.
- An agent failure needs you to resolve it.

Your conversations lists the other tasks you're on, newest activity first. Show filters them: All, Unread, or I own. A number on a row counts its new messages. Owning a task or having an open pull request does not by itself create a new request.

Ask for something starts a new task. See [Tasks](tasks.md).

![Home, listing an agent question and two mentions under Needs you](../images/home-needs-you.png)

### Acknowledge a mention

If a mention needs no reply, choose Acknowledge mention, on Home or on the task. It stops being your move. The task itself is unchanged.

### Set a request aside

Choose **Keep in Now** to clear the new-request indicator while keeping the request in your list. Choose **Later**, then **Remind me** to set a reminder, or **Waiting on a discussion** to record what you're waiting for. Waiting can stay aside until you bring it back, or have a reminder. A reminder returns the request to Now when its time arrives. Find set-aside requests under Waiting or Later and choose **Return to Now** when you're ready.

These choices apply to your request. The waiting note is visible only to you; it does not change the task, pause an agent, answer its question, or set a shared dependency for colleagues. Replies in an external discussion do not automatically bring it back. A new request on the same task can still appear.

Home previews five tasks in each request list and five conversations, with **View all** to expand. Work in motion and Recent outcomes summarize your conversations alongside the queue; Home's outcomes are completed conversations, without Overview's seven-day filter.

### Next steps

After setup, admins see a short Next steps list on Home: invite your team, connect Slack, connect your tracker. Each item ticks itself off when it's done, and the list can be dismissed.

## Overview

Overview shows the tasks in every space you can see, each counted once:

- Needs attention: failed, paused on a setup problem, or asking a question. Each one names its next move.
- Agent working: tasks an agent is working on.
- Waiting on people: someone's move, including longer discussions.
- Not started: nothing asked for yet.

It also shows recent outcomes with a completion event from the last seven days. Filter it to one space at the top. Secondary task groups start collapsed; select a summary count to open its group. Viewers land on Overview instead of Home.

Each space opens on **Summary**, with its attention requests, agent activity, waiting work, and recent outcomes. **Tasks** retains the full task browser and filters; existing filtered space links open Tasks. The existing Files and Artifacts tabs remain available in Files spaces, alongside Schedules, Track record, Runs, and Settings or About where your access allows them.

## Notifications

Viberglass tells people about changes on their tasks. You aren't told about your own actions.

- Review requests, when you're added as a reviewer.
- New tasks you're made owner of.
- Mentions, including when the agent mentions you with its result.
- The agent's questions to you.
- Finished plans and builds, for the requester, owner and watchers.
- Failed runs: to the task's owner, or to workspace admins when the setup needs fixing.
- Merged pull requests and finished tasks, for the requester and owner.

Everything that needs you shows on Home. Beyond that, where notifications go depends on what your workspace has set up:

- Slack DMs, for people who linked their Slack account: review requests, mentions, questions, new tasks you own and failed runs. Progress on a task that started in Slack is posted in its Slack thread instead of a DM.
- Email, when the workspace has email set up: failed setups and finished tasks.

## Settings → Notifications

Open Settings → Notifications to see what's set up for you.

- Slack: choose Link Slack to connect your Slack account. Viberglass finds you in Slack by your email address, so it needs to match. Unlink stops the DMs.
- Email: shows the address messages go to, or says email isn't set up on the workspace. Admins can choose Send test email to check delivery.
