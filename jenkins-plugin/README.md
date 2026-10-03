# Echo Notifier Jenkins plugin

The plugin adds an `echoSend` Pipeline step and uses Echo's existing authenticated REST API. It returns the Echo message ID on success. The minimum supported Jenkins version is 2.516.3 (the 2025 LTS release); CI tests the step on 2.516.3 and 2.584.

Configure the default Echo server URL and API-token credential at **Manage Jenkins → System → Echo Notifier**. The step accepts optional `serverUrl` and `credentialId` overrides when a job needs a different Echo instance or credential.

```groovy
def messageId = echoSend(
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
echo "Echo message ID: ${messageId}"

def reactionPresent = echoReact(
  channel: 'builds',
  messageId: messageId,
  emoji: '🚀',
  present: true
)
```

`echoReact` returns whether the current user has the reaction after the request. Pass `present: true` to ensure it is added, `present: false` to remove it, or omit `present` to toggle it. `channel` may be a channel name or ID.

Exactly one of `channel` or `recipient` must be supplied for `echoSend`. For a direct message, use `recipient: 'alice'` instead of `channel`. Store the Echo API token as a Jenkins Secret Text credential, then select it in the global Echo Notifier configuration.

`mentions` adds `@username` lines to the message body, which triggers Echo's normal mention behavior. Card attributes with `type: 'user'` (or `'person'`) display a person on the card but do not create a mention. `fields` is a map rendered as Markdown bullets, and `idempotencyKey` is forwarded to Echo for safe retries.

Cards use Echo's message-card fields: `eyebrow`, `title`, `description`, `url`, `color`, `titleColor`, `timestamp`, and up to 12 `attributes` (`label`, `value`, and optional `type`). Echo validates the card when the message is sent. The plugin uses Echo's existing `/api/channels/:id/messages` and `/api/users/:username/messages` endpoints; no Echo API changes are required.
