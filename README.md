# Echo

![Echo — self-hosted team communication](docs/images/hero-banner-v2.png)

Echo is a self-hosted communication workspace for teams that need fast collaboration without giving up control of their data or infrastructure.

It brings channels, direct messages, threads, files, search, activity, and automation into one focused interface. Echo can run on an internal network or in a disconnected environment, with web and desktop clients backed by infrastructure you operate.

## What Echo includes

- **Focused conversations:** public and private channels, direct messages, threads, mentions, reactions, pins, saved messages, and VIP contacts.
- **Fast navigation:** unified search across messages, people, and channels; activity and saved-message views; public-channel discovery; and one-click conversation creation.
- **Rich messages:** formatted text, code blocks, quotes, lists, emoji, file uploads, message forwarding, and scheduled messages.
- **Automation-ready:** API tokens, webhooks, idempotent message upserts, thread keys, an OpenAPI export, and copy-ready curl examples in the app.
- **Infrastructure you control:** Docker Compose and Helm deployment paths, S3-compatible object storage, external MongoDB support, and no required external service calls during normal operation.
- **Multiple clients:** responsive web UI plus packaged desktop apps with automatic update support.

## A look inside

### Workspace

Channels and conversations stay close at hand while the main pane keeps the current discussion in focus.

![Echo channel workspace](docs/images/workspace-v2.png)

### Direct messages

Move between recent conversations or start a new one from the shared `+` action.

![Echo direct messages](docs/images/direct-messages.png)

### API Reference

Generate a token and explore the supported endpoints without leaving the app.

![Echo API reference](docs/images/api-reference-v2.png)

## Stack

- Client: React, Vite, TypeScript
- Desktop: Electron
- Server: Node.js, Express, TypeScript, Socket.IO
- Database: MongoDB
- Object storage: S3-compatible storage through MinIO
- Deployment: Docker Compose and Helm

## Quick Start

From the repository root:

```bash
docker compose up -d --build
```

If your host uses the legacy Compose binary:

```bash
docker-compose up -d --build
```

Then open:

```text
http://localhost:8090
```

The first account created becomes the workspace admin.

Prebuilt desktop packages and versioned deployment artifacts are available on
the [Releases](https://github.com/ArielBerkovich/Echo/releases) page.

### RHSSO demo

The separate RHSSO demo stack runs alongside the ordinary stack and includes
an imported Keycloak realm and test user:

```bash
docker compose -p echo-rhsso-demo -f docker-compose.rhsso.yml up -d --build
```

For the legacy Compose binary, replace `docker compose` with `docker-compose`.
Open `http://localhost:8091` and create the local `admin` account first. Log
out, choose **Sign in with RHSSO**, and use:

```text
Username: jane.doe
Password: UserPassword1
```

The Keycloak administration console is available at `http://localhost:8180`
with `admin` / `AdminPassword1`. Stop and remove the isolated demo data with:

```bash
docker compose -p echo-rhsso-demo -f docker-compose.rhsso.yml down -v
```

## Configuration

The Compose file includes local defaults for development. For production or shared environments, set strong secrets before deploying:

```bash
JWT_SECRET=change-me
MINIO_ROOT_USER=echo
MINIO_ROOT_PASSWORD=change-me
```

Common service URLs:

- Client: `http://localhost:8090`
- Server API inside Compose: `http://server:4000`
- MongoDB inside Compose: `mongodb://mongo:27017/echo?replicaSet=rs0`
- MinIO inside Compose: `http://minio:9000`

The bundled Compose stack starts MongoDB as a single-node replica set so transactions and other replica-set features work out of the box. To point Echo at an external MongoDB replica set or cluster, set `MONGO_URI` to a standard MongoDB URI such as `mongodb://db1:27017,db2:27017/echo?replicaSet=rs0` or `mongodb+srv://user:pass@cluster.example/echo`. The server retries connections during startup, so it can wait for the database to become ready.

## Development

To run the UI locally against the Docker Compose services, set `JWT_SECRET` (or
put it in `.env`) and run this from the repository root:

```bash
JWT_SECRET=change-me ./scripts/dev-ui.sh
```

Then open `http://localhost:5173`. The script starts MongoDB, MinIO, and the
API server, while Vite proxies `/api` and `/socket.io` to the server on port
4000. It leaves the containers stopped when the Vite process exits.

Install and run each package separately when developing outside Docker:

Server:

```bash
cd server
npm install
npm run dev
```

Client:

```bash
cd client
npm install
npm run dev
```

## Tests

Server:

```bash
cd server
npm test
npm run build
```

Client:

```bash
cd client
npm test
npm run build
npx playwright test
```

Real RHSSO integration tests:

```bash
docker compose -p echo-rhsso-e2e -f docker-compose.rhsso.yml up -d --build
curl -fsS -X POST http://127.0.0.1:8091/api/auth/register \
  -H 'Content-Type: application/json' \
  --data '{"username":"admin","password":"Password1"}'
cd client
ECHO_URL=http://localhost:8091 npm run test:e2e:rhsso
```

## Helm

The repository also includes a self-contained Helm chart at [helm/echo](helm/echo).

By default it deploys Echo plus bundled MongoDB and MinIO workloads. You can disable either dependency and point the server at your own services by setting:

- `mongodb.enabled=false`
- `minio.enabled=false`
- `server.mongoUri`
- `server.s3.endpoint`
- `server.s3.accessKey`
- `server.s3.secretKey`
- `server.clientOrigin`

See [helm/echo/README.md](helm/echo/README.md) for install examples and air-gapped registry configuration.

## API And Automation

Echo includes an in-app API reference. Sign in, open the API page from the lower-left rail, generate an API token, and copy ready-to-run curl commands.

Useful automation features include:

- Posting messages by channel name or channel id.
- Updating the same logical message with `externalKey`.
- Safely retrying requests with `Idempotency-Key`.
- Grouping CI/CD updates into threads with `threadKey`.

## Air-Gapped Deployment Notes

For air-gapped environments, build or pull the required container images in a connected environment, transfer them to the target network, then run the same Compose stack there.

At runtime, Echo does not require external API calls for normal chat, API automation, uploads, or search.

## Repository Layout

```text
client/             React client
electron/           Electron desktop shell
server/             Express and Socket.IO API server
helm/echo/          Self-contained Helm chart
docker-compose.yml  Local deployment stack
docs/images/        README screenshots
```

## Desktop app

Install the Electron shell dependencies, then start the desktop client. On
first launch it asks for the URL of the Echo backend and remembers it for later
launches:

```bash
cd electron
npm install
npm start
```

Build installers with `npm run dist` after installing the Electron
dependencies.

Tagged releases are built by `.github/workflows/release.yml`. Push a semantic
version tag such as `v0.10.0` to create a GitHub release containing the Windows
installer, Linux AppImage, and a versioned `echo-<version>.tgz`
Helm chart. The same workflow publishes `echo-client` and `echo-server` images
to Docker Hub with versioned tags and, for stable releases, `latest`. Configure
a `DOCKERHUB_USERNAME` repository variable and a `DOCKERHUB_TOKEN` repository
secret before tagging a release.

For local UI development, run Vite and use `npm run start:dev` instead. The
desktop app loads the bundled React UI and sends API/WebSocket traffic to the
backend URL. A managed deployment can skip the prompt with
`--echo-server-url=https://echo.example.com` or `ELECTRON_START_URL`. Desktop
notifications are handled by Electron, are suppressed while the window is
focused, and close automatically after five seconds.

### Desktop automatic updates

Packaged Windows NSIS and Linux AppImage builds check their configured Echo
deployment for updates shortly after launch and every four hours. Updates are
downloaded in the background; Echo prompts to restart once an update is ready.
Set `ECHO_DISABLE_AUTO_UPDATE=1` when launching the app to disable these checks.

Each versioned `echo-server` image produced by the release workflow embeds the
matching update feed:

```text
desktop-updates/
  windows/latest.yml
  windows/Echo Setup <version>.exe
  windows/Echo Setup <version>.exe.blockmap
  linux/latest-linux.yml
  linux/Echo-<version>.AppImage
```

Echo Server exposes these embedded files at `/api/desktop-updates`. Update
manifests are not cached; versioned artifacts are cached immutably. Docker
Compose and Helm require no update-specific volume or configuration—deploy the
server image with the same version as the desktop/client release. Local source
builds contain an empty feed unless files are placed in `desktop-updates/`
before building the server image.

macOS automatic updates are not enabled until signed and notarized release
builds are added. Existing installations older than the first updater-enabled
release need one manual upgrade before they can update this way. On Windows,
uninstalling Echo removes its complete application-data directory, including
the saved backend URL, login session, caches, and local preferences.
