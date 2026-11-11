# viberglass

The `viberglass` command for [Viberglass](https://github.com/Ilities/viberglass). After you take over a task's work in Viberglass, it puts the task's branch in your git clone so you can carry on yourself.

```sh
npm install -g viberglass
export VIBERGLASS_URL=https://viberglass.example.com
export VIBERGLASS_TOKEN=<an API token from Settings → API tokens>
cd <a clone of the task's repository>
viberglass checkout WEB-42
```

It checks that the clone's origin is the task's repository, fetches the branch and switches to it. When the agent hasn't pushed the branch yet, it starts it from the base branch with the task's branch on origin as its upstream, so `git push` creates that branch rather than pushing to the base branch. Push your commits with `git push -u origin <branch>`, then hand the work back in Viberglass.

Needs Node.js 20 or later and git.
