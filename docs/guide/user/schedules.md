# Schedules

Schedules run agent work on a timer, such as updating dependencies every Monday or checking for security patches each night. Each space has its own task templates and schedules.

Open a space and choose Schedules in the sidebar. Members and admins can use it.

## Task templates

A task template is the work a schedule runs. Under Task Templates, choose New Task Template and fill in:

- Name, and an optional description.
- Agent runner: the agent that does the work.
- Task instructions: what the agent should do each time.
- Credentials: extra secrets the run needs, on top of the runner's own.

A template can be used by several schedules.

## Schedules

1. Under Schedules, choose New Schedule.
2. Give it a name and pick the task template. The template's instructions are filled in, and you can adjust them for this schedule.
3. Choose the schedule type. Interval runs every so many minutes, hours, days or weeks. Cron expression takes a six-part cron expression (seconds, minutes, hours, day, month, weekday), such as `0 0 9 * * 1` for 09:00 every Monday.
4. Pick the timezone and save it.

Each schedule shows whether it's active, when it last ran, and how many runs succeeded and failed. Pause stops it until you Resume it. A scheduled run works in the space's repository; if the agent changes code, it opens a pull request. The runs are listed under the space's Runs.

<!-- screenshot: Schedules tab with one active schedule -->
