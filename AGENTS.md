# Echo Codex memo

For the full containerized workflow, after making and verifying code changes
in this repository, redeploy the Echo service(s) touched by the change with
the current Docker Compose CLI:

```sh
docker compose up -d --build server   # server changes
docker compose up -d --build client   # client changes
```

If both modules were changed, redeploy both services. Use the repository's
root `docker-compose.yml` by default. Do not use the legacy `docker-compose`
executable or the legacy Compose setup. If Docker is unavailable, report that
the redeploy could not be completed rather than silently skipping it. For
client-only development, use the fast local workflow below instead of
rebuilding the client image after every edit.

## Fast local UI development

For client-side changes, run the UI on the host with Vite and use Compose only
for the backend and its dependencies. This provides hot reload and avoids
rebuilding the client image after every edit. Do not start the `client` service
for this workflow; the Docker client is the full containerized alternative and
is served at http://localhost:8090.

On the first run, or after backend image/dependency changes:

```sh
export JWT_SECRET=change-me   # alternatively, put JWT_SECRET in .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build \
  mongo mongo-init minio server
```

For subsequent client-only iterations, start the already-built services
without `--build`:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d \
  mongo mongo-init minio server
```

In a second terminal, start the host client (install dependencies only once):

```sh
npm --prefix client install
npm --prefix client run dev -- --host 0.0.0.0
```

Open http://localhost:5173. The development override publishes the server at
http://localhost:4000 and configures the client’s `/api` and `/socket.io`
proxies to use it. Keep the Vite process running while editing; changes under
`client/` are picked up without rebuilding an image. Stop the Compose services
when finished with:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml stop \
  server mongo-init minio mongo rhsso
```

If server code changes, rebuild the `server` service as described above; the
host Vite process can remain running.
