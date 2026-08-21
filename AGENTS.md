# Echo Codex memo

After making and verifying code changes in this repository, redeploy the Echo
service(s) touched by the change with the current Docker Compose CLI:

```sh
docker compose up -d --build server   # server changes
docker compose up -d --build client   # client changes
```

If both modules were changed, redeploy both services. Use the repository's
root `docker-compose.yml` by default. Do not use the legacy `docker-compose`
executable or the legacy Compose setup. If Docker is unavailable, report that
the redeploy could not be completed rather than silently skipping it.
