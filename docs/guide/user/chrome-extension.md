# Chrome extension

The Chrome extension files a task from the page where you found the problem, with a screenshot, an annotated area or element, a screen recording, and the page's console and network errors attached.

## Install it

The extension isn't in the Chrome Web Store. Build it from the Viberglass repository and load it unpacked:

```bash
npm install
npm run build -w @viberglass/chrome-extension
```

Then open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick `apps/chrome-extension/dist`.

In the extension's settings, enter your workspace's address and its API address. On a Docker install these are `http://localhost:3000` and `http://localhost:8888`. On Kubernetes and most other installs, both are your workspace's address. Then sign in with your Viberglass email and password.

## File a task

1. On the page with the problem, open the extension.
2. Capture what shows the problem: the visible tab, a selected area, or a clicked element. You can annotate the screenshot, or record the screen.
3. Collect the page's console errors, network errors and details if they help.
4. Pick the space, write a title and description, and set the severity.
5. To start the agent straight away, pick an agent and whether it starts with the plan or the build.
6. Create the task. The extension links to it in Viberglass.

<!-- screenshot: extension popup with a captured screenshot -->
