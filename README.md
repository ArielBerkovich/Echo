# Echo

Echo is a lightweight team chat application built for secure, air-gapped environments.

It provides a Slack-style workspace experience without depending on external SaaS services. The app ships as a small Docker Compose stack with a React client, Node/Express API server, MongoDB, and MinIO-compatible object storage.

![Echo workspace](docs/images/workspace.png)

## Highlights

- Channels, private channels, direct messages, threads, reactions, pinned messages, saved messages, mentions, and activity.
- Rich message formatting with Markdown-style paste support.
- File uploads backed by S3-compatible storage through MinIO.
- Built-in REST API for automation and CI/CD notifications.
- Webhooks, idempotent message upserts, OpenAPI export, and API token support.
- Docker Compose deployment with no external runtime dependencies beyond the container images.

## Screenshots

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
- MongoDB inside Compose: `mongodb://mongo:27017/echo`
- MinIO inside Compose: `http://minio:9000`

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

## API And Automation

Echo includes an in-app API reference. Sign in, open the API page from the lower-left rail, generate an API token, and copy ready-to-run curl commands.

Useful automation features include:

- Posting messages by channel name or channel id.
- Updating the same logical message with `externalKey`.
- Safely retrying requests with `Idempotency-Key`.
- Grouping CI/CD updates into threads with `threadKey`.
- Receiving webhook posts through generated incoming webhook URLs.

## Air-Gapped Deployment Notes

For air-gapped environments, build or pull the required container images in a connected environment, transfer them to the target network, then run the same Compose stack there.

At runtime, Echo does not require external API calls for normal chat, API automation, uploads, or search.

## Repository Layout

```text
client/             React client
server/             Express and Socket.IO API server
docker-compose.yml  Local deployment stack
docs/images/        README screenshots
```
