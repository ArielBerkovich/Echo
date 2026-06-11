# Echo Helm Chart

This chart deploys the Echo client, server, and optional bundled MongoDB and MinIO workloads.

## Default install

The default values deploy:

- the Echo client
- the Echo API server
- a single-node MongoDB replica set
- a MinIO instance with persistent storage

The client talks to the server through the in-cluster `SERVER_HOST` service name, and the server seeds its own bucket and database on startup.

## Install

```bash
helm install echo ./helm/echo \
  --set server.jwtSecret=change-me
```

For production, also set:

- `server.clientOrigin`
- `global.imageRegistry` or the individual image repositories/tags
- stronger MinIO credentials

## Use external MongoDB or MinIO

Disable the bundled workloads and provide your own endpoints:

```bash
helm install echo ./helm/echo \
  --set server.jwtSecret=change-me \
  --set mongodb.enabled=false \
  --set minio.enabled=false \
  --set server.mongoUri='mongodb://db1:27017,db2:27017/echo?replicaSet=rs0' \
  --set server.s3.endpoint='https://minio.example.com' \
  --set server.s3.accessKey='echo' \
  --set server.s3.secretKey='change-me' \
  --set server.clientOrigin='https://echo.example.com'
```

## Air-gapped deployments

Mirror or preload the container images in your own registry, then point the chart at that registry:

```bash
helm install echo ./helm/echo \
  --set global.imageRegistry=registry.local/echo \
  --set server.image.repository=server \
  --set client.image.repository=client \
  --set server.jwtSecret=change-me
```

If you disable MongoDB or MinIO, the chart stays valid, but you must provide the external connection settings above.
