# MCP server

Viberglass has an MCP server, so an AI tool you already use, such as Claude, Cursor or another MCP client, can list and create tasks, read a plan, comment on it and start the agent. It acts as you, with your permissions.

## Connect a client

1. In Viberglass, open Settings → API tokens. Members and admins have it.
2. Create a token and copy it. It's shown once.
3. The page shows the client configuration to use. It looks like this:

```json
{
  "mcpServers": {
    "viberglass": {
      "url": "https://viberglass.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer <API_TOKEN>"
      }
    }
  }
}
```

Add it to your client's MCP settings. Delete the token in Settings → API tokens to cut the client off.

## What it can do

| Tool | What it does |
|---|---|
| `space_list` | Lists the spaces you can see. |
| `agent_list` | Lists the agents, with their harness and status. |
| `task_list` | Lists tasks, with optional filters. |
| `task_get` | Reads one task and where it stands. |
| `task_create` | Creates a task in a space. |
| `task_trigger` | Asks the agent for the plan or the build. |
| `task_review` | Reads the task's plan with its inline comments. |
| `task_review_comment` | Adds an inline comment to the plan. |
| `task_branch` | Gives the task's branch, repository and base branch, and who has taken the work over. |

A client might, for example, file a task from a conversation, ask for its plan, and come back later to read it and leave comments.
