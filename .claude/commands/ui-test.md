---
description: Run tests from the manual end-to-end suite against a local instance in the browser.
---

# Viberglass UI testing

Runs tests from the manual end-to-end suite in `docs/testing/e2e-manual/` against a running instance, driving the browser with the agent-browser skill, and records the results.

## Usage

```
/ui-test <what>
```

`<what>` picks the tests:

- a test ID, such as `TASK-07` or `FILES-03`
- an area, such as `TASK`, `FILES`, `RUNNER` or `SLACK`: every test whose ID starts with it
- a suite file, such as `01` or `01-local-core`: every test in that file
- `smoke`: the smoke subset listed in the suite's README

With no argument, ask which tests to run.

## Before running

1. Read `docs/testing/e2e-manual/README.md`: environments, accounts, conventions and known blockers.
2. Read the suite file that holds the chosen tests. Follow each test's Needs: the environment (L-DEV, L-REV, L-NEW), accounts and earlier tests. If something it needs is missing, such as a token, a tunnel or a cloud account, mark the test `blocked`, say what's missing, and go on to the next one.
3. Tests that need a real model key, GitHub, Slack or a cloud account can cost money or touch external systems. List them and ask before running them.

## Running a test

- Sign in with the agent-browser login flow in `.agents/AGENTS.md`, section 9, using `.agent-browser-creds`. Use the URL of the test's environment, which isn't always http://localhost:3000.
- Do the numbered steps in order. Run `snapshot -i` after each page change before interacting, and wait for async data before checking anything.
- Compare what you see with the test's Expect. Anything else is a failure: note what you saw, the run ID (`/spaces/<space>/runs/<jobId>`) if there is one, and console or backend log lines.
- For a Known issue, record whether it still happens, and keep going.
- Skip tests marked Not available yet and record them as `n/a`.
- Take a screenshot of each failure.

## Results

Add a row per test to a results file named in the README's Results log format, such as `docs/testing/e2e-manual/results/<date>-local.md`, with the columns ID, Env, Date, Tester, Result (pass / fail / known issue / blocked / n/a), and Notes. Use "Claude" as the tester. Finish with a short summary of the failures and blocked tests.
