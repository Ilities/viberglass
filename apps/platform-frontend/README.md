# Platform Frontend

React frontend for the Viberglass platform, built with Vite.

From the repository root, `docker compose up` runs it together with the backend (see [docs/local-development.md](../../docs/local-development.md)). To run it on its own:

```bash
npm install
npm run dev -w @viberglass/frontend
```

http://localhost:3000

It calls the backend at `http://localhost:8888` unless you set `VITE_API_URL` (or `VITE_BACKEND_PORT` to change only the port). Other build-time variables are listed in `.env.production.example`.

`@viberglass/types` is loaded from source through a Vite alias, so changes to the shared types don't need a build first.
