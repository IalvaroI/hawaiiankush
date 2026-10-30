# Structure map

- `README.md`: how to configure, run and deploy the storefront. Start there.
- `src/`: browser application, organized by features, routes, layout, shared libraries, and UI components.
- `server/`: Node server, API proxy, session handling, metadata, and health checks. Runs on Node alone, no packages.
- `shared/`: utilities shared by browser and server code.
- `public/`: install assets, icons, site images, service worker, and storefront content (`content.json` holds the Learn page copy).
- `tests/`: unit, server, and browser tests; mock API and fixture data. `npm test` runs them all without touching a live store.
- `scripts/`: build verification, source checks, smoke checks (`smoke.mjs`), icon generation, and the VPS deploy script (`deploy.sh`).
- `deploy/`: systemd unit and nginx snippet for the VPS deploy.
- `Dockerfile`, `docker-compose.yml`: the container deploy.
- Root config: `package.json`, lockfile, Vite and Playwright configuration, `.env.example`, and the CI workflow.
