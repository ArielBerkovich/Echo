# Echo Notifier Jenkins plugin

The plugin adds an `echoSend` Pipeline step and uses Echo's existing authenticated REST API.

Configure the default Echo server URL and API-token credential at **Manage Jenkins → System → Echo Notifier**. The step accepts optional `serverUrl` and `credentialId` overrides when a job needs a different Echo instance or credential.

```groovy
echoSend(
  recipient: 'alice',
  message: 'Your build completed',
  status: 'success',
  title: 'Backend build',
  failOnError: true
)
```

Exactly one of `channel` or `recipient` must be supplied. Store the Echo API token as a Jenkins Secret Text credential, then select it in the global Echo Notifier configuration.

For a channel notification, use `channel: 'builds'` instead of `recipient`. `fields` is a map rendered as Markdown bullets, and `idempotencyKey` is forwarded to Echo for safe retries. The plugin uses Echo's existing `/api/channels/:id/messages` and `/api/users/:username/messages` endpoints; no Echo API changes are required.
