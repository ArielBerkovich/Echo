# Echo Notifier Jenkins plugin

The plugin adds an `echoSend` Pipeline step and uses Echo's existing authenticated REST API.
The minimum supported Jenkins version is 2.516.3 (the 2025 LTS release); the Pipeline integration test runs against that baseline.

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

For a channel notification, the step can send a native Echo preview card and mention Echo users. Mentioned usernames are added to the message body, so Echo applies its normal mention notifications. Card attributes with `type: 'user'` (or `'person'`) render as people on the card; that visual attribute does not itself create a mention.

```groovy
echoSend(
  channel: 'builds',
  message: 'Deployment completed successfully.',
  mentions: ['user.c'],
  card: [
    title: 'Build #42',
    description: 'Deployment completed successfully.',
    url: 'https://jenkins.example/job/deploy/42/',
    color: 'green',
    attributes: [
      [label: 'Owner', value: 'user.c', type: 'user'],
      [label: 'Status', value: 'Success']
    ]
  ]
)
```

Exactly one of `channel` or `recipient` must be supplied. Store the Echo API token as a Jenkins Secret Text credential, then select it in the global Echo Notifier configuration.

`fields` is a map rendered as Markdown bullets, and `idempotencyKey` is forwarded to Echo for safe retries. Cards use Echo's message-card fields: `eyebrow`, `title`, `description`, `url`, `color`, `titleColor`, `timestamp`, and up to 12 `attributes` (`label`, `value`, and optional `type`). Echo validates the card when the message is sent. The plugin uses Echo's existing `/api/channels/:id/messages` and `/api/users/:username/messages` endpoints; no Echo API changes are required.
