# Echo

![Echo hero banner](docs/images/hero-banner.png)

Echo is a self-hosted team chat platform for secure networks, air-gapped deployments, and infrastructure that needs to stay under your control.

It ships as a compact Docker Compose stack with a React client, Node/Express API server, MongoDB, and MinIO-compatible object storage. The system is designed to run without external SaaS dependencies and can also connect to a replica set or cluster through a standard MongoDB URI.

## Capabilities

- Channels, private channels, direct messages, threads, reactions, pinned messages, saved messages, mentions, and activity tracking.
- Rich message formatting with Markdown-style paste support.
- File uploads backed by S3-compatible storage through MinIO.
- Built-in REST API for automation, notifications, and CI/CD workflows.
- Webhooks, idempotent message upserts, OpenAPI export, and API token support.
- Docker Compose deployment with no external runtime dependencies beyond the container images.
- MongoDB URI support for standalone deployments, replica sets, and cluster/SRV connections.

## Screenshots

### Workspace

![Echo workspace](docs/images/workspace.png)

### Login

![Echo login](docs/images/login.png)

### API Reference

![Echo API reference](docs/images/api-reference.png)

## Stack

- Client: React, Vite, TypeScript
- Server: Node.js, Express, TypeScript, Socket.IO
- Database: MongoDB
- Object storage: MinIO
- Deployment: Docker Compose

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

Install and run each package separately when developing outside Docker.

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

## Helm

The repository also includes a self-contained Helm chart at [helm/echo](/home/ariel/repositories/Echo/helm/echo).

By default it deploys Echo plus bundled MongoDB and MinIO workloads. You can disable either dependency and point the server at your own services by setting:

- `mongodb.enabled=false`
- `minio.enabled=false`
- `server.mongoUri`
- `server.s3.endpoint`
- `server.s3.accessKey`
- `server.s3.secretKey`
- `server.clientOrigin`

See [helm/echo/README.md](/home/ariel/repositories/Echo/helm/echo/README.md) for install examples and air-gapped registry configuration.

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
server/             Express and Socket.IO API server
helm/echo/          Self-contained Helm chart
docker-compose.yml  Local deployment stack
docs/images/        README screenshots
```
